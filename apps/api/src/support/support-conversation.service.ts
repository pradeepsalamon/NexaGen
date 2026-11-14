import { Injectable, Logger } from "@nestjs/common";
import { getApiEnv, getFrontendUrl } from "@nexa-chess/config/api";
import {
  DEFAULT_SUPPORT_OUT_OF_HOURS_MESSAGE,
  SUPPORT_FLOW_STATES,
  SUPPORT_FLOW_VERSION,
  SUPPORT_TICKET_REFERENCE_PLACEHOLDER,
  supportHoursOpen,
  supportReplyText,
  transitionSupport,
  type SupportBotAnswer,
  type SupportDraft,
  type SupportFlowState,
  type SupportInput
} from "@nexa-chess/types";
import { ClassStatus, MessageChannel, MessageDeliveryStatus, Prisma, type Lead, type SupportConversation, type SupportTicket, type WhatsAppContact, type WhatsAppWebhookEvent } from "@prisma/client";
import { DEFAULT_TIME_ZONE } from "../common/time";
import { DemoInviteService, demoInvitePath } from "../demo-class/demo-invite.service";
import { FrappeCrmPushService } from "../lead/frappe-crm-push.service";
import { LeadService } from "../lead/lead.service";
import { PrismaService, type PrismaTransactionClient } from "../prisma/prisma.service";
import { requireTenantId } from "../tenancy/tenant-sql";
import { SupportAttachmentsService, supportFileKindOf } from "./support-attachments.service";
import { SupportDemoSlotsService, supportSlotTitle } from "./support-demo-slots.service";
import { SupportOutboxService } from "./support-outbox.service";
import { SupportSettingsService } from "./support-settings.service";
import { SupportTicketsService } from "./support-tickets.service";
import { SupportUnansweredService } from "./support-unanswered.service";

/** A slot the parent confirmed, booked after the bot's transaction commits. */
type DemoSlotBooking = { classId: string; conversationId: string; leadId: string; ticketId: string };

/** A bot conversation silent this long is closed; the next message starts a new one. */
export const SUPPORT_CONVERSATION_EXPIRY_MS = 24 * 60 * 60 * 1000;
/** WhatsApp's customer-service window: free-form replies only within it. */
export const WHATSAPP_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

const STATUS_RANK: Record<string, number> = { DELIVERED: 2, PENDING: 0, READ: 3, SENT: 1 };

function isFlowState(value: string): value is SupportFlowState {
  return (SUPPORT_FLOW_STATES as readonly string[]).includes(value);
}

/** An image or PDF the API keeps for staff (supportFileKindOf on Meta's declared type; the bytes are checked on download). */
function keptMedia(event: WhatsAppWebhookEvent): boolean {
  return Boolean(event.mediaId && supportFileKindOf(event.mediaMimeType));
}

function inputOf(event: WhatsAppWebhookEvent): SupportInput {
  if (event.replyId) return { id: event.replyId, kind: "reply" };
  if (event.text) return { kind: "text", text: event.text };
  if (keptMedia(event)) return { kind: "media" };
  return { kind: "unsupported" };
}

/** The transcript line for an incoming message. */
function inboundBody(event: WhatsAppWebhookEvent): string {
  if (event.text) return event.text;
  if (keptMedia(event)) {
    const label = supportFileKindOf(event.mediaMimeType) === "pdf" ? `[PDF${event.mediaFilename ? `: ${event.mediaFilename}` : ""}]` : "[Image]";
    return event.mediaCaption ? `${label} ${event.mediaCaption}` : label;
  }
  return `[${event.messageType ?? "message"}]`;
}

/**
 * Runs the bot for one incoming message (docs/WHATSAPP_SUPPORT.md §4): one
 * transaction holding the contact's lock, so two quick messages from the same
 * person are handled one after the other; the pure `transitionSupport` decides
 * the replies; outgoing rows are written PENDING and sent after commit.
 */
@Injectable()
export class SupportConversationService {
  private readonly env = getApiEnv();

  private readonly logger = new Logger(SupportConversationService.name);

  constructor(
    private readonly attachments: SupportAttachmentsService,
    private readonly crmPush: FrappeCrmPushService,
    private readonly demoInvites: DemoInviteService,
    private readonly demoSlots: SupportDemoSlotsService,
    private readonly leads: LeadService,
    private readonly outbox: SupportOutboxService,
    private readonly prisma: PrismaService,
    private readonly settings: SupportSettingsService,
    private readonly tickets: SupportTicketsService,
    private readonly unanswered: SupportUnansweredService
  ) {}

  /** The academy's answers the bot may send, in menu order. */
  botAnswers(): Promise<SupportBotAnswer[]> {
    // Every bot answer can be matched by a keyword; the list shows only the first few.
    return this.prisma.supportSavedReply.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      select: { body: true, description: true, id: true, keywords: true, title: true },
      where: { showInBot: true }
    });
  }

  /** Call inside the event's academy. Throws on a database error so the event is retried. */
  async handleMessage(event: WhatsAppWebhookEvent): Promise<void> {
    const now = new Date();
    const tenantId = requireTenantId("whatsapp contact");
    const academy = await this.prisma.tenant.findUnique({ select: { name: true }, where: { id: tenantId } });
    const answers = await this.botAnswers();
    const settings = await this.settings.current();
    const origin = await this.demoSlots.academyOrigin();
    const contact = await this.prisma.whatsAppContact.upsert({
      create: { lastInboundAt: event.occurredAt, profileName: event.profileName, waId: event.waId },
      update: {
        lastInboundAt: event.occurredAt,
        ...(event.profileName ? { profileName: event.profileName } : {})
      },
      where: { tenantId_waId: { tenantId, waId: event.waId } }
    });

    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`support-contact:${contact.id}`}))`;

      // Meta can retry a message the event table already let through once (a
      // lost lease): the transcript's unique wamid makes the second run a no-op.
      const seen = await tx.supportMessage.findUnique({ select: { id: true }, where: { providerMessageId: event.providerMessageId } });
      if (seen) return null;

      const conversation = await this.openConversation(tx, contact.id, now);
      const idle =
        conversation.lastInboundAt !== null &&
        now.getTime() - conversation.lastInboundAt.getTime() > this.env.SUPPORT_SESSION_TIMEOUT_MINUTES * 60_000;

      const inbound = await tx.supportMessage.create({
        data: {
          author: "CUSTOMER",
          body: inboundBody(event),
          conversationId: conversation.id,
          direction: "INBOUND",
          interactiveId: event.replyId,
          providerMessageId: event.providerMessageId,
          status: "RECEIVED"
        }
      });
      // Fetched from Meta after commit; staff open it from the transcript.
      const attachment =
        keptMedia(event) && event.mediaId
          ? await tx.supportAttachment.create({
              data: { filename: event.mediaFilename, mediaId: event.mediaId, messageId: inbound.id, mimeType: event.mediaMimeType },
              select: { id: true }
            })
          : null;

      // Real demo times, read only while a booking is under way.
      const state = isFlowState(conversation.state) ? conversation.state : "MAIN_MENU";
      const demoSlots = state.startsWith("DEMO_") || state === "RESUME_PROMPT" ? await this.demoSlots.upcoming(now) : [];
      const next = transitionSupport(
        {
          draft: (conversation.draft ?? {}) as SupportDraft,
          state: isFlowState(conversation.state) ? conversation.state : "MAIN_MENU",
          status: conversation.status
        },
        inputOf(event),
        {
          academyName: academy?.name ?? "academy",
          answers,
          demoSlots,
          idle,
          privacyUrl: `${origin ?? getFrontendUrl(this.env)}/privacy`,
          redacted: wasRedacted(event.text)
        }
      );

      let ticket: SupportTicket | null = null;
      let booking: DemoSlotBooking | null = null;
      let announce = false;
      let newLead: Lead | null = null;
      const unansweredTexts: string[] = [];
      for (const action of next.actions) {
        if (action.kind === "TICKET") {
          const lead = action.demo
            ? await this.leads.upsertFromWhatsApp(tx, {
                ...action.demo,
                now,
                phone: leadPhoneFromWaId(contact.waId, this.env.WHATSAPP_DEFAULT_COUNTRY_CODE)
              })
            : null;
          const opened = await this.tickets.openFromBot(tx, {
            action,
            contactId: contact.id,
            conversationId: conversation.id,
            leadId: lead?.lead.id ?? null,
            now,
            sourceKey: event.providerMessageId
          });
          ticket = opened.ticket;
          announce = opened.created;
          if (action.demo?.slotClassId && lead) {
            booking = { classId: action.demo.slotClassId, conversationId: conversation.id, leadId: lead.lead.id, ticketId: opened.ticket.id };
          }
          if (lead?.created) {
            newLead = lead.lead;
            await this.crmPush.enqueue(tx, lead.lead.id);
          }
        } else if (action.kind === "UNANSWERED") {
          unansweredTexts.push(action.text);
        } else if (action.kind === "OPT_OUT") {
          await tx.whatsAppContact.update({ data: { optedOutAt: now }, where: { id: contact.id } });
        } else if (action.kind === "OPT_IN") {
          await tx.whatsAppContact.update({ data: { optedOutAt: null }, where: { id: contact.id } });
        }
      }

      // A message while staff own the conversation keeps its ticket at the top of the inbox.
      if (!ticket && (next.status === "WAITING_AGENT" || next.status === "AGENT")) {
        await tx.supportTicket.updateMany({
          data: { updatedAt: now },
          where: { conversationId: conversation.id, status: { not: "RESOLVED" } }
        });
      }

      await tx.supportConversation.update({
        data: {
          draft: next.draft as Prisma.InputJsonValue,
          flowVersion: SUPPORT_FLOW_VERSION,
          lastInboundAt: now,
          state: next.state,
          status: next.status
        },
        where: { id: conversation.id }
      });

      // Handed to staff by this message while the team is away: say so, in the
      // academy's own words (docs/WHATSAPP_SUPPORT_MODES_PLAN.md D12).
      const replies =
        next.status === "WAITING_AGENT" && conversation.status !== "WAITING_AGENT" && !supportHoursOpen(settings.hours, now)
          ? [...next.replies, { body: settings.outOfHoursMessage ?? DEFAULT_SUPPORT_OUT_OF_HOURS_MESSAGE, kind: "text" as const }]
          : next.replies;
      const reference = ticket?.reference ?? "";
      for (const [index, reply] of replies.entries()) {
        const filled = fillReference(reply, reference);
        await tx.supportMessage.create({
          data: {
            author: "BOT",
            body: supportReplyText(filled),
            clientKey: `bot:${event.providerMessageId}:${index}`,
            conversationId: conversation.id,
            direction: "OUTBOUND",
            payload: filled.kind === "text" ? Prisma.JsonNull : (filled as unknown as Prisma.InputJsonValue),
            status: "PENDING"
          }
        });
      }

      return { announce, attachmentId: attachment?.id ?? null, booking, conversationId: conversation.id, newLead, ticket, unansweredTexts };
    });

    if (!outcome) return;
    await this.outbox.sendPending(outcome.conversationId);
    if (outcome.attachmentId) await this.attachments.store(outcome.attachmentId);
    if (outcome.booking) await this.bookDemoSlot(outcome.booking, contact.id, origin);
    // Best effort, outside the bot's transaction: a lost count never costs a reply.
    if (outcome.unansweredTexts.length > 0) await this.unanswered.record(outcome.unansweredTexts, now);
    // One alert per booking: a new lead is announced as a lead (NEW_LEAD_ADMIN,
    // like the website form); anything else as a support ticket.
    if (outcome.newLead) {
      await this.leads.announceNewLead(outcome.newLead);
      await this.crmPush.pushLead(outcome.newLead.id);
    }
    else if (outcome.announce && outcome.ticket) await this.tickets.announce(outcome.ticket, contact);
  }

  /**
   * Books the demo class the parent picked, after their request is saved
   * (docs/WHATSAPP_SUPPORT_MODES_PLAN.md Phase C). Only a booking that
   * succeeded is announced as booked, with the class time and join link; the
   * request then needs no staff and is resolved. Otherwise the parent hears
   * that staff will fix a time, and the request stays with them.
   */
  private async bookDemoSlot(booking: DemoSlotBooking, contactId: string, origin: string | null): Promise<void> {
    let booked: { body: string; when: string } | null = null;
    try {
      const demoClass = await this.demoInvites.getInvitableClass(booking.classId);
      if (demoClass.status !== ClassStatus.SCHEDULED || demoClass.startsAt.getTime() <= Date.now()) {
        throw new Error("the class has started or changed");
      }
      const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id: booking.leadId } });
      const { inviteToken } = await this.demoInvites.bookLead(demoClass, lead, null);
      const schedule = demoClass.demoScheduleId
        ? await this.prisma.demoSchedule.findUnique({ select: { timezone: true }, where: { id: demoClass.demoScheduleId } })
        : null;
      const when = supportSlotTitle(demoClass.startsAt, schedule?.timezone ?? DEFAULT_TIME_ZONE);
      const topic = demoClass.topic ? ` (${demoClass.topic})` : "";
      const link = origin ? `${origin}${demoInvitePath(demoClass.id, inviteToken)}` : null;
      booked = {
        body: [
          `You're booked: free demo class on ${when}${topic}.`,
          link ? `Join from this link at class time: ${link}` : "We'll send you the joining link before the class.",
          "Reply MENU if you need anything else."
        ].join("\n"),
        when
      };
    } catch (error) {
      this.logger.warn(`Demo booking for ticket ${booking.ticketId} failed: ${(error as Error).message}`);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`support-contact:${contactId}`}))`;
      await tx.supportMessage.create({
        data: {
          author: "BOT",
          body:
            booked?.body ??
            "Sorry, we couldn't book that time; it may have just changed. Our team will message you here soon to fix a time.",
          clientKey: `demo-booking:${booking.ticketId}`,
          conversationId: booking.conversationId,
          direction: "OUTBOUND",
          status: "PENDING"
        }
      });
      if (!booked) return;
      // Nothing left for staff: the bot has the conversation again.
      await tx.supportConversation.updateMany({
        data: { draft: {}, state: "DONE", status: "BOT" },
        where: { id: booking.conversationId, status: "WAITING_AGENT" }
      });
      await tx.supportTicket.update({ data: { resolvedAt: new Date(), status: "RESOLVED" }, where: { id: booking.ticketId } });
      await tx.supportTicketEvent.create({
        data: { body: `The WhatsApp bot booked this demo class: ${booked.when}.`, kind: "STATUS_CHANGED", ticketId: booking.ticketId }
      });
    });
    await this.outbox.sendPending(booking.conversationId);
  }

  /**
   * A delivery update for one of our messages: only ever moves forward (FAILED
   * always wins). Not a support message: a messaging-rule or system message
   * (`message_deliveries`), which gets the same news.
   */
  async handleStatus(event: WhatsAppWebhookEvent): Promise<void> {
    const status = (event.status ?? "").toUpperCase();
    const message = await this.prisma.supportMessage.findUnique({ where: { providerMessageId: event.providerMessageId } });
    if (!message) {
      await this.recordDeliveryStatus(event.providerMessageId, status, event.statusError, event.occurredAt);
      return;
    }
    if (message.direction !== "OUTBOUND") return;

    if (status === "FAILED") {
      await this.prisma.supportMessage.update({
        data: { error: (event.statusError ?? "WhatsApp could not deliver the message.").slice(0, 500), status: "FAILED" },
        where: { id: message.id }
      });
      return;
    }
    const rank = STATUS_RANK[status];
    if (rank === undefined || message.status === "FAILED" || rank <= (STATUS_RANK[message.status] ?? 0)) return;
    await this.prisma.supportMessage.update({
      data: { status: status as "DELIVERED" | "READ" | "SENT" },
      where: { id: message.id }
    });
  }

  /** A status for a `message_deliveries` row (rules, announcements): read implies delivered; a late failure marks it FAILED. */
  private async recordDeliveryStatus(providerMessageId: string, status: string, error: string | null, at: Date): Promise<void> {
    const where = { channel: MessageChannel.WHATSAPP, providerMessageId, status: MessageDeliveryStatus.SENT };
    if (status === "FAILED") {
      await this.prisma.messageDelivery.updateMany({
        data: { error: `WhatsApp couldn't deliver it: ${error ?? "no reason given"}`.slice(0, 500), status: MessageDeliveryStatus.FAILED },
        where
      });
    } else if (status === "DELIVERED") {
      await this.prisma.messageDelivery.updateMany({ data: { deliveredAt: at }, where: { ...where, deliveredAt: null } });
    } else if (status === "READ") {
      await this.prisma.messageDelivery.updateMany({ data: { deliveredAt: at }, where: { ...where, deliveredAt: null } });
      await this.prisma.messageDelivery.updateMany({ data: { readAt: at }, where: { ...where, readAt: null } });
    }
  }

  /**
   * The contact's open conversation, or a new one. A bot conversation silent
   * for a day is closed first (its draft is dropped); one with staff never
   * expires on its own.
   */
  private async openConversation(tx: PrismaTransactionClient, contactId: string, now: Date): Promise<SupportConversation> {
    const open = await tx.supportConversation.findFirst({ where: { contactId, status: { not: "CLOSED" } } });
    if (open) {
      const expired =
        open.status === "BOT" &&
        open.lastInboundAt !== null &&
        now.getTime() - open.lastInboundAt.getTime() > SUPPORT_CONVERSATION_EXPIRY_MS;
      if (!expired) return open;
      await tx.supportConversation.update({ data: { closedAt: now, status: "CLOSED" }, where: { id: open.id } });
    }
    return tx.supportConversation.create({ data: { contactId, flowVersion: SUPPORT_FLOW_VERSION, state: "START" } });
  }
}

/**
 * The phone a WhatsApp lead is stored with: the national number when it is in
 * the academy's default country (as the website's demo form stores it), else
 * the full international number.
 */
export function leadPhoneFromWaId(waId: string, defaultCountryCode: string | undefined): string {
  const digits = waId.replace(/\D/g, "");
  const code = (defaultCountryCode ?? "").replace(/\D/g, "");
  return code && digits.startsWith(code) && digits.length - code.length === 10 ? digits.slice(code.length) : digits;
}

/** The parser replaced a card number or code in this text (redactSupportText's markers). */
export function wasRedacted(text: string | null): boolean {
  return Boolean(text && /\[(card number )?removed\]/.test(text));
}

function fillReference<T extends { body: string }>(reply: T, reference: string): T {
  return reply.body.includes(SUPPORT_TICKET_REFERENCE_PLACEHOLDER)
    ? { ...reply, body: reply.body.split(SUPPORT_TICKET_REFERENCE_PLACEHOLDER).join(reference) }
    : reply;
}

/** When the contact's free-form reply window closes, or null when it already has. */
export function replyWindowEndsAt(contact: Pick<WhatsAppContact, "lastInboundAt">, now: Date = new Date()): Date | null {
  if (!contact.lastInboundAt) return null;
  const ends = new Date(contact.lastInboundAt.getTime() + WHATSAPP_REPLY_WINDOW_MS);
  return ends > now ? ends : null;
}

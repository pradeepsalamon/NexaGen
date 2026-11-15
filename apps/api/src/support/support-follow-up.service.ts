import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { getApiEnv, getFrontendUrl } from "@nexa-chess/config/api";
import {
  DEFAULT_TENANT_ID,
  SUPPORT_CATEGORY_LABELS,
  supportNudgeMessage,
  supportReplyText,
  type SupportFlowState
} from "@nexa-chess/types";
import { Prisma, type SupportTicket, type WhatsAppContact } from "@prisma/client";
import { SystemNotifier } from "../mail/system-notifier.service";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";
import { forEachTenant } from "../tenancy/for-each-tenant";
import { runInTenant } from "../tenancy/tenant-context";
import { leadPhoneFromWaId, WHATSAPP_REPLY_WINDOW_MS } from "./support-conversation.service";
import { SupportOutboxService } from "./support-outbox.service";
import { type EffectiveSupportSettings, SupportSettingsService, supportAnswersNumber } from "./support-settings.service";
import { supportContactLabel } from "./support-tickets.service";

const HOUR_MS = 60 * 60 * 1000;
/** The second reminder goes when this little of the 24-hour reply window is left. */
export const SUPPORT_WINDOW_WARNING_MS = 2 * HOUR_MS;
/** A nudge is never sent this close to the window closing (the send may be retried for a while). */
const NUDGE_WINDOW_MARGIN_MS = 30 * 60_000;
const BATCH = 100;

/** States that mean "asked about classes, hasn't booked". */
export const SUPPORT_NUDGE_STATES: readonly SupportFlowState[] = [
  "COURSE_MENU",
  "DEMO_STUDENT",
  "DEMO_AGE",
  "DEMO_LEVEL",
  "DEMO_PARENT",
  "DEMO_TIME",
  "DEMO_CONFIRM"
];

/**
 * Which staff reminder a ticket is due, or null. 1 = nobody has replied
 * `reminderMinutes` after it opened; 2 = still nobody, and the customer's
 * 24-hour reply window closes within SUPPORT_WINDOW_WARNING_MS.
 */
export function supportReminderDue(
  ticket: Pick<SupportTicket, "createdAt" | "remindersSent">,
  lastInboundAt: Date | null,
  now: Date,
  reminderMinutes: number
): 1 | 2 | null {
  if (reminderMinutes <= 0) return null;
  if (ticket.remindersSent === 0) {
    return now.getTime() - ticket.createdAt.getTime() >= reminderMinutes * 60_000 ? 1 : null;
  }
  if (ticket.remindersSent === 1 && lastInboundAt) {
    const closes = lastInboundAt.getTime() + WHATSAPP_REPLY_WINDOW_MS;
    const left = closes - now.getTime();
    return left > 0 && left <= SUPPORT_WINDOW_WARNING_MS ? 2 : null;
  }
  return null;
}

/**
 * Whether the bot's one follow-up is due: the parent asked about classes, went
 * quiet for `nudgeHours`, and the free reply window is still open.
 */
export function supportNudgeDue(
  conversation: { status: string; state: string; nudgedAt: Date | null; lastInboundAt: Date | null },
  now: Date,
  nudgeHours: number
): boolean {
  if (nudgeHours <= 0 || conversation.status !== "BOT" || conversation.nudgedAt || !conversation.lastInboundAt) return false;
  if (!(SUPPORT_NUDGE_STATES as readonly string[]).includes(conversation.state)) return false;
  const quietMs = now.getTime() - conversation.lastInboundAt.getTime();
  return quietMs >= nudgeHours * HOUR_MS && quietMs < WHATSAPP_REPLY_WINDOW_MS - NUDGE_WINDOW_MARGIN_MS;
}

/**
 * Quick follow-ups on WhatsApp enquiries (docs/WHATSAPP_SUPPORT.md §0):
 * admins are reminded about requests nobody has answered, and a parent who
 * asked about classes but didn't book gets one nudge inside the free window.
 */
@Injectable()
export class SupportFollowUpService {
  private readonly logger = new Logger(SupportFollowUpService.name);
  private readonly env = getApiEnv();

  constructor(
    private readonly jobLocks: JobLockService,
    private readonly notifier: SystemNotifier,
    private readonly outbox: SupportOutboxService,
    private readonly prisma: PrismaService,
    private readonly settings: SupportSettingsService
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    await this.jobLocks.runExclusive(JOB_LOCKS.supportFollowUps, async () => {
      const now = new Date();
      await this.remindStaff(now);
      await this.nudgeParents(now);
    });
  }

  /**
   * Reminds admins about tickets nobody has replied to, academy by academy
   * (each has its own reminder minutes). Each reminder is claimed before it is sent.
   */
  async remindStaff(now: Date): Promise<number> {
    let sent = 0;
    await forEachTenant(this.prisma, "job:support.staff-reminders", async () => {
      sent += await this.remindStaffInAcademy(now, (await this.settings.current()).staffReminderMinutes);
    });
    return sent;
  }

  private async remindStaffInAcademy(now: Date, minutes: number): Promise<number> {
    if (minutes <= 0) return 0;
    const candidates = await this.prisma.supportTicket.findMany({
      include: { contact: true },
      orderBy: { createdAt: "asc" },
      take: BATCH,
      where: {
        conversation: { status: "WAITING_AGENT" },
        createdAt: { lte: new Date(now.getTime() - minutes * 60_000) },
        remindersSent: { lt: 2 },
        status: "OPEN"
      }
    });

    let sent = 0;
    for (const ticket of candidates) {
      const stage = supportReminderDue(ticket, ticket.contact.lastInboundAt, now, minutes);
      if (!stage) continue;
      await runInTenant(ticket.tenantId ?? DEFAULT_TENANT_ID, "job:support.staff-reminder", async () => {
        const claim = await this.prisma.supportTicket.updateMany({
          data: { lastReminderAt: now, remindersSent: stage },
          where: { id: ticket.id, remindersSent: stage - 1, status: "OPEN" }
        });
        if (claim.count === 0) return;
        await this.sendReminder(ticket, ticket.contact, stage);
        sent += 1;
      });
    }
    return sent;
  }

  /** Sends the one follow-up to parents who asked about classes and went quiet, academy by academy. */
  async nudgeParents(now: Date): Promise<number> {
    let sent = 0;
    await forEachTenant(this.prisma, "job:support.lead-nudges", async () => {
      sent += await this.nudgeParentsInAcademy(now, await this.settings.forBot());
    });
    return sent;
  }

  private async nudgeParentsInAcademy(now: Date, settings: EffectiveSupportSettings): Promise<number> {
    const hours = settings.leadNudgeHours;
    if (hours <= 0 || !settings.botEnabled) return 0;
    const candidates = await this.prisma.supportConversation.findMany({
      include: { contact: true },
      orderBy: { lastInboundAt: "asc" },
      take: BATCH,
      where: {
        contact: { optedOutAt: null },
        lastInboundAt: {
          gt: new Date(now.getTime() - WHATSAPP_REPLY_WINDOW_MS + NUDGE_WINDOW_MARGIN_MS),
          lte: new Date(now.getTime() - hours * HOUR_MS)
        },
        nudgedAt: null,
        state: { in: [...SUPPORT_NUDGE_STATES] },
        status: "BOT"
      }
    });

    let sent = 0;
    for (const candidate of candidates) {
      if (!supportAnswersNumber(settings, candidate.contact.waId)) continue;
      await runInTenant(candidate.tenantId ?? DEFAULT_TENANT_ID, "job:support.lead-nudge", async () => {
        const nudged = await this.prisma.$transaction(async (tx) => {
          // The bot takes the same lock for each incoming message, so a reply
          // arriving now is either already counted or waits for the nudge.
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`support-contact:${candidate.contactId}`}))`;
          const conversation = await tx.supportConversation.findFirst({ include: { contact: true }, where: { id: candidate.id } });
          if (!conversation || conversation.contact.optedOutAt || !supportNudgeDue(conversation, now, hours)) return false;
          // Already a lead from this number (the website form, or an earlier booking): staff follow up, not the bot.
          const phoneTail = leadPhoneFromWaId(conversation.contact.waId, this.env.WHATSAPP_DEFAULT_COUNTRY_CODE).slice(-10);
          const lead = await tx.lead.findFirst({
            select: { id: true },
            where: { createdAt: { gte: new Date(now.getTime() - 90 * 24 * HOUR_MS) }, phone: { endsWith: phoneTail } }
          });
          if (lead) {
            await tx.supportConversation.update({ data: { nudgedAt: now }, where: { id: conversation.id } });
            return false;
          }
          const reply = supportNudgeMessage();
          await tx.supportConversation.update({
            data: { draft: { category: "COURSE" }, nudgedAt: now, state: "COURSE_MENU" },
            where: { id: conversation.id }
          });
          await tx.supportMessage.create({
            data: {
              author: "BOT",
              body: supportReplyText(reply),
              clientKey: `nudge:${conversation.id}`,
              conversationId: conversation.id,
              direction: "OUTBOUND",
              payload: reply as unknown as Prisma.InputJsonValue,
              status: "PENDING"
            }
          });
          return true;
        });
        if (!nudged) return;
        await this.outbox.sendPending(candidate.id);
        sent += 1;
      });
    }
    return sent;
  }

  private async sendReminder(ticket: SupportTicket, contact: WhatsAppContact, stage: 1 | 2): Promise<void> {
    try {
      const recipients = await this.notifier.adminAlertRecipients();
      await this.notifier.send(
        "SUPPORT_REPLY_REMINDER_ADMIN",
        recipients,
        {
          "links.supportTicket": `${getFrontendUrl(this.env)}/admin/support/tickets/${ticket.id}`,
          "support.category": SUPPORT_CATEGORY_LABELS[ticket.category],
          "support.contactName": supportContactLabel(contact),
          "support.reason":
            stage === 1
              ? "Nobody has replied to this WhatsApp request yet."
              : "Still no reply, and WhatsApp's 24-hour reply window for this customer closes in about 2 hours. After that only an approved template can be sent.",
          "support.reference": ticket.reference,
          "support.studentName": ticket.studentName ?? "-"
        },
        { dedupeKey: `support-reminder:${ticket.id}:${stage}` }
      );
    } catch (error) {
      this.logger.warn(`Support ticket ${ticket.reference}: reminder ${stage} failed: ${(error as Error).message}`);
    }
  }
}

import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  cursorPageQuerySchema,
  supportTicketListQuerySchema,
  type SupportContactErasureResult,
  type SupportContactExport,
  type SupportMessageItem,
  type SupportMessagePage,
  type SupportNoteRequest,
  type SupportPerson,
  type SupportReplyRequest,
  type SupportTicketCounts,
  type SupportTicketDetail,
  type SupportTicketEventItem,
  type SupportTicketListItem,
  type SupportTicketListResponse,
  type UpdateSupportTicketRequest
} from "@nexa-chess/types";
import { Prisma, UserRole, UserStatus, type SupportOwnerChangeReason, type User } from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { CREATED_AT_DESC_ORDER, createdAtCursorWhere, toCursorPage } from "../common/cursor-pagination";
import { paginationMeta, resolvePagination } from "../common/pagination";
import { parseOrBadRequest } from "../common/zod-body.pipe";
import { PrismaService, type PrismaTransactionClient } from "../prisma/prisma.service";
import { replyWindowEndsAt } from "./support-conversation.service";
import type { SupportOutboundPayload } from "./support-outbox.service";
import { SupportOutboxService } from "./support-outbox.service";
import { recordOwnerChange } from "./support-ownership";
import { SupportSettingsService } from "./support-settings.service";

type StaffUser = Pick<User, "id" | "role">;

const PERSON_SELECT = { firstName: true, id: true, lastName: true } as const;

const MESSAGE_INCLUDE = {
  attachment: { select: { error: true, filename: true, id: true, mimeType: true, status: true } },
  sentBy: { select: PERSON_SELECT }
} as const;

const TICKET_LIST_INCLUDE = {
  assignedTo: { select: PERSON_SELECT },
  contact: { select: { profileName: true, waId: true } },
  conversation: { select: { lastInboundAt: true, status: true } }
} satisfies Prisma.SupportTicketInclude;

type TicketListRow = Prisma.SupportTicketGetPayload<{ include: typeof TICKET_LIST_INCLUDE }>;

function person(user: { id: string; firstName: string; lastName: string | null } | null): SupportPerson | null {
  return user ? { id: user.id, name: [user.firstName, user.lastName].filter(Boolean).join(" ") } : null;
}

/** WhatsApp template parameters may not contain new lines, tabs or runs of spaces. */
export function toTemplateParam(text: string, max = 900): string {
  const flat = text.replace(/[\t\r\n]+/g, " ").replace(/ {2,}/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * The staff inbox for WhatsApp support tickets (docs/WHATSAPP_SUPPORT.md
 * Phase 2): admins and super admins only. Every id is loaded through a
 * tenant-scoped query, so another academy's ticket is a 404.
 */
@Injectable()
export class SupportAdminService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly outbox: SupportOutboxService,
    private readonly prisma: PrismaService,
    private readonly settings: SupportSettingsService
  ) {}

  async list(accessToken: string | undefined, rawQuery: unknown): Promise<SupportTicketListResponse> {
    const user = await this.getStaff(accessToken);
    const query = parseOrBadRequest(supportTicketListQuerySchema, rawQuery, "query");
    const { page, pageSize, search, skip, take } = resolvePagination(query);

    const where: Prisma.SupportTicketWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.assigned === "me" ? { assignedToId: user.id } : query.assigned === "unassigned" ? { assignedToId: null } : {})
    };
    if (search) {
      const digits = search.replace(/\D/g, "");
      where.OR = [
        { reference: { contains: search, mode: "insensitive" } },
        { studentName: { contains: search, mode: "insensitive" } },
        { contact: { profileName: { contains: search, mode: "insensitive" } } },
        ...(digits.length >= 3 ? [{ contact: { waId: { contains: digits } } }] : [])
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        include: TICKET_LIST_INCLUDE,
        orderBy: [{ updatedAt: query.order === "asc" ? "asc" : "desc" }, { id: "desc" }],
        skip,
        take,
        where
      }),
      this.prisma.supportTicket.count({ where })
    ]);
    return { items: rows.map((row) => this.toListItem(row)), pagination: paginationMeta(total, page, pageSize) };
  }

  async counts(accessToken: string | undefined): Promise<SupportTicketCounts> {
    await this.getStaff(accessToken);
    const groups = await this.prisma.supportTicket.groupBy({ _count: { _all: true }, by: ["status"] });
    const counts: SupportTicketCounts = { IN_PROGRESS: 0, OPEN: 0, RESOLVED: 0 };
    for (const group of groups) counts[group.status] = group._count._all;
    return counts;
  }

  /** Who a ticket can be assigned to: the academy's active admins. */
  async agents(accessToken: string | undefined): Promise<SupportPerson[]> {
    await this.getStaff(accessToken);
    const users = await this.prisma.user.findMany({
      orderBy: [{ firstName: "asc" }, { id: "asc" }],
      select: PERSON_SELECT,
      where: { isPlatformSupport: false, role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] }, status: UserStatus.ACTIVE }
    });
    return users.map((user) => person(user)!);
  }

  async get(accessToken: string | undefined, id: string): Promise<SupportTicketDetail> {
    await this.getStaff(accessToken);
    return this.loadDetail(id);
  }

  /** The ticket's conversation, newest first (cursor pages). */
  async messages(accessToken: string | undefined, id: string, rawQuery: unknown): Promise<SupportMessagePage> {
    await this.getStaff(accessToken);
    const { cursor, limit } = parseOrBadRequest(cursorPageQuerySchema, rawQuery, "query");
    const ticket = await this.findTicket(id);
    const rows = await this.prisma.supportMessage.findMany({
      include: MESSAGE_INCLUDE,
      orderBy: [...CREATED_AT_DESC_ORDER],
      take: limit + 1,
      where: { AND: [{ conversationId: ticket.conversationId }, createdAtCursorWhere(cursor)] }
    });
    const page = toCursorPage(rows, limit);
    return { items: page.items.map((row) => this.toMessage(row)), nextCursor: page.nextCursor };
  }

  /**
   * Sends a staff reply on WhatsApp. Inside the customer's 24-hour window it is
   * plain text; after it, only the approved SUPPORT_AGENT_REPLY_TEMPLATE can be
   * sent (409 when none is set). Replying takes the conversation over from the bot.
   */
  async reply(accessToken: string | undefined, id: string, body: SupportReplyRequest): Promise<SupportMessageItem> {
    const user = await this.getStaff(accessToken);
    const ticket = await this.findTicket(id);
    const contact = await this.prisma.whatsAppContact.findFirst({ where: { id: ticket.contactId } });
    if (!contact) throw new NotFoundException("Contact not found.");

    const windowOpen = replyWindowEndsAt(contact) !== null;
    const settings = windowOpen ? null : await this.settings.current();
    const template = settings?.agentReplyTemplate ?? null;
    if (!windowOpen && !template) {
      throw new ConflictException(
        "The customer last wrote more than 24 hours ago, so WhatsApp only allows an approved template, and none is set (Support → Settings)."
      );
    }
    const payload: SupportOutboundPayload | null = windowOpen
      ? null
      : {
          bodyParams: [ticket.reference, toTemplateParam(body.body)],
          kind: "template",
          language: settings!.agentReplyTemplateLanguage,
          name: template!
        };

    const { conversationId, message } = await this.prisma.$transaction(async (tx) => {
      const conversationId = await this.claimConversation(tx, ticket, "AGENT", { actorId: user.id, reason: "STAFF_REPLY" });
      const message = await tx.supportMessage.create({
        data: {
          author: "AGENT",
          body: body.body,
          conversationId,
          direction: "OUTBOUND",
          payload: payload ? (payload as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          sentById: user.id,
          status: "PENDING"
        },
        include: MESSAGE_INCLUDE
      });
      await tx.supportTicket.update({
        data: {
          ...(ticket.assignedToId ? {} : { assignedToId: user.id }),
          ...(ticket.status === "OPEN" ? { status: "IN_PROGRESS" } : {})
        },
        where: { id: ticket.id }
      });
      return { conversationId, message };
    });

    await this.outbox.sendPending(conversationId);
    const sent = await this.prisma.supportMessage.findFirst({ include: MESSAGE_INCLUDE, where: { id: message.id } });
    return this.toMessage(sent ?? message);
  }

  async addNote(accessToken: string | undefined, id: string, body: SupportNoteRequest): Promise<SupportTicketDetail> {
    const user = await this.getStaff(accessToken);
    const ticket = await this.findTicket(id);
    await this.prisma.$transaction([
      this.prisma.supportTicketEvent.create({ data: { actorId: user.id, body: body.body, kind: "NOTE", ticketId: ticket.id } }),
      this.prisma.supportTicket.update({ data: { updatedAt: new Date() }, where: { id: ticket.id } })
    ]);
    return this.loadDetail(ticket.id);
  }

  async update(accessToken: string | undefined, id: string, body: UpdateSupportTicketRequest): Promise<SupportTicketDetail> {
    const user = await this.getStaff(accessToken);
    const ticket = await this.findTicket(id);

    let assignee: { id: string; firstName: string; lastName: string | null } | null | undefined;
    if (body.assignedToId) {
      assignee = await this.prisma.user.findFirst({
        select: PERSON_SELECT,
        where: {
          id: body.assignedToId,
          isPlatformSupport: false,
          role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
          status: UserStatus.ACTIVE
        }
      });
      if (!assignee) throw new NotFoundException("That admin was not found.");
    } else if (body.assignedToId === null) {
      assignee = null;
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const data: Prisma.SupportTicketUpdateInput = {};
      const events: Prisma.SupportTicketEventCreateManyInput[] = [];
      if (assignee !== undefined && (assignee?.id ?? null) !== ticket.assignedToId) {
        data.assignedTo = assignee ? { connect: { id: assignee.id } } : { disconnect: true };
        events.push({
          actorId: user.id,
          body: assignee ? `Assigned to ${person(assignee)!.name}.` : "Unassigned.",
          kind: "ASSIGNED",
          ticketId: ticket.id
        });
      }
      if (body.status && body.status !== ticket.status) {
        data.status = body.status;
        data.resolvedAt = body.status === "RESOLVED" ? now : null;
        events.push({ actorId: user.id, body: `Status: ${ticket.status} → ${body.status}.`, kind: "STATUS_CHANGED", ticketId: ticket.id });
        if (body.status === "RESOLVED") await this.closeIfDone(tx, ticket, now, user.id);
      }
      if (events.length === 0) return;
      await tx.supportTicket.update({ data, where: { id: ticket.id } });
      await tx.supportTicketEvent.createMany({ data: events });
    });
    return this.loadDetail(ticket.id);
  }

  /** Staff answer from now on; the bot stays silent in this conversation. */
  async takeOver(accessToken: string | undefined, id: string): Promise<SupportTicketDetail> {
    const user = await this.getStaff(accessToken);
    const ticket = await this.findTicket(id);
    await this.prisma.$transaction(async (tx) => {
      await this.claimConversation(tx, ticket, "AGENT", { actorId: user.id, reason: "STAFF_TAKE_OVER" });
      await tx.supportTicket.update({
        data: {
          ...(ticket.assignedToId ? {} : { assignedToId: user.id }),
          ...(ticket.status === "OPEN" ? { status: "IN_PROGRESS" } : {})
        },
        where: { id: ticket.id }
      });
      await tx.supportTicketEvent.create({ data: { actorId: user.id, body: "Took over from the bot.", kind: "TAKEN_OVER", ticketId: ticket.id } });
    });
    return this.loadDetail(ticket.id);
  }

  /** The bot answers again, starting from its menu. The ticket stays as it is. */
  async returnToBot(accessToken: string | undefined, id: string): Promise<SupportTicketDetail> {
    const user = await this.getStaff(accessToken);
    const ticket = await this.findTicket(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`support-contact:${ticket.contactId}`}))`;
      const conversation = await tx.supportConversation.findFirst({ where: { id: ticket.conversationId } });
      if (!conversation || conversation.status === "CLOSED") {
        throw new ConflictException("This conversation has ended; the bot answers the customer's next message anyway.");
      }
      await tx.supportConversation.update({
        data: { draft: {}, state: "MAIN_MENU", status: "BOT" },
        where: { id: conversation.id }
      });
      await recordOwnerChange(tx, { actorId: user.id, conversationId: conversation.id, from: conversation.status, reason: "STAFF_RETURN", ticketId: ticket.id, to: "BOT" });
      await tx.supportTicketEvent.create({ data: { actorId: user.id, body: "Handed back to the bot.", kind: "RETURNED_TO_BOT", ticketId: ticket.id } });
    });
    return this.loadDetail(ticket.id);
  }

  // ── Privacy requests for a WhatsApp contact (docs/WHATSAPP_SUPPORT.md §0) ──

  /** Everything stored about one WhatsApp number, oldest first, for a parent's access request. */
  async exportContact(accessToken: string | undefined, contactId: string): Promise<SupportContactExport> {
    await this.getStaff(accessToken);
    const contact = await this.prisma.whatsAppContact.findFirst({ where: { id: contactId } });
    if (!contact) throw new NotFoundException("Contact not found.");
    const [conversations, tickets, links] = await Promise.all([
      this.prisma.supportConversation.findMany({
        include: { messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } },
        orderBy: { createdAt: "asc" },
        where: { contactId }
      }),
      this.prisma.supportTicket.findMany({
        include: { events: { orderBy: { createdAt: "asc" } } },
        orderBy: { createdAt: "asc" },
        where: { contactId }
      }),
      this.prisma.supportContactLink.findMany({
        include: { student: { select: { firstName: true, lastName: true } } },
        orderBy: { createdAt: "asc" },
        where: { contactId }
      })
    ]);
    return {
      contact: {
        firstSeenAt: contact.createdAt.toISOString(),
        optedOutAt: contact.optedOutAt?.toISOString() ?? null,
        profileName: contact.profileName,
        waId: contact.waId
      },
      conversations: conversations.map((conversation) => ({
        closedAt: conversation.closedAt?.toISOString() ?? null,
        messages: conversation.messages.map((message) => ({
          at: message.createdAt.toISOString(),
          author: message.author,
          body: message.body,
          direction: message.direction,
          status: message.status
        })),
        startedAt: conversation.createdAt.toISOString()
      })),
      exportedAt: new Date().toISOString(),
      linkedStudents: links.map((link) => ({ linkedAt: link.createdAt.toISOString(), name: `${link.student.firstName} ${link.student.lastName ?? ""}`.trim() })),
      tickets: tickets.map((ticket) => ({
        category: ticket.category,
        details: ticket.details,
        history: ticket.events.map((event) => ({ at: event.createdAt.toISOString(), body: event.body, kind: event.kind })),
        openedAt: ticket.createdAt.toISOString(),
        reference: ticket.reference,
        resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
        status: ticket.status,
        studentName: ticket.studentName
      }))
    };
  }

  /**
   * Erases a WhatsApp contact (super admins): conversations, transcript,
   * tickets and their history, and the stored webhook items. A number that
   * replied STOP keeps a bare row (number + opt-out, nothing else) so
   * automatic messages stay off. A lead made from it is a CRM record and stays
   * (staff delete it from Leads). The erasure itself is recorded without
   * personal data.
   */
  async eraseContact(accessToken: string | undefined, contactId: string): Promise<SupportContactErasureResult> {
    const user = await this.getStaff(accessToken);
    if (user.role !== UserRole.SUPER_ADMIN) throw new ForbiddenException("Only a super admin can erase a WhatsApp contact.");
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`support-contact:${contactId}`}))`;
      const contact = await tx.whatsAppContact.findFirst({ where: { id: contactId } });
      if (!contact) throw new NotFoundException("Contact not found.");
      const [conversations, messages, tickets] = await Promise.all([
        tx.supportConversation.count({ where: { contactId } }),
        tx.supportMessage.count({ where: { conversation: { contactId } } }),
        tx.supportTicket.count({ where: { contactId } })
      ]);
      // Tickets, messages and ticket history go with their conversations (cascade).
      await tx.supportTicket.deleteMany({ where: { contactId } });
      await tx.supportConversation.deleteMany({ where: { contactId } });
      await tx.whatsAppWebhookEvent.deleteMany({ where: { waId: contact.waId } });
      await tx.supportContactLink.deleteMany({ where: { contactId } });
      const keptOptOut = contact.optedOutAt !== null;
      if (keptOptOut) {
        await tx.whatsAppContact.update({
          data: { dailyPuzzleAt: null, lastInboundAt: null, linkFailures: 0, linkFailuresFrom: null, profileName: null },
          where: { id: contact.id }
        });
      } else {
        await tx.whatsAppContact.delete({ where: { id: contact.id } });
      }
      await tx.supportContactErasure.create({
        data: { contactId, conversations, erasedById: user.id, keptOptOut, messages, tickets }
      });
      return { conversations, keptOptOut, messages, tickets };
    });
  }

  // ── Internals ──

  /**
   * The conversation a staff action happens in, under the contact's lock (the
   * bot takes the same one). The ticket's own conversation when it is still
   * open; else the contact's current one (the ticket moves to it); else the
   * ticket's conversation reopens.
   */
  private async claimConversation(
    tx: PrismaTransactionClient,
    ticket: { id: string; contactId: string; conversationId: string },
    status: "AGENT" | "WAITING_AGENT",
    why: { actorId: string; reason: SupportOwnerChangeReason }
  ): Promise<string> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`support-contact:${ticket.contactId}`}))`;
    const own = await tx.supportConversation.findFirst({ where: { id: ticket.conversationId } });
    if (!own) throw new NotFoundException("Conversation not found.");

    let target = own;
    if (own.status === "CLOSED") {
      const current = await tx.supportConversation.findFirst({ where: { contactId: ticket.contactId, status: { not: "CLOSED" } } });
      if (current) {
        target = current;
        await tx.supportTicket.update({ data: { conversationId: current.id }, where: { id: ticket.id } });
      }
    }
    await tx.supportConversation.update({
      data: { closedAt: null, draft: {}, state: "DONE", status },
      where: { id: target.id }
    });
    await recordOwnerChange(tx, { ...why, conversationId: target.id, from: target.status, ticketId: ticket.id, to: status });
    return target.id;
  }

  /** Resolving the last open ticket of a conversation ends it; the next message gets a fresh greeting. */
  private async closeIfDone(
    tx: PrismaTransactionClient,
    ticket: { contactId: string; conversationId: string; id: string },
    now: Date,
    actorId: string
  ) {
    const others = await tx.supportTicket.count({
      where: { conversationId: ticket.conversationId, id: { not: ticket.id }, status: { not: "RESOLVED" } }
    });
    if (others > 0) return;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`support-contact:${ticket.contactId}`}))`;
    const conversation = await tx.supportConversation.findFirst({ select: { status: true }, where: { id: ticket.conversationId } });
    if (conversation?.status !== "AGENT" && conversation?.status !== "WAITING_AGENT") return;
    await tx.supportConversation.update({ data: { closedAt: now, status: "CLOSED" }, where: { id: ticket.conversationId } });
    await recordOwnerChange(tx, { actorId, conversationId: ticket.conversationId, from: conversation.status, reason: "TICKET_RESOLVED", ticketId: ticket.id, to: "CLOSED" });
  }

  private async findTicket(id: string) {
    const ticket = await this.prisma.supportTicket.findFirst({ where: { id } });
    if (!ticket) throw new NotFoundException("Ticket not found.");
    return ticket;
  }

  private async loadDetail(id: string): Promise<SupportTicketDetail> {
    const row = await this.prisma.supportTicket.findFirst({
      include: {
        ...TICKET_LIST_INCLUDE,
        contact: {
          include: {
            studentLinks: {
              include: { student: { select: { firstName: true, id: true, lastName: true } } },
              orderBy: { createdAt: "asc" },
              where: { student: { isDeleted: false } }
            }
          }
        },
        events: { include: { actor: { select: PERSON_SELECT } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
        lead: { select: { id: true, isDeleted: true, status: true, studentName: true } }
      },
      where: { id }
    });
    if (!row) throw new NotFoundException("Ticket not found.");
    const windowEnds = replyWindowEndsAt(row.contact);
    return {
      ...this.toListItem(row),
      contact: {
        id: row.contact.id,
        linkedStudents: row.contact.studentLinks.map((link) => ({
          id: link.student.id,
          linkedAt: link.createdAt.toISOString(),
          name: `${link.student.firstName} ${link.student.lastName ?? ""}`.trim()
        })),
        optedOut: row.contact.optedOutAt !== null,
        profileName: row.contact.profileName,
        replyWindowEndsAt: windowEnds ? windowEnds.toISOString() : null,
        waId: row.contact.waId
      },
      conversationId: row.conversationId,
      details: row.details,
      events: row.events.map(
        (event): SupportTicketEventItem => ({
          actor: person(event.actor),
          body: event.body,
          createdAt: event.createdAt.toISOString(),
          id: event.id,
          kind: event.kind
        })
      ),
      // A lead in the trash is not offered as a link.
      lead: row.lead && !row.lead.isDeleted ? { id: row.lead.id, status: row.lead.status, studentName: row.lead.studentName } : null,
      resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null
    };
  }

  private toListItem(row: TicketListRow): SupportTicketListItem {
    return {
      assignedTo: person(row.assignedTo),
      category: row.category,
      contact: { profileName: row.contact.profileName, waId: row.contact.waId },
      conversationStatus: row.conversation.status,
      createdAt: row.createdAt.toISOString(),
      handoff: row.handoff,
      id: row.id,
      lastInboundAt: row.conversation.lastInboundAt ? row.conversation.lastInboundAt.toISOString() : null,
      reference: row.reference,
      status: row.status,
      studentName: row.studentName,
      summary: row.details ? row.details.split("\n")[0].slice(0, 160) : null,
      updatedAt: row.updatedAt.toISOString()
    };
  }

  private toMessage(
    row: Prisma.SupportMessageGetPayload<{ include: typeof MESSAGE_INCLUDE }>
  ): SupportMessageItem {
    const file = row.attachment;
    return {
      attachment: file
        ? {
            error: file.error,
            filename: file.filename,
            id: file.id,
            kind: (file.mimeType ?? "") === "application/pdf" ? "pdf" : "image",
            status: file.status
          }
        : null,
      author: row.author,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      direction: row.direction,
      error: row.error,
      id: row.id,
      sentBy: person(row.sentBy),
      status: row.status
    };
  }

  private async getStaff(accessToken: string | undefined): Promise<StaffUser> {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Only admins can use the support inbox.");
    }
    return user;
  }
}

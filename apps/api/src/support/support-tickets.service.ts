import { Injectable, Logger } from "@nestjs/common";
import { getApiEnv, getFrontendUrl } from "@nexa-chess/config/api";
import { SUPPORT_CATEGORY_LABELS, type SupportAction } from "@nexa-chess/types";
import type { SupportTicket, WhatsAppContact } from "@prisma/client";
import type { PrismaTransactionClient } from "../prisma/prisma.service";
import { SystemNotifier } from "../mail/system-notifier.service";

type TicketAction = Extract<SupportAction, { kind: "TICKET" }>;

/** A repeat of the same request within this window shows the customer the same reference. */
export const SUPPORT_TICKET_REUSE_DAYS = 7;

/** NXS-2026-000123: the year the ticket was opened (UTC) and the sequence number. */
export function formatSupportReference(year: number, sequence: bigint | number): string {
  return `NXS-${year}-${String(sequence).padStart(6, "0")}`;
}

/** "Priya (+91 98765…)" style label for staff, from the WhatsApp profile and number. */
export function supportContactLabel(contact: Pick<WhatsAppContact, "profileName" | "waId">): string {
  return contact.profileName ? `${contact.profileName} (+${contact.waId})` : `+${contact.waId}`;
}

/**
 * Tickets the bot opens (docs/WHATSAPP_SUPPORT.md §5–6). Runs inside the
 * conversation's transaction, which already holds the contact's lock, so the
 * "same request this week?" check and the insert can't race.
 */
@Injectable()
export class SupportTicketsService {
  private readonly logger = new Logger(SupportTicketsService.name);

  constructor(private readonly notifier: SystemNotifier) {}

  /**
   * Opens a ticket for the bot's TICKET action, or returns the contact's open
   * ticket for the same category from the last week (a hand-off reuses any
   * open ticket of the conversation). `created` says whether staff must be told.
   */
  async openFromBot(
    tx: PrismaTransactionClient,
    input: {
      action: TicketAction;
      contactId: string;
      conversationId: string;
      /** The lead a demo booking created or matched. */
      leadId?: string | null;
      /** The customer message that triggered it: makes a retried run idempotent. */
      sourceKey: string;
      now: Date;
    }
  ): Promise<{ ticket: SupportTicket; created: boolean }> {
    const { action, contactId, conversationId, now } = input;
    const since = new Date(now.getTime() - SUPPORT_TICKET_REUSE_DAYS * 24 * 60 * 60 * 1000);

    const existing = await tx.supportTicket.findFirst({
      orderBy: { createdAt: "desc" },
      where: action.handoff
        ? { contactId, OR: [{ conversationId }, { category: action.category, createdAt: { gte: since } }], status: { not: "RESOLVED" } }
        : { category: action.category, contactId, createdAt: { gte: since }, status: { not: "RESOLVED" } }
    });

    if (existing) {
      const extra = [action.studentName && `Student: ${action.studentName}`, action.details].filter(Boolean).join("\n");
      await tx.supportTicketEvent.create({
        data: {
          body: action.handoff
            ? `Asked to talk to the team.${extra ? `\n${extra}` : ""}`
            : `Sent the same request again.${extra ? `\n${extra}` : ""}`,
          kind: action.handoff ? "HANDOFF" : "NOTE",
          ticketId: existing.id
        }
      });
      const ticket = await tx.supportTicket.update({
        data: {
          conversationId,
          handoff: existing.handoff || action.handoff,
          ...(input.leadId && !existing.leadId ? { leadId: input.leadId } : {}),
          // A ticket staff had moved on wakes up again.
          status: existing.status === "IN_PROGRESS" ? "IN_PROGRESS" : "OPEN"
        },
        where: { id: existing.id }
      });
      return { created: false, ticket };
    }

    const [{ value }] = await tx.$queryRaw<{ value: bigint }[]>`SELECT nextval('support_ticket_reference_seq') AS value`;
    const ticket = await tx.supportTicket.create({
      data: {
        category: action.category,
        contactId,
        conversationId,
        dedupeKey: `bot:${input.sourceKey}`,
        details: action.details,
        handoff: action.handoff,
        leadId: input.leadId ?? null,
        reference: formatSupportReference(now.getUTCFullYear(), value),
        studentName: action.studentName
      }
    });
    await tx.supportTicketEvent.create({
      data: {
        body: action.handoff
          ? "Opened by the bot: the customer asked to talk to the team."
          : action.demo
            ? "Opened by the bot: a free demo booking (added to Leads)."
            : "Opened by the bot.",
        kind: action.handoff ? "HANDOFF" : "CREATED",
        ticketId: ticket.id
      }
    });
    return { created: true, ticket };
  }

  /** Tells the academy's admins (SUPPORT_TICKET_ADMIN). After commit; never throws. */
  async announce(ticket: SupportTicket, contact: Pick<WhatsAppContact, "profileName" | "waId">): Promise<void> {
    try {
      const recipients = await this.notifier.adminAlertRecipients();
      await this.notifier.send(
        "SUPPORT_TICKET_ADMIN",
        recipients,
        {
          "links.supportTicket": `${getFrontendUrl(getApiEnv())}/admin/support/tickets/${ticket.id}`,
          "support.category": SUPPORT_CATEGORY_LABELS[ticket.category],
          "support.contactName": supportContactLabel(contact),
          "support.reference": ticket.reference,
          "support.studentName": ticket.studentName ?? "-",
          "support.summary": ticket.details ?? (ticket.handoff ? "Asked to talk to the team." : "-")
        },
        { dedupeKey: `support-ticket:${ticket.id}` }
      );
    } catch (error) {
      this.logger.warn(`Support ticket ${ticket.reference}: staff notice failed: ${(error as Error).message}`);
    }
  }
}

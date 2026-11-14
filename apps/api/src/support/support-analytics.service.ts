import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  SUPPORT_ANALYTICS_DAYS,
  SUPPORT_CATEGORIES,
  isKnownTimeZone,
  type SupportAnalyticsResponse,
  type SupportCategory
} from "@nexa-chess/types";
import { UserRole } from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { queryEnum, queryString } from "../common/query-params";
import { WHATSAPP_LEAD_SOURCE } from "../lead/lead.service";
import { PrismaService } from "../prisma/prisma.service";

const DAY_MS = 24 * 60 * 60_000;

/** The value at a fraction (0–1) of a sorted list, nearest rank; null when empty. */
export function percentile(sorted: number[], fraction: number): number | null {
  if (sorted.length === 0) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[index];
}

/** YYYY-MM-DD of an instant in a time zone. */
export function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone, year: "numeric" }).format(at);
}

/**
 * Minutes from each hand-off to the first staff message after it in the same
 * conversation. `replies` must be sorted by time. A hand-off without a reply yet
 * counts as waiting.
 */
export function firstReplyMinutes(
  handoffs: Array<{ at: Date; conversationId: string }>,
  replies: Array<{ at: Date; conversationId: string }>
): { minutes: number[]; waiting: number } {
  const byConversation = new Map<string, Date[]>();
  for (const reply of replies) {
    const list = byConversation.get(reply.conversationId) ?? [];
    list.push(reply.at);
    byConversation.set(reply.conversationId, list);
  }
  const minutes: number[] = [];
  let waiting = 0;
  for (const handoff of handoffs) {
    const first = byConversation.get(handoff.conversationId)?.find((at) => at.getTime() >= handoff.at.getTime());
    if (first) minutes.push(Math.round((first.getTime() - handoff.at.getTime()) / 60_000));
    else waiting += 1;
  }
  return { minutes: minutes.sort((a, b) => a - b), waiting };
}

/**
 * How the WhatsApp assistant is doing for this academy (docs/WHATSAPP_SUPPORT.md
 * §0 "Analytics"): volume, how much reaches staff, and how fast staff answer.
 * Built from `support_conversation_events`, so history starts when that table did.
 */
@Injectable()
export class SupportAnalyticsService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async summary(accessToken: string | undefined, rawQuery: Record<string, unknown>, now = new Date()): Promise<SupportAnalyticsResponse> {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Only admins can see support analytics.");
    }
    const days = Number(queryEnum(rawQuery.days, SUPPORT_ANALYTICS_DAYS, "days") ?? "30");
    const timeZone = queryString(rawQuery.tz, "tz") ?? "UTC";
    if (!isKnownTimeZone(timeZone)) throw new BadRequestException("tz: not a known time zone.");
    const from = new Date(now.getTime() - days * DAY_MS);
    const inWindow = { gte: from, lte: now };

    const [conversations, handoffs, tickets, resolved, newLeads] = await Promise.all([
      this.prisma.supportConversation.findMany({ select: { createdAt: true }, where: { createdAt: inWindow } }),
      this.prisma.supportConversationEvent.findMany({
        orderBy: { createdAt: "asc" },
        select: { conversationId: true, createdAt: true },
        where: { createdAt: inWindow, reason: "HANDOFF" }
      }),
      this.prisma.supportTicket.findMany({ select: { category: true }, where: { createdAt: inWindow } }),
      this.prisma.supportTicket.count({ where: { resolvedAt: inWindow } }),
      this.prisma.lead.count({ where: { createdAt: inWindow, source: WHATSAPP_LEAD_SOURCE } })
    ]);

    const handedConversationIds = [...new Set(handoffs.map((event) => event.conversationId))];
    const replies =
      handedConversationIds.length === 0
        ? []
        : await this.prisma.supportMessage.findMany({
            orderBy: { createdAt: "asc" },
            select: { conversationId: true, createdAt: true },
            where: { author: "AGENT", conversationId: { in: handedConversationIds }, createdAt: { gte: from }, direction: "OUTBOUND" }
          });
    const reply = firstReplyMinutes(
      handoffs.map((event) => ({ at: event.createdAt, conversationId: event.conversationId })),
      replies.map((message) => ({ at: message.createdAt, conversationId: message.conversationId }))
    );

    const daily = new Map<string, { conversations: number; handoffs: number }>();
    for (let at = from.getTime(); at <= now.getTime(); at += DAY_MS) daily.set(localDate(new Date(at), timeZone), { conversations: 0, handoffs: 0 });
    daily.set(localDate(now, timeZone), daily.get(localDate(now, timeZone)) ?? { conversations: 0, handoffs: 0 });
    for (const row of conversations) {
      const day = daily.get(localDate(row.createdAt, timeZone));
      if (day) day.conversations += 1;
    }
    for (const event of handoffs) {
      const day = daily.get(localDate(event.createdAt, timeZone));
      if (day) day.handoffs += 1;
    }

    const byCategory = new Map<SupportCategory, number>();
    for (const ticket of tickets) byCategory.set(ticket.category as SupportCategory, (byCategory.get(ticket.category as SupportCategory) ?? 0) + 1);

    return {
      conversations: conversations.length,
      daily: [...daily.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, counts]) => ({ date, ...counts })),
      days,
      firstReply: {
        answered: reply.minutes.length,
        medianMinutes: percentile(reply.minutes, 0.5),
        p90Minutes: percentile(reply.minutes, 0.9),
        waiting: reply.waiting
      },
      from: from.toISOString(),
      handedToStaff: handedConversationIds.length,
      handoffRate: conversations.length === 0 ? null : Math.min(1, handedConversationIds.length / conversations.length),
      newLeads,
      tickets: {
        byCategory: SUPPORT_CATEGORIES.filter((category) => byCategory.has(category)).map((category) => ({ category, count: byCategory.get(category)! })),
        opened: tickets.length,
        resolved
      },
      to: now.toISOString()
    };
  }
}

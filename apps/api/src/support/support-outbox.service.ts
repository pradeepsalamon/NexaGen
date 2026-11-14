import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { DEFAULT_TENANT_ID, markdownToWhatsApp, type SupportReply } from "@nexa-chess/types";
import type { Prisma } from "@prisma/client";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";
import { asPlatform, runInTenant } from "../tenancy/tenant-context";
import type { WhatsAppSendOutcome } from "../whatsapp/whatsapp.types";
import { WhatsAppService } from "../whatsapp/whatsapp.service";

/** What an outgoing SupportMessage row sends (its `payload`). No payload = plain text `body`. */
export type SupportOutboundPayload =
  | SupportReply
  | { kind: "template"; name: string; language: string; bodyParams: string[] };

/** Sends per message, including the first. A chat reply hours late is worse than none. */
export const SUPPORT_SEND_MAX_ATTEMPTS = 4;
/** A claim older than this is assumed abandoned (process died mid-send). */
const CLAIM_TIMEOUT_MS = 2 * 60_000;
const RETRY_MINUTES = [1, 5, 15];
const SWEEP_CONVERSATIONS = 100;

export function supportRetryAt(attempts: number, now: Date): Date {
  const minutes = RETRY_MINUTES[Math.min(attempts - 1, RETRY_MINUTES.length - 1)] ?? 15;
  return new Date(now.getTime() + minutes * 60_000);
}

/**
 * Delivers outgoing support messages (bot replies and agent replies). Each row
 * is written PENDING inside the transaction that decided it, then sent here
 * after commit, oldest first per conversation so the customer reads them in
 * order. A per-row `claimedAt` lease stops two processes sending one row.
 */
@Injectable()
export class SupportOutboxService {
  private readonly logger = new Logger(SupportOutboxService.name);

  constructor(
    private readonly jobLocks: JobLockService,
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService
  ) {}

  /**
   * Sends the conversation's due PENDING messages in order. Stops at the first
   * one that has to wait for a retry, so a later message never overtakes it.
   * Call inside the conversation's academy. Never throws.
   */
  async sendPending(conversationId: string): Promise<void> {
    try {
      for (let guard = 0; guard < 50; guard += 1) {
        const now = new Date();
        const next = await this.prisma.supportMessage.findFirst({
          include: { conversation: { include: { contact: true } } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          where: { conversationId, direction: "OUTBOUND", status: "PENDING" }
        });
        if (!next) return;
        if (next.nextAttemptAt && next.nextAttemptAt > now) return;

        const stale = new Date(now.getTime() - CLAIM_TIMEOUT_MS);
        const claim = await this.prisma.supportMessage.updateMany({
          data: { attempts: { increment: 1 }, claimedAt: now },
          where: { id: next.id, OR: [{ claimedAt: null }, { claimedAt: { lt: stale } }], status: "PENDING" }
        });
        if (claim.count === 0) return; // another process is sending this conversation

        const attempts = next.attempts + 1;
        const outcome = await this.deliver(next.conversation.contact.waId, next.body, next.payload);
        if (outcome.ok) {
          await this.prisma.supportMessage.update({
            data: { claimedAt: null, error: null, nextAttemptAt: null, providerMessageId: outcome.result.messageId, status: "SENT" },
            where: { id: next.id }
          });
          continue;
        }

        if (outcome.error.retryable && attempts < SUPPORT_SEND_MAX_ATTEMPTS) {
          await this.prisma.supportMessage.update({
            data: { claimedAt: null, error: outcome.error.message.slice(0, 500), nextAttemptAt: supportRetryAt(attempts, now) },
            where: { id: next.id }
          });
          return;
        }
        await this.prisma.supportMessage.update({
          data: { claimedAt: null, error: outcome.error.message.slice(0, 500), status: "FAILED" },
          where: { id: next.id }
        });
      }
    } catch (error) {
      this.logger.warn(`Support outbox for conversation ${conversationId} failed: ${(error as Error).message}`);
    }
  }

  private async deliver(to: string, body: string, payload: Prisma.JsonValue | null): Promise<WhatsAppSendOutcome> {
    if (!this.whatsapp.isConfigured()) {
      return { error: { message: "WhatsApp is not configured on this server.", retryable: false, status: 0 }, ok: false };
    }
    const stored = payload as SupportOutboundPayload | null;
    if (stored?.kind === "buttons") {
      return this.whatsapp.trySendInteractive({ body: stored.body, buttons: stored.buttons, kind: "buttons", to });
    }
    if (stored?.kind === "list") {
      return this.whatsapp.trySendInteractive({ body: stored.body, button: stored.button, kind: "list", rows: stored.rows, to });
    }
    if (stored?.kind === "template") {
      return this.whatsapp.trySendTemplate({ bodyParams: stored.bodyParams, language: stored.language, name: stored.name, to });
    }
    return this.whatsapp.trySendText({ body: markdownToWhatsApp(body), to });
  }

  /** Retries and anything a crashed process left behind. */
  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    await this.jobLocks.runExclusive(JOB_LOCKS.supportOutbox, async () => {
      const now = new Date();
      const stale = new Date(now.getTime() - CLAIM_TIMEOUT_MS);
      const due = await asPlatform("support:outbox-sweep", () =>
        this.prisma.supportMessage.findMany({
          distinct: ["conversationId"],
          orderBy: { createdAt: "asc" },
          select: { conversationId: true, tenantId: true },
          take: SWEEP_CONVERSATIONS,
          where: {
            direction: "OUTBOUND",
            OR: [{ claimedAt: null }, { claimedAt: { lt: stale } }],
            status: "PENDING",
            AND: [{ OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }]
          }
        })
      );
      for (const row of due) {
        await runInTenant(row.tenantId ?? DEFAULT_TENANT_ID, "job:support.outbox", () => this.sendPending(row.conversationId));
      }
    });
  }
}

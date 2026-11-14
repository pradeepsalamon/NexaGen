import { timingSafeEqual } from "node:crypto";
import { BadRequestException, ForbiddenException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { getApiEnv } from "@nexa-chess/config/api";
import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";
import { asPlatform, runInTenant } from "../tenancy/tenant-context";
import { normalizeWhatsAppNumber } from "../whatsapp/whatsapp.utils";
import { SupportConversationService } from "./support-conversation.service";
import { parseWhatsAppWebhook, verifyWhatsAppSignature, type ParsedWhatsAppEvent } from "./whatsapp-webhook.parse";

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** A claim older than this is assumed abandoned and picked up by the sweep. */
export const WEBHOOK_EVENT_LEASE_MS = 2 * 60_000;
/** The sweep leaves fresh rows to the in-process handler that just stored them. */
const SWEEP_GRACE_MS = 30_000;
/** After this many failed runs an event is parked (`ignoredAt` + `error`) for a person to look at. */
export const WEBHOOK_EVENT_MAX_ATTEMPTS = 5;
const SWEEP_BATCH = 100;

/**
 * Meta → NexaGen (docs/WHATSAPP_SUPPORT.md §4). Every item is stored before
 * the 200, deduped on `dedupeKey`, and acted on after the response under a
 * `claimedAt` lease; a minute sweep picks up anything a crash left behind.
 *
 * v1 answers only Nexa's own number (the server's WHATSAPP_PHONE_NUMBER_ID).
 * Items for any other number are dropped: their signature can only be checked
 * with Nexa's app secret, and other academies have no bot yet.
 */
@Injectable()
export class WhatsAppWebhookService {
  private readonly logger = new Logger(WhatsAppWebhookService.name);
  private readonly env = getApiEnv();
  private readonly allowlist: ReadonlySet<string> | null;

  constructor(
    private readonly conversations: SupportConversationService,
    private readonly jobLocks: JobLockService,
    private readonly prisma: PrismaService
  ) {
    const numbers = (this.env.SUPPORT_TEST_NUMBERS_ALLOWLIST ?? "")
      .split(",")
      .map((raw) => normalizeWhatsAppNumber(raw, this.env.WHATSAPP_DEFAULT_COUNTRY_CODE))
      .filter((value): value is string => Boolean(value));
    this.allowlist = numbers.length > 0 ? new Set(numbers) : null;
  }

  /** Meta's subscription handshake: echo the challenge when the token matches. */
  verifySubscription(mode: string | undefined, token: string | undefined, challenge: string | undefined): string {
    // Meta expects a 403 for a failed handshake; unconfigured looks the same from outside.
    const expected = this.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    if (!expected || mode !== "subscribe" || !token || !safeEqual(token, expected) || !challenge) {
      throw new ForbiddenException("Verification failed.");
    }
    return challenge.slice(0, 200);
  }

  /** Verifies, stores and schedules. Returns quickly: Meta retries anything slower than a few seconds. */
  async receive(rawBody: string, signature: string | string[] | undefined): Promise<{ received: number }> {
    // Without the app secret nothing can be verified, so everything is refused.
    const secret = this.env.WHATSAPP_APP_SECRET;
    if (!secret || !verifyWhatsAppSignature(rawBody, signature, secret)) {
      throw new UnauthorizedException("Invalid signature.");
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new BadRequestException("Malformed JSON.");
    }

    const ours = this.env.WHATSAPP_PHONE_NUMBER_ID;
    const events = parseWhatsAppWebhook(body).filter((event) => event.phoneNumberId === ours);
    if (events.length === 0) return { received: 0 };

    const ids = await runInTenant(DEFAULT_TENANT_ID, "webhook:whatsapp", async () => {
      await this.prisma.whatsAppWebhookEvent.createMany({
        data: events.map((event) => this.toRow(event)),
        skipDuplicates: true
      });
      const rows = await this.prisma.whatsAppWebhookEvent.findMany({
        select: { id: true },
        where: { dedupeKey: { in: events.map((event) => event.dedupeKey) }, ignoredAt: null, processedAt: null }
      });
      return rows.map((row) => row.id);
    });

    // After the response; the lease makes a duplicate run harmless.
    setImmediate(() => {
      void runInTenant(DEFAULT_TENANT_ID, "webhook:whatsapp.process", () => this.processMany(ids));
    });
    return { received: events.length };
  }

  /** Whether the bot may act on (or write first to) this number right now: switched on, and on the allowlist when one is set. */
  answersNumber(waId: string): boolean {
    if (!this.env.SUPPORT_BOT_ENABLED) return false;
    return this.allowlist === null || this.allowlist.has(waId);
  }

  private toRow(event: ParsedWhatsAppEvent) {
    const base = {
      dedupeKey: event.dedupeKey,
      kind: event.kind,
      occurredAt: event.occurredAt,
      providerMessageId: event.wamid,
      waId: event.waId
    };
    if (event.kind === "status") {
      return { ...base, status: event.status, statusError: event.error };
    }
    return {
      ...base,
      // Rollback is "flag off": messages that arrive meanwhile are recorded but never
      // replayed when the bot comes back on.
      ignoredAt: this.answersNumber(event.waId) ? null : new Date(),
      messageType: event.messageType,
      profileName: event.profileName,
      replyId: event.replyId,
      text: event.text
    };
  }

  private async processMany(ids: string[]): Promise<void> {
    for (const id of ids) await this.processEvent(id);
  }

  /** Claims one event and runs it. Never throws: a failure stays on the row for the sweep. */
  async processEvent(id: string): Promise<void> {
    const now = new Date();
    const claim = await this.prisma.whatsAppWebhookEvent.updateMany({
      data: { attempts: { increment: 1 }, claimedAt: now },
      where: {
        id,
        ignoredAt: null,
        OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(now.getTime() - WEBHOOK_EVENT_LEASE_MS) } }],
        processedAt: null
      }
    });
    if (claim.count === 0) return;

    const event = await this.prisma.whatsAppWebhookEvent.findUnique({ where: { id } });
    if (!event) return;
    try {
      if (event.kind === "status") await this.conversations.handleStatus(event);
      else await this.conversations.handleMessage(event);
      await this.prisma.whatsAppWebhookEvent.update({ data: { error: null, processedAt: new Date() }, where: { id } });
    } catch (error) {
      const message = (error as Error).message.slice(0, 500);
      this.logger.warn(`WhatsApp event ${id} failed (attempt ${event.attempts}): ${message}`);
      const parked = event.attempts >= WEBHOOK_EVENT_MAX_ATTEMPTS;
      await this.prisma.whatsAppWebhookEvent
        .update({
          // Keep the claim on a retryable failure: the sweep retries once the lease is stale.
          data: { error: message, ...(parked ? { ignoredAt: new Date() } : {}) },
          where: { id }
        })
        .catch(() => undefined);
    }
  }

  /** Events nobody finished: a crash after the 200, or a failure waiting for its lease to expire. */
  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    await this.jobLocks.runExclusive(JOB_LOCKS.supportWebhookSweep, async () => {
      const now = Date.now();
      const rows = await asPlatform("support:webhook-sweep", () =>
        this.prisma.whatsAppWebhookEvent.findMany({
          orderBy: { receivedAt: "asc" },
          select: { id: true, tenantId: true },
          take: SWEEP_BATCH,
          where: {
            ignoredAt: null,
            OR: [{ claimedAt: null }, { claimedAt: { lt: new Date(now - WEBHOOK_EVENT_LEASE_MS) } }],
            processedAt: null,
            receivedAt: { lt: new Date(now - SWEEP_GRACE_MS) }
          }
        })
      );
      for (const row of rows) {
        await runInTenant(row.tenantId ?? DEFAULT_TENANT_ID, "job:support.webhook", () => this.processEvent(row.id));
      }
    });
  }
}

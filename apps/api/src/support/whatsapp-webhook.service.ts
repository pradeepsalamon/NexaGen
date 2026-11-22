import { timingSafeEqual } from "node:crypto";
import { BadRequestException, ForbiddenException, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { getApiEnv } from "@nexa-chess/config/api";
import { DEFAULT_TENANT_ID } from "@nexa-chess/types";
import type { Prisma } from "@prisma/client";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";
import { asPlatform, runInTenant } from "../tenancy/tenant-context";
import { WhatsAppCredentialsService } from "../whatsapp/whatsapp-credentials.service";
import { SupportConversationService } from "./support-conversation.service";
import { SupportLeadCaptureService } from "./support-lead-capture.service";
import { type EffectiveSupportSettings, SupportSettingsService, supportAnswersNumber } from "./support-settings.service";
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

/** Where an incoming webhook goes: the academy, the number it must be for, and the secret that signs it. */
type WebhookTarget = { appSecret: string | undefined; phoneNumberId: string | undefined; tenantId: string };

/**
 * Meta → NexaGen (docs/WHATSAPP_SUPPORT.md §4). Every item is stored before
 * the 200, deduped on `dedupeKey`, and acted on after the response under a
 * `claimedAt` lease; a minute sweep picks up anything a crash left behind.
 *
 * Nexa's own number arrives on `/webhooks/whatsapp`, signed with the server's
 * WHATSAPP_APP_SECRET. Another academy's arrives on its own
 * `/webhooks/whatsapp/<webhookKey>`, signed with its own app secret
 * (docs/WHATSAPP_SUPPORT_MODES_PLAN.md §6). Either way only items for that
 * academy's number are kept: a signed payload for another number is dropped.
 */
@Injectable()
export class WhatsAppWebhookService {
  private readonly logger = new Logger(WhatsAppWebhookService.name);
  private readonly env = getApiEnv();

  constructor(
    private readonly capture: SupportLeadCaptureService,
    private readonly conversations: SupportConversationService,
    private readonly credentials: WhatsAppCredentialsService,
    private readonly jobLocks: JobLockService,
    private readonly prisma: PrismaService,
    private readonly settings: SupportSettingsService
  ) {}

  /** Meta's subscription handshake: echo the challenge when the token matches. */
  async verifySubscription(
    mode: string | undefined,
    token: string | undefined,
    challenge: string | undefined,
    webhookKey?: string
  ): Promise<string> {
    // Meta expects a 403 for a failed handshake; unconfigured or unknown looks the same from outside.
    const expected = webhookKey === undefined ? this.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN : await this.credentials.verifyTokenFor(webhookKey);
    if (!expected || mode !== "subscribe" || !token || !safeEqual(token, expected) || !challenge) {
      throw new ForbiddenException("Verification failed.");
    }
    return challenge.slice(0, 200);
  }

  /** Verifies, stores and schedules. Returns quickly: Meta retries anything slower than a few seconds. */
  async receive(rawBody: string, signature: string | string[] | undefined, webhookKey?: string): Promise<{ received: number }> {
    const target = this.targetFor(webhookKey);
    // Without the app secret nothing can be verified, so everything is refused;
    // an unknown academy key answers exactly like a bad signature.
    if (!target?.appSecret || !verifyWhatsAppSignature(rawBody, signature, target.appSecret)) {
      throw new UnauthorizedException("Invalid signature.");
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new BadRequestException("Malformed JSON.");
    }

    const events = parseWhatsAppWebhook(body).filter((event) => event.phoneNumberId === target.phoneNumberId);
    if (events.length === 0) return { received: 0 };

    const ids = await runInTenant(target.tenantId, "webhook:whatsapp", async () => {
      const settings = await this.settings.forBot();
      const capturing = this.capture.enabled(settings);
      await this.prisma.whatsAppWebhookEvent.createMany({
        data: events.map((event) => this.toRow(event, settings, capturing)),
        skipDuplicates: true
      });
      if (target.tenantId !== DEFAULT_TENANT_ID) {
        await this.prisma.whatsAppSettings.updateMany({ data: { lastWebhookAt: new Date() }, where: { tenantId: target.tenantId } });
      }
      const rows = await this.prisma.whatsAppWebhookEvent.findMany({
        select: { id: true },
        where: { dedupeKey: { in: events.map((event) => event.dedupeKey) }, ignoredAt: null, processedAt: null }
      });
      return rows.map((row) => row.id);
    });

    // After the response; the lease makes a duplicate run harmless.
    setImmediate(() => {
      void runInTenant(target.tenantId, "webhook:whatsapp.process", () => this.processMany(ids));
    });
    return { received: events.length };
  }

  private targetFor(webhookKey: string | undefined): WebhookTarget | null {
    if (webhookKey === undefined) {
      return { appSecret: this.env.WHATSAPP_APP_SECRET, phoneNumberId: this.env.WHATSAPP_PHONE_NUMBER_ID, tenantId: DEFAULT_TENANT_ID };
    }
    return this.credentials.inboundFor(webhookKey);
  }

  private toRow(event: ParsedWhatsAppEvent, settings: EffectiveSupportSettings, capturing: boolean) {
    const base = {
      dedupeKey: event.dedupeKey,
      kind: event.kind,
      occurredAt: event.occurredAt,
      phoneNumberId: event.phoneNumberId,
      providerMessageId: event.wamid,
      waId: event.waId
    };
    if (event.kind === "status") {
      return { ...base, status: event.status, statusError: event.error };
    }
    return {
      ...base,
      // Rollback is "switch off": messages that arrive meanwhile are recorded but never
      // replayed when the bot comes back on. Lead capture works with the bot off, so its
      // messages are processed (capture only; the bot still never answers them).
      ignoredAt: capturing || supportAnswersNumber(settings, event.waId) ? null : new Date(),
      ...(event.adReferral ? { adReferral: event.adReferral as unknown as Prisma.InputJsonObject } : {}),
      mediaCaption: event.media?.caption ?? null,
      mediaFilename: event.media?.filename ?? null,
      mediaId: event.media?.id ?? null,
      mediaMimeType: event.media?.mimeType ?? null,
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
      else await this.handleCustomerMessage(event);
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

  /**
   * Lead capture first (when on), then the bot, only for a number it answers now: with capture
   * on, a message may be stored only for capture. With capture off this is the bot alone, as
   * before. A capture failure doesn't stop the bot's answer; it fails the event afterwards, and
   * the retry is harmless on both sides (capture and the transcript are idempotent per message).
   */
  private async handleCustomerMessage(event: Prisma.WhatsAppWebhookEventGetPayload<object>): Promise<void> {
    const settings = await this.settings.forBot();
    const capturing = this.capture.enabled(settings);
    let captureError: unknown = null;
    if (capturing) {
      try {
        await this.capture.capture(event);
      } catch (error) {
        captureError = error;
      }
    }
    if (!capturing || supportAnswersNumber(settings, event.waId)) await this.conversations.handleMessage(event);
    if (captureError) throw captureError;
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

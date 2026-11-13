import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { DEFAULT_TENANT_ID, markdownToWhatsApp, MESSAGE_MAX_ATTEMPTS } from "@nexa-chess/types";
import type { MessageDelivery } from "@prisma/client";
import { EmailPreferencesService } from "../email-admin/email-preferences.service";
import { MailService } from "../mail/mail.service";
import { NotificationService } from "../notification/notification.service";
import { PrismaService } from "../prisma/prisma.service";
import { runInTenant } from "../tenancy/tenant-context";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { nextAttemptAt } from "./messaging.schedule";


/** Rows claimed per sweep. Caps how long one tick can run. */
const BATCH_SIZE = 200;
/** A claim older than this is assumed abandoned (process died mid-send). */
const CLAIM_TIMEOUT_MS = 5 * 60_000;
/** Stop before our own claims go stale, or another container could send them too. */
const SWEEP_BUDGET_MS = CLAIM_TIMEOUT_MS - 60_000;

/**
 * The outbox sender. Every minute it claims the `message_deliveries` rows that
 * are due and delivers them.
 *
 * Claiming is `FOR UPDATE SKIP LOCKED` + a `claimedAt` stamp rather than a plain
 * read, so a second API container (or a tick that overruns into the next one)
 * takes different rows instead of sending the same message twice.
 */
@Injectable()
export class MessagingDeliveryWorker {
  private readonly logger = new Logger(MessagingDeliveryWorker.name);
  private running = false;

  constructor(
    private readonly emailPreferences: EmailPreferencesService,
    private readonly mail: MailService,
    private readonly notifications: NotificationService,
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsAppService
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sweep(): Promise<void> {
    // Belt to the claim's braces: never stack ticks inside one process.
    if (this.running) return;
    this.running = true;

    try {
      const claimed = await this.claimDue();
      if (claimed.length === 0) return;

      let sent = 0;
      let failed = 0;
      const deadline = Date.now() + SWEEP_BUDGET_MS;
      for (const delivery of claimed) {
        // Unsent rows wait for their claim to go stale, then a later sweep takes them.
        if (Date.now() > deadline) break;
        // The claim spans academies; each row is sent as its own academy
        // (docs/SAAS_MULTI_TENANCY.md § "Phase 3 plan", slice 2).
        const ok = await runInTenant(delivery.tenantId ?? DEFAULT_TENANT_ID, "job:messaging.outbox", () =>
          this.deliver(delivery)
        );
        if (ok) sent += 1;
        else failed += 1;
      }

      this.logger.log(`Outbox: ${sent} sent, ${failed} failed or retrying.`);
    } catch (error) {
      this.logger.error("Outbox sweep failed", error as Error);
    } finally {
      this.running = false;
    }
  }

  /**
   * Takes ownership of up to BATCH_SIZE due rows in one statement.
   *
   * Both cutoffs bind `${iso}::timestamp`, never a JS `Date`: these columns are
   * `timestamp WITHOUT time zone` holding UTC, and a bound Date arrives as
   * `timestamptz` that PostgreSQL then shifts by the session zone (a no-op on
   * the UTC box, an hours-wide bug on any other). See AGENTS.md.
   */
  private async claimDue(now: Date = new Date()): Promise<MessageDelivery[]> {
    const nowIso = now.toISOString();
    const staleIso = new Date(now.getTime() - CLAIM_TIMEOUT_MS).toISOString();

    return this.prisma.$queryRaw<MessageDelivery[]>`
      UPDATE message_deliveries
         SET "claimedAt" = ${nowIso}::timestamp
       WHERE id IN (
         SELECT id
           FROM message_deliveries
          WHERE status = 'PENDING'
            AND "scheduledFor" <= ${nowIso}::timestamp
            AND ("claimedAt" IS NULL OR "claimedAt" < ${staleIso}::timestamp)
          ORDER BY "scheduledFor" ASC
          LIMIT ${BATCH_SIZE}
            FOR UPDATE SKIP LOCKED
       )
      RETURNING *
    `;
  }

  private async deliver(delivery: MessageDelivery): Promise<boolean> {
    const attempts = delivery.attempts + 1;

    try {
      if (delivery.channel === "IN_APP") {
        await this.notifications.notify({
          userId: delivery.recipientId ?? "",
          type: delivery.event,
          title: delivery.title ?? delivery.body.slice(0, 120),
          body: delivery.body,
          linkPath: delivery.linkPath,
          dedupeKey: delivery.dedupeKey
        });
        await this.markSent(delivery.id, attempts, null);
        return true;
      }

      if (delivery.channel === "EMAIL") {
        return await this.deliverEmail(delivery, attempts);
      }

      if (!this.whatsapp.isConfigured()) {
        // Not a provider failure and not worth 5 retries — an admin has to act.
        await this.markFailed(
          delivery.id,
          attempts,
          "WhatsApp is not configured on this server."
        );
        return false;
      }

      const to = delivery.recipientPhone;
      if (!to) {
        await this.markFailed(delivery.id, attempts, "No phone number on the message.");
        return false;
      }

      // A row may carry an attachment (an invoice PDF), resolved at queue time
      // so this worker never reaches back into a feature module to build one.
      const document =
        delivery.documentMediaId || delivery.documentLink
          ? {
              mediaId: delivery.documentMediaId ?? undefined,
              link: delivery.documentLink ?? undefined,
              filename: delivery.documentFilename ?? undefined
            }
          : null;

      // Template, document or text: WhatsAppService.trySendMessage makes the choice for every caller.
      // A templated row with a document sends it as the template's DOCUMENT header, so the
      // template must be approved with one or Meta rejects the payload.
      const outcome = await this.whatsapp.trySendMessage({
        document,
        template: delivery.templateName
          ? {
              bodyParams: delivery.templateParams,
              language: delivery.templateLanguage ?? undefined,
              name: delivery.templateName
            }
          : null,
        text: markdownToWhatsApp(delivery.body),
        to
      });

      if (outcome.ok) {
        await this.markSent(delivery.id, attempts, outcome.result.messageId);
        return true;
      }

      // Retryable means the provider said "later" (rate limit, outage); a
      // rejected payload would fail identically every time, so it stops here.
      if (outcome.error.retryable && attempts < MESSAGE_MAX_ATTEMPTS) {
        await this.scheduleRetry(delivery.id, attempts, outcome.error.message);
        return false;
      }

      await this.markFailed(delivery.id, attempts, outcome.error.message);
      return false;
    } catch (error) {
      const message = (error as Error).message;
      if (attempts < MESSAGE_MAX_ATTEMPTS) {
        await this.scheduleRetry(delivery.id, attempts, message);
      } else {
        await this.markFailed(delivery.id, attempts, message);
      }
      return false;
    }
  }

  /** The address is read now, so a changed email is respected and a deleted account gets nothing. */
  private async deliverEmail(delivery: MessageDelivery, attempts: number): Promise<boolean> {
    if (!this.mail.isConfigured()) {
      await this.markFailed(delivery.id, attempts, "Email is not configured on this server.");
      return false;
    }

    const recipient = delivery.recipientId
      ? await this.emailPreferences.targetFor(delivery.recipientId)
      : null;
    if (!recipient) {
      await this.markFailed(delivery.id, attempts, "The recipient's account no longer exists.");
      return false;
    }
    // Checked at send time, so unsubscribing also stops what is already queued.
    if (recipient.optedOut) {
      await this.prisma.messageDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "SKIPPED",
          attempts,
          claimedAt: null,
          error: "The recipient turned off notification emails.",
          lastAttemptAt: new Date()
        }
      });
      return false;
    }

    try {
      const messageId = await this.mail.sendRuleEmail({
        to: recipient.email,
        subject: delivery.title ?? delivery.body.slice(0, 120),
        body: delivery.body,
        unsubscribeUrl: recipient.unsubscribeUrl
      });
      await this.markSent(delivery.id, attempts, messageId);
      return true;
    } catch (error) {
      // A 5xx is the mail server refusing this message, which would repeat on every retry.
      const code = (error as { responseCode?: number }).responseCode ?? 0;
      if (code >= 500) {
        await this.markFailed(delivery.id, attempts, (error as Error).message);
        return false;
      }
      throw error;
    }
  }

  private markSent(id: string, attempts: number, providerMessageId: string | null) {
    return this.prisma.messageDelivery.update({
      where: { id },
      data: {
        status: "SENT",
        attempts,
        lastAttemptAt: new Date(),
        sentAt: new Date(),
        claimedAt: null,
        error: null,
        providerMessageId
      }
    });
  }

  private markFailed(id: string, attempts: number, error: string) {
    return this.prisma.messageDelivery.update({
      where: { id },
      data: {
        status: "FAILED",
        attempts,
        lastAttemptAt: new Date(),
        claimedAt: null,
        error
      }
    });
  }

  /** Stays PENDING with a later due time — the sweep picks it up again. */
  private scheduleRetry(id: string, attempts: number, error: string) {
    return this.prisma.messageDelivery.update({
      where: { id },
      data: {
        status: "PENDING",
        attempts,
        lastAttemptAt: new Date(),
        scheduledFor: nextAttemptAt(attempts),
        claimedAt: null,
        error
      }
    });
  }
}

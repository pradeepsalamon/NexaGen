import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { PaymentProvider } from "@nexa-chess/types";
import {
  Prisma,
  RefundStatus,
  WebhookEventStatus,
  type Payment
} from "@prisma/client";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentService } from "./payment.service";
import { toJson } from "./payments.util";
import type { WebhookResult } from "./providers/payment-provider.interface";
import { ProviderRegistry } from "./providers/provider-registry.service";
import { RefundService } from "./refund.service";
import { SubscriptionService } from "./subscription.service";

/** How long a FAILED event stays eligible for automatic recovery. */
const RECOVERY_WINDOW_HOURS = 24;
const MAX_RECOVERY_ATTEMPTS = 6;

/**
 * Inbound webhooks (§10).
 *
 * Order of operations, and why:
 *
 *  1. Verify the signature. An unverified payload is persisted (for the audit
 *     trail) and then dropped — it is never acted on, and there is no bypass.
 *  2. Persist the event. The unique (provider, eventId) means a redelivery
 *     collides on insert, so the handler runs exactly once per event.
 *  3. Resolve it to one of our rows, then hand the state to PaymentService,
 *     which applies the rank guard. That is what makes out-of-order delivery
 *     safe rather than merely unlikely.
 *
 * A handler failure marks the row FAILED and leaves it for the recovery sweep;
 * the HTTP response is still 200, because a provider that retries forever on a
 * bug of ours is worse than a row we can replay ourselves.
 */
@Injectable()
export class PaymentWebhookService {
  private readonly logger = new Logger(PaymentWebhookService.name);

  constructor(
    private readonly jobLocks: JobLockService,
    private readonly payments: PaymentService,
    private readonly prisma: PrismaService,
    private readonly refunds: RefundService,
    private readonly registry: ProviderRegistry,
    private readonly subscriptions: SubscriptionService
  ) {}

  async handle(
    provider: PaymentProvider,
    rawBody: string,
    headers: Record<string, string | string[] | undefined>
  ): Promise<{ received: true; status: WebhookEventStatus }> {
    if (typeof rawBody !== "string" || rawBody.length === 0) {
      // main.ts mounts express.text on these routes; an object here means the
      // raw body was consumed by a JSON parser and signatures cannot be checked.
      throw new BadRequestException("Webhook body must be raw text.");
    }

    const adapter = this.registry.get(provider);
    const result = await adapter.handleWebhook({ rawBody, headers });

    if (!result.signatureValid) {
      // Never persisted: an unsigned request would otherwise claim its event id
      // and make the genuine signed delivery look like a duplicate.
      this.logger.warn(
        `Rejected an unsigned ${provider} webhook (${result.eventType}).`
      );
      // 400 tells a genuinely misconfigured integration that something is
      // wrong, rather than silently swallowing every event.
      throw new BadRequestException("Invalid webhook signature.");
    }

    const event = await this.persist(provider, result, WebhookEventStatus.RECEIVED);
    if (!event) {
      // Already seen. This is the common case for a provider retry.
      return { received: true, status: WebhookEventStatus.PROCESSED };
    }

    const status = await this.process(event.id, provider, result);
    return { received: true, status };
  }

  /**
   * Applies one verified event. Separated from `handle` so the recovery sweep
   * can replay a stored payload without re-verifying a signature it already
   * checked.
   */
  private async process(
    eventId: string,
    provider: PaymentProvider,
    result: WebhookResult
  ): Promise<WebhookEventStatus> {
    try {
      const status = await this.dispatch(provider, result);
      await this.prisma.paymentWebhookEvent.update({
        where: { id: eventId },
        data: {
          status,
          processedAt: new Date(),
          attempts: { increment: 1 },
          error: null
        }
      });
      return status;
    } catch (error) {
      const message = (error as Error).message;
      this.logger.error(
        `Failed to process ${provider} webhook ${result.eventType}: ${message}`
      );
      await this.prisma.paymentWebhookEvent.update({
        where: { id: eventId },
        data: {
          status: WebhookEventStatus.FAILED,
          attempts: { increment: 1 },
          error: message.slice(0, 500)
        }
      });
      return WebhookEventStatus.FAILED;
    }
  }

  private async dispatch(
    provider: PaymentProvider,
    result: WebhookResult
  ): Promise<WebhookEventStatus> {
    switch (result.subject) {
      case "PAYMENT":
        return this.applyPayment(provider, result);
      case "REFUND":
        return this.applyRefund(provider, result);
      case "SUBSCRIPTION":
        return this.subscriptions.applyWebhook(provider, result);
      default:
        return WebhookEventStatus.IGNORED;
    }
  }

  private async applyPayment(
    provider: PaymentProvider,
    result: WebhookResult
  ): Promise<WebhookEventStatus> {
    if (!result.paymentStatus) return WebhookEventStatus.IGNORED;

    const payment = await this.resolvePayment(provider, result);
    if (!payment) {
      // An event for something we never created — a test ping, or another
      // integration on the same gateway account. Recording it is enough.
      return WebhookEventStatus.IGNORED;
    }

    await this.prisma.paymentWebhookEvent.updateMany({
      where: { provider, eventId: result.eventId },
      data: { paymentId: payment.id }
    });

    await this.payments.applyProviderState(
      payment.id,
      {
        providerPaymentId: result.providerPaymentId,
        providerOrderId: result.providerOrderId,
        status: result.paymentStatus,
        method: result.method,
        methodDetail: result.methodDetail,
        amount: result.amount,
        amountRefunded: result.amountRefunded ?? 0,
        currency: result.currency,
        failureCode: result.failureCode,
        failureMessage: result.failureMessage,
        paidAt: result.paidAt,
        raw: result.raw
      },
      `webhook:${result.eventType}`
    );

    return WebhookEventStatus.PROCESSED;
  }

  private async applyRefund(
    provider: PaymentProvider,
    result: WebhookResult
  ): Promise<WebhookEventStatus> {
    if (!result.refundStatus) return WebhookEventStatus.IGNORED;

    const refund = result.providerRefundId
      ? await this.prisma.refund.findFirst({
          where: { provider, providerRefundId: result.providerRefundId }
        })
      : null;

    // Some gateways report the refund only against the payment, so fall back to
    // the newest unsettled refund on that payment.
    const fallback =
      !refund && result.providerPaymentId
        ? await this.prisma.refund.findFirst({
            where: {
              provider,
              payment: { providerPaymentId: result.providerPaymentId },
              status: { in: [RefundStatus.PENDING, RefundStatus.PROCESSING] }
            },
            orderBy: { createdAt: "desc" }
          })
        : null;

    const target = refund ?? fallback;
    if (!target) return WebhookEventStatus.IGNORED;

    await this.refunds.applyProviderState(target.id, {
      providerRefundId: result.providerRefundId ?? target.providerRefundId,
      status: result.refundStatus,
      amount: result.amountRefunded ?? target.amount,
      raw: result.raw
    });

    return WebhookEventStatus.PROCESSED;
  }

  /**
   * Matches an event to our payment. Tries our own id first (the gateway echoes
   * it back in notes/metadata), then the provider's payment handle, then the
   * order handle — the browser can die before we learn the payment id, and the
   * webhook is then the only thing that knows it.
   */
  private async resolvePayment(
    provider: PaymentProvider,
    result: WebhookResult
  ): Promise<Payment | null> {
    if (result.paymentId) {
      const byId = await this.prisma.payment.findUnique({
        where: { id: result.paymentId }
      });
      if (byId) return byId;
    }

    if (result.providerPaymentId) {
      const byHandle = await this.prisma.payment.findFirst({
        where: { provider, providerPaymentId: result.providerPaymentId }
      });
      if (byHandle) return byHandle;
    }

    if (result.providerOrderId) {
      return this.prisma.payment.findFirst({
        where: { provider, providerOrderId: result.providerOrderId },
        orderBy: { createdAt: "desc" }
      });
    }

    return null;
  }

  /**
   * Inserts the audit row. Returns null when the event was already stored,
   * which is exactly how a redelivery is detected — a race between two
   * simultaneous deliveries loses on the unique index rather than on a check.
   */
  private async persist(
    provider: PaymentProvider,
    result: WebhookResult,
    status: WebhookEventStatus,
    extra: { error?: string } = {}
  ): Promise<{ id: string } | null> {
    try {
      return await this.prisma.paymentWebhookEvent.create({
        data: {
          provider,
          eventId: result.eventId,
          eventType: result.eventType.slice(0, 120),
          status,
          signatureValid: result.signatureValid,
          payload: toJson(result.raw),
          paymentId: result.paymentId,
          error: extra.error ?? null,
          processedAt:
            status === WebhookEventStatus.RECEIVED ? null : new Date()
        },
        select: { id: true }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Failed-event recovery (§10). Re-runs handlers for events that blew up on a
   * transient problem — a database blip, a gateway timeout during
   * reconciliation — without asking the provider to redeliver.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async recoverFailedEvents(): Promise<void> {
    await this.jobLocks.runExclusive(JOB_LOCKS.paymentWebhookRecovery, () =>
      this.recoverFailedEventsNow()
    );
  }

  private async recoverFailedEventsNow(): Promise<void> {
    const since = new Date(Date.now() - RECOVERY_WINDOW_HOURS * 60 * 60 * 1000);

    const failed = await this.prisma.paymentWebhookEvent.findMany({
      where: {
        status: WebhookEventStatus.FAILED,
        receivedAt: { gte: since },
        attempts: { lt: MAX_RECOVERY_ATTEMPTS }
      },
      orderBy: { receivedAt: "asc" },
      take: 25
    });

    for (const event of failed) {
      // A webhook can never carry provider MANUAL — no route accepts one — so
      // this narrows what `PaymentWebhookEvent.provider`'s (wide, DB-level)
      // type allows back down to the 3 real gateways this service deals in.
      if (event.provider === "MANUAL") continue;
      const provider: PaymentProvider = event.provider;

      const adapter = this.registry.get(provider);
      try {
        // The stored payload is re-parsed through the adapter so the mapping
        // logic stays in one place, but the signature is not re-checked: it was
        // verified when the event was accepted.
        const result = await adapter.handleWebhook({
          rawBody: JSON.stringify(event.payload),
          headers: {}
        });
        await this.process(event.id, provider, {
          ...result,
          eventId: event.eventId,
          signatureValid: true
        });
      } catch (error) {
        this.logger.warn(
          `Recovery of webhook ${event.id} failed: ${(error as Error).message}`
        );
      }
    }
  }
}

import { BadRequestException, Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PlatformCheckoutStatus, Prisma } from "@prisma/client";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService } from "../prisma/prisma.service";
import { asPlatform } from "../tenancy/tenant-context";
import { PlatformBillingService } from "./platform-billing.service";
import { PlatformRazorpayClient, type PlatformGatewayPayment } from "./platform-razorpay.client";

const PROVIDER = "RAZORPAY";
const SETTLING_EVENTS = new Set(["order.paid", "payment.captured"]);

function header(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/**
 * The owner's Razorpay webhook (docs/SAAS_MULTI_TENANCY.md §G; Phase 6),
 * `/platform-billing/webhooks/razorpay`, CSRF-exempt and raw-bodied like the
 * student gateways' routes.
 *
 * 1. An unsigned request is refused and never stored (it would otherwise
 *    claim an event id and make the genuine delivery look like a duplicate).
 * 2. The event is stored once by (provider, eventId); a redelivery of a
 *    processed event is a no-op. A FAILED event is tried again.
 * 3. `order.paid` / `payment.captured` settle the checkout the order belongs
 *    to, through the same claim as the reconcile path.
 */
@Injectable()
export class PlatformBillingWebhookService {
  private readonly logger = new Logger(PlatformBillingWebhookService.name);

  constructor(
    private readonly billing: PlatformBillingService,
    private readonly gateway: PlatformRazorpayClient,
    private readonly jobLocks: JobLockService,
    private readonly prisma: PrismaService
  ) {}

  async handle(rawBody: unknown, headers: Record<string, string | string[] | undefined>): Promise<{ received: true; status: string }> {
    if (typeof rawBody !== "string" || rawBody.length === 0) throw new BadRequestException("Webhook body must be raw text.");
    if (!this.gateway.verifyWebhook(rawBody, header(headers, "x-razorpay-signature"))) {
      this.logger.warn("Rejected an unsigned platform billing webhook.");
      throw new BadRequestException("Invalid webhook signature.");
    }
    let payload: Record<string, unknown>;
    try {
      payload = asRecord(JSON.parse(rawBody)) ?? {};
    } catch {
      throw new BadRequestException("Webhook body is not JSON.");
    }
    const eventType = typeof payload.event === "string" ? payload.event : "unknown";
    const eventId = header(headers, "x-razorpay-event-id") ?? PlatformRazorpayClient.hashPayload(rawBody);

    return asPlatform("platform-billing:webhook", async () => {
      const event = await this.claimEvent(eventId, eventType, rawBody);
      if (!event) return { received: true as const, status: "DUPLICATE" };
      try {
        const status = await this.process(eventType, payload);
        await this.prisma.platformWebhookEvent.update({ data: { error: null, processedAt: new Date(), status }, where: { id: event.id } });
        return { received: true as const, status };
      } catch (error) {
        const message = (error as Error).message.slice(0, 500);
        await this.prisma.platformWebhookEvent.update({ data: { error: message, status: "FAILED" }, where: { id: event.id } });
        this.logger.error(`Platform billing webhook ${eventId} (${eventType}) failed: ${message}`);
        // A 5xx makes Razorpay deliver again; the FAILED row is retried then.
        throw new InternalServerErrorException("Webhook could not be applied.");
      }
    });
  }

  /** The stored event, or null when this delivery was already handled. */
  private async claimEvent(eventId: string, eventType: string, rawBody: string) {
    try {
      return await this.prisma.platformWebhookEvent.create({
        data: { eventId, eventType, payloadHash: PlatformRazorpayClient.hashPayload(rawBody), provider: PROVIDER }
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
      const retried = await this.prisma.platformWebhookEvent.updateMany({
        data: { status: "RECEIVED" },
        where: { eventId, provider: PROVIDER, status: "FAILED" }
      });
      return retried.count === 1
        ? this.prisma.platformWebhookEvent.findUniqueOrThrow({ where: { provider_eventId: { eventId, provider: PROVIDER } } })
        : null;
    }
  }

  private async process(eventType: string, payload: Record<string, unknown>): Promise<string> {
    const body = asRecord(payload.payload);
    const entity = asRecord(asRecord(body?.payment)?.entity);
    if (!entity || typeof entity.order_id !== "string") return "IGNORED";
    if (eventType === "payment.failed") {
      const reason = entity.error_description;
      await this.prisma.platformCheckout.updateMany({
        data: { failureReason: typeof reason === "string" ? reason.slice(0, 300) : "Payment failed" },
        where: { providerOrderId: entity.order_id, status: PlatformCheckoutStatus.CREATED }
      });
      return "PROCESSED";
    }
    if (!SETTLING_EVENTS.has(eventType)) return "IGNORED";
    const payment: PlatformGatewayPayment | null =
      typeof entity.id === "string" && typeof entity.amount === "number"
        ? {
            amountMinor: entity.amount,
            currency: typeof entity.currency === "string" ? entity.currency : "INR",
            id: entity.id,
            orderId: entity.order_id,
            status: typeof entity.status === "string" ? entity.status : "unknown"
          }
        : null;
    if (!payment) return "IGNORED";
    return (await this.billing.settle(entity.order_id, payment)) ? "PROCESSED" : "IGNORED";
  }

  /**
   * A missed webhook is not a lost payment: open checkouts with an order are
   * read from Razorpay every hour until they are paid or expire.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async reconcileCron(): Promise<void> {
    if (!this.gateway.isConfigured()) return;
    await this.jobLocks.runExclusive(JOB_LOCKS.platformCheckoutReconcile, () => this.reconcileOpen());
  }

  async reconcileOpen(now = new Date()): Promise<number> {
    const open = await asPlatform("platform-billing:reconcile-sweep", () =>
      this.prisma.platformCheckout.findMany({
        select: { id: true },
        take: 200,
        where: {
          createdAt: { lte: new Date(now.getTime() - 10 * 60_000) },
          expiresAt: { gt: now },
          providerOrderId: { not: null },
          status: PlatformCheckoutStatus.CREATED
        }
      })
    );
    let paid = 0;
    for (const checkout of open) {
      try {
        if (await this.billing.reconcile(checkout.id)) paid += 1;
      } catch (error) {
        this.logger.warn(`Reconcile skipped checkout ${checkout.id}: ${(error as Error).message}`);
      }
    }
    return paid;
  }
}

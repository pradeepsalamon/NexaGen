import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { getApiEnv } from "@nexa-chess/config/api";
import { OrderStatus, PaymentStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PaymentService } from "./payment.service";
import { SubscriptionService } from "./subscription.service";

/** Postgres advisory lock, so only one API replica sweeps at a time. */
const RECONCILIATION_LOCK = 73002060;

/** How many in-flight payments one sweep will chase. */
const BATCH_SIZE = 40;

/**
 * The safety net behind every optimistic path.
 *
 * Webhooks get lost, browsers get closed mid-payment, and a gateway can time
 * out after it has already taken the money. This sweep asks each provider what
 * actually happened to every payment still in flight, and routes the answer
 * through the same PaymentService funnel as everything else — so a payment
 * discovered here grants access exactly like one confirmed by webhook.
 *
 * This is also what makes §17's rule enforceable: a retry is only ever offered
 * against another provider once the original attempt has been reconciled.
 */
@Injectable()
export class PaymentReconciliationService {
  private readonly env = getApiEnv();
  private readonly logger = new Logger(PaymentReconciliationService.name);

  constructor(
    private readonly payments: PaymentService,
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionService
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async sweep(): Promise<void> {
    if (!this.env.PAYMENTS_ENABLED) return;

    const locked = await this.acquireLock();
    if (!locked) return;

    try {
      await this.reconcileInFlight();
      await this.expireStaleOrders();
      await this.subscriptions.expireLapsed();
    } catch (error) {
      this.logger.error(
        `Payment reconciliation sweep failed: ${(error as Error).message}`
      );
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * Asks each provider about payments that are still open. Deliberately skips
   * the first minute — a payment created seconds ago is simply a user still
   * looking at the gateway, not a lost one.
   */
  private async reconcileInFlight(): Promise<void> {
    const settleWindowStart = new Date(Date.now() - 60 * 1000);
    const horizon = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const stale = await this.prisma.payment.findMany({
      where: {
        status: {
          in: [
            PaymentStatus.CREATED,
            PaymentStatus.PENDING,
            PaymentStatus.PROCESSING,
            PaymentStatus.AUTHORIZED
          ]
        },
        createdAt: { lt: settleWindowStart, gte: horizon }
      },
      orderBy: { createdAt: "asc" },
      take: BATCH_SIZE,
      select: { id: true }
    });

    for (const payment of stale) {
      try {
        await this.payments.reconcile(payment.id);
      } catch (error) {
        this.logger.warn(
          `Could not reconcile payment ${payment.id}: ${(error as Error).message}`
        );
      }
    }

    if (stale.length > 0) {
      this.logger.log(`Reconciled ${stale.length} in-flight payments.`);
    }
  }

  /**
   * Closes orders nobody ever paid. Only orders with no settled payment are
   * touched — the `status: { in: [...] }` filter is what keeps a paid order
   * from being expired by a clock.
   */
  private async expireStaleOrders(): Promise<void> {
    const cutoff = new Date(
      Date.now() - this.env.PAYMENTS_ORDER_TTL_MINUTES * 60 * 1000
    );

    const { count } = await this.prisma.order.updateMany({
      where: {
        status: { in: [OrderStatus.CREATED, OrderStatus.PENDING] },
        expiresAt: { not: null, lt: cutoff },
        payments: {
          none: {
            status: {
              in: [
                PaymentStatus.PAID,
                PaymentStatus.AUTHORIZED,
                PaymentStatus.REFUND_PENDING,
                PaymentStatus.PARTIALLY_REFUNDED,
                PaymentStatus.REFUNDED
              ]
            }
          }
        }
      },
      data: { status: OrderStatus.EXPIRED }
    });

    if (count > 0) {
      this.logger.log(`Expired ${count} unpaid orders.`);
    }
  }

  private async acquireLock(): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ locked: boolean }[]>`
      SELECT pg_try_advisory_lock(${RECONCILIATION_LOCK}) AS locked
    `;
    return rows[0]?.locked === true;
  }

  private async releaseLock(): Promise<void> {
    await this.prisma
      .$queryRaw`SELECT pg_advisory_unlock(${RECONCILIATION_LOCK})`;
  }
}

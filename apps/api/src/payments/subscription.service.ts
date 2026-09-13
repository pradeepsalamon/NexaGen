import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { getApiEnv, getFrontendUrl } from "@nexa-chess/config/api";
import {
  BILLING_INTERVAL_MONTHS,
  isActiveSubscriptionStatus,
  type CancelSubscriptionRequest,
  type CheckoutHandoff,
  type PaymentProvider,
  type SubscriptionItem
} from "@nexa-chess/types";
import {
  EntitlementStatus,
  Prisma,
  SubscriptionStatus,
  WebhookEventStatus,
  type User
} from "@prisma/client";
import { MessagingDispatchService } from "../messaging/messaging-dispatch.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertOwnerOrAdmin, fullName } from "./payments-auth.helper";
import { addMonths, normalizePhone } from "./payments.util";
import type { WebhookResult } from "./providers/payment-provider.interface";
import { ProviderRegistry } from "./providers/provider-registry.service";

type SubscriptionRow = Prisma.SubscriptionGetPayload<{
  include: {
    plan: { select: { name: true } };
    user: { select: { firstName: true; lastName: true } };
  };
}>;

const SUBSCRIPTION_INCLUDE = {
  plan: { select: { name: true } },
  user: { select: { firstName: true, lastName: true } }
} satisfies Prisma.SubscriptionInclude;

/**
 * Recurring plans (§13).
 *
 * We mirror provider state rather than owning it: the mandate at the gateway is
 * what actually charges the card, so a renewal becomes real here only when the
 * provider says it happened. Not every method recurs — a gateway that cannot
 * mandate the chosen method simply is not offered for a recurring plan.
 */
@Injectable()
export class SubscriptionService {
  private readonly env = getApiEnv();
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    private readonly messaging: MessagingDispatchService,
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistry
  ) {}

  /**
   * Opens a subscription at the provider. Returns the handoff the browser needs
   * to authorise the mandate — nothing is active until the provider confirms.
   */
  async start(
    user: User,
    planId: string,
    provider: PaymentProvider,
    /** The order this mandate was opened from, so the first charge has a home. */
    options: { orderId?: string } = {}
  ): Promise<{ subscription: SubscriptionItem; handoff: CheckoutHandoff }> {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });
    if (!plan || !plan.isActive) {
      throw new NotFoundException("This plan is not available.");
    }

    const months = BILLING_INTERVAL_MONTHS[plan.interval];
    if (months === null) {
      throw new ConflictException("This plan is not a recurring plan.");
    }

    const existing = await this.prisma.subscription.findFirst({
      where: {
        userId: user.id,
        planId,
        status: {
          in: [
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.PAST_DUE,
            SubscriptionStatus.PENDING_ACTIVATION
          ]
        }
      }
    });
    if (existing) {
      throw new ConflictException(
        "You already have a subscription to this plan."
      );
    }

    const adapter = this.registry.require(provider);
    if (!adapter.createSubscription) {
      throw new ConflictException(
        `${provider} does not support recurring payments here.`
      );
    }

    const subscription = await this.prisma.subscription.create({
      data: {
        userId: user.id,
        planId: plan.id,
        provider,
        status: SubscriptionStatus.CREATED,
        interval: plan.interval,
        // Frozen at subscribe time: a later price change must not re-price an
        // existing subscriber without their consent.
        amount: plan.amount,
        currency: plan.currency,
        initialOrderId: options.orderId ?? null
      }
    });

    try {
      const result = await adapter.createSubscription({
        subscriptionId: subscription.id,
        planName: plan.name,
        planCode: plan.code,
        amount: plan.amount,
        currency: plan.currency,
        intervalMonths: months,
        customer: {
          id: user.id,
          name: fullName(user) ?? user.email,
          email: user.email,
          phone: normalizePhone(
            user.phoneNumber,
            this.env.WHATSAPP_DEFAULT_COUNTRY_CODE
          )
        },
        returnUrl: `${getFrontendUrl(this.env)}/student/billing?subscription=${subscription.id}`,
        notes: { planId: plan.id, userId: user.id }
      });

      const updated = await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          providerSubscriptionId: result.providerSubscriptionId,
          providerCustomerId: result.providerCustomerId,
          status: result.status,
          nextBillingDate: result.nextBillingDate
        },
        include: SUBSCRIPTION_INCLUDE
      });

      return { subscription: this.toItem(updated), handoff: result.handoff };
    } catch (error) {
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: SubscriptionStatus.CANCELLED, cancelReason: "Setup failed." }
      });
      throw error;
    }
  }

  async cancel(
    user: User,
    subscriptionId: string,
    dto: CancelSubscriptionRequest
  ): Promise<SubscriptionItem> {
    const subscription = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      include: SUBSCRIPTION_INCLUDE
    });
    if (!subscription) throw new NotFoundException("Subscription not found.");
    assertOwnerOrAdmin(user, subscription.userId);

    if (!isActiveSubscriptionStatus(subscription.status)) {
      throw new ConflictException("This subscription is not active.");
    }

    const adapter = this.registry.get(subscription.provider);
    if (!adapter.cancelSubscription || !subscription.providerSubscriptionId) {
      // Nothing to cancel at the gateway. Recording it locally is still right —
      // but it is worth knowing about, because it usually means the mandate was
      // never completed.
      this.logger.warn(
        `Subscription ${subscription.id} was cancelled locally only — ${subscription.provider} has no mandate for it.`
      );
    } else {
      // Cancel at the gateway FIRST. A local cancel that the provider never
      // heard about would keep billing the customer.
      await adapter.cancelSubscription({
        providerSubscriptionId: subscription.providerSubscriptionId,
        atPeriodEnd: dto.atPeriodEnd
      });
    }

    const updated = await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        cancelAtPeriodEnd: dto.atPeriodEnd,
        cancelReason: dto.reason ?? null,
        cancelledAt: new Date(),
        // Paid-for access runs to the end of the period the member bought.
        status: dto.atPeriodEnd
          ? subscription.status
          : SubscriptionStatus.CANCELLED
      },
      include: SUBSCRIPTION_INCLUDE
    });

    if (!dto.atPeriodEnd) {
      await this.expireEntitlements(subscription.id, "Subscription cancelled.");
    }

    return this.toItem(updated);
  }

  /**
   * Applies a subscription webhook. Renewals, failures, cancellations and
   * expiries all land here, and the row is only moved when the provider's state
   * actually differs.
   */
  async applyWebhook(
    provider: PaymentProvider,
    result: WebhookResult
  ): Promise<WebhookEventStatus> {
    const handle = result.providerSubscriptionId;
    if (!handle) return WebhookEventStatus.IGNORED;

    const subscription = await this.prisma.subscription.findFirst({
      where: {
        provider,
        OR: [
          { providerSubscriptionId: handle },
          // Stripe's first webhook carries the real subscription id while we
          // still hold the checkout session id we opened it with.
          { providerSubscriptionId: result.providerOrderId ?? "__none__" }
        ]
      }
    });
    if (!subscription) return WebhookEventStatus.IGNORED;

    const renewalFailed =
      result.eventType.includes("payment_failed") ||
      result.eventType.includes("charge.failed") ||
      result.subscriptionStatus === SubscriptionStatus.PAST_DUE;

    const nextStatus = result.subscriptionStatus ?? subscription.status;

    await this.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        providerSubscriptionId: handle,
        status: nextStatus,
        nextBillingDate: result.nextBillingDate ?? subscription.nextBillingDate,
        currentPeriodEnd:
          result.nextBillingDate ?? subscription.currentPeriodEnd,
        startDate:
          subscription.startDate ??
          (nextStatus === SubscriptionStatus.ACTIVE ? new Date() : null),
        failedRenewals: renewalFailed
          ? subscription.failedRenewals + 1
          : nextStatus === SubscriptionStatus.ACTIVE
            ? 0
            : subscription.failedRenewals
      }
    });

    if (
      nextStatus === SubscriptionStatus.CANCELLED ||
      nextStatus === SubscriptionStatus.EXPIRED
    ) {
      await this.expireEntitlements(
        subscription.id,
        `Subscription ${nextStatus.toLowerCase()}.`
      );
    }

    if (renewalFailed) {
      const payment = await this.prisma.payment.findFirst({
        where: { subscriptionId: subscription.id },
        orderBy: { createdAt: "desc" },
        select: { id: true }
      });
      if (payment) {
        this.messaging.dispatchInBackground({
          event: "SUBSCRIPTION_RENEWAL_FAILED",
          paymentId: payment.id,
          dedupeSuffix: String(subscription.failedRenewals + 1)
        });
      }
    }

    return WebhookEventStatus.PROCESSED;
  }

  async listForUser(userId: string): Promise<SubscriptionItem[]> {
    const rows = await this.prisma.subscription.findMany({
      where: { userId },
      include: SUBSCRIPTION_INCLUDE,
      orderBy: { createdAt: "desc" }
    });
    return rows.map((row) => this.toItem(row));
  }

  async listAll(limit = 200): Promise<SubscriptionItem[]> {
    const rows = await this.prisma.subscription.findMany({
      include: SUBSCRIPTION_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: limit
    });
    return rows.map((row) => this.toItem(row));
  }

  async countActive(): Promise<number> {
    return this.prisma.subscription.count({
      where: {
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] }
      }
    });
  }

  /**
   * Ends subscriptions whose paid period has run out with no renewal. The
   * provider is the one that renews, so a lapsed `currentPeriodEnd` with no
   * renewal webhook means it stopped.
   */
  async expireLapsed(): Promise<number> {
    const lapsed = await this.prisma.subscription.findMany({
      where: {
        status: {
          in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE]
        },
        currentPeriodEnd: { not: null, lt: new Date() },
        cancelAtPeriodEnd: true
      },
      select: { id: true }
    });

    for (const subscription of lapsed) {
      await this.prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: SubscriptionStatus.EXPIRED }
      });
      await this.expireEntitlements(subscription.id, "Subscription period ended.");
    }

    return lapsed.length;
  }

  /** Next cycle boundary, used when a provider reports a renewal without one. */
  projectNextBilling(from: Date, months: number): Date {
    return addMonths(from, months);
  }

  private async expireEntitlements(
    subscriptionId: string,
    reason: string
  ): Promise<void> {
    await this.prisma.entitlement.updateMany({
      where: { subscriptionId, status: EntitlementStatus.ACTIVE },
      data: {
        status: EntitlementStatus.EXPIRED,
        revokedReason: reason.slice(0, 500)
      }
    });
  }

  private toItem(row: SubscriptionRow): SubscriptionItem {
    return {
      id: row.id,
      userId: row.userId,
      userName: fullName(row.user),
      planId: row.planId,
      planName: row.plan.name,
      provider: row.provider,
      providerSubscriptionId: row.providerSubscriptionId,
      status: row.status,
      interval: row.interval,
      amount: row.amount,
      currency: row.currency,
      startDate: row.startDate?.toISOString() ?? null,
      currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
      nextBillingDate: row.nextBillingDate?.toISOString() ?? null,
      cancelledAt: row.cancelledAt?.toISOString() ?? null,
      cancelAtPeriodEnd: row.cancelAtPeriodEnd,
      failedRenewals: row.failedRenewals,
      createdAt: row.createdAt.toISOString()
    };
  }
}

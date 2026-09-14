import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException
} from "@nestjs/common";
import { getApiEnv, getFrontendUrl } from "@nexa-chess/config/api";
import {
  BILLING_INTERVAL_LABELS,
  canTransitionPaymentStatus,
  isInFlightPaymentStatus,
  isRecurringInterval,
  isSettledPaymentStatus,
  orderStatusForPayment,
  PAYMENT_STATUS_MESSAGES,
  type AppliedDiscount,
  type BillingInterval,
  type ApplyDiscountRequest,
  type ApplyDiscountResponse,
  type CheckoutConfigResponse,
  type CheckoutMethodOption,
  type CheckoutResponse,
  type CreateCheckoutRequest,
  type MyBillingResponse,
  type PaymentListItem,
  type PaymentMethodKind,
  type PaymentStatusResponse,
  type VerifyPaymentRequest
} from "@nexa-chess/types";
import {
  OrderStatus,
  PaymentStatus,
  Prisma,
  UserRole,
  type Payment,
  type Plan,
  type User
} from "@prisma/client";
import { MessagingDispatchService } from "../messaging/messaging-dispatch.service";
import { PrismaService } from "../prisma/prisma.service";
import { BillingProfileService } from "./billing-profile.service";
import { CreditNoteService } from "./credit-note.service";
import { DiscountService, toAppliedDiscount } from "./discount.service";
import { EntitlementService } from "./entitlement.service";
import { InvoiceAuditService } from "./invoice-audit.service";
import { InvoiceGenerationService } from "./invoice-generation.service";
import { InvoiceService } from "./invoice.service";
import { PaymentRouterService } from "./payment-router.service";
import { assertOwnerOrAdmin, fullName, isAdminRole } from "./payments-auth.helper";
import {
  generateOrderNumber,
  isUniqueViolation,
  normalizePhone,
  priceOrder,
  toJson,
  toPlanItem
} from "./payments.util";
import type { PaymentDetails } from "./providers/payment-provider.interface";
import { PaymentProviderError } from "./providers/payment-provider.interface";
import { ProviderRegistry } from "./providers/provider-registry.service";
import { SubscriptionService } from "./subscription.service";

export type PaymentWithRelations = Prisma.PaymentGetPayload<{
  include: {
    order: { include: { plan: true } };
    user: { select: { firstName: true; lastName: true; email: true } };
    invoice: { select: { id: true; number: true } };
    attempts: { select: { id: true } };
  };
}>;

const PAYMENT_INCLUDE = {
  order: { include: { plan: true } },
  user: { select: { firstName: true, lastName: true, email: true } },
  invoice: { select: { id: true, number: true } },
  attempts: { select: { id: true } }
} satisfies Prisma.PaymentInclude;

/**
 * The ONLY thing business logic talks to for payments.
 *
 * Two rules hold this whole module together:
 *
 *  1. A payment's state only ever changes through {@link applyProviderState},
 *     which is transactional and transition-guarded. Webhooks, the "check
 *     status" button, the client callback and the reconciliation sweep are four
 *     doors into that one room.
 *  2. Access is granted by EntitlementService inside that same transaction, and
 *     never on a client's say-so. "Frontend says success" grants nothing.
 */
@Injectable()
export class PaymentService {
  private readonly env = getApiEnv();
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly billingProfiles: BillingProfileService,
    private readonly creditNotes: CreditNoteService,
    private readonly discounts: DiscountService,
    private readonly entitlements: EntitlementService,
    private readonly invoiceAudit: InvoiceAuditService,
    private readonly invoiceGeneration: InvoiceGenerationService,
    private readonly invoices: InvoiceService,
    private readonly messaging: MessagingDispatchService,
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistry,
    private readonly router: PaymentRouterService,
    private readonly subscriptions: SubscriptionService
  ) {}

  // ────────────────────────────────────────────────
  // Checkout
  // ────────────────────────────────────────────────

  /** Everything the checkout screen needs before the user picks a method. */
  async getCheckoutConfig(
    user: User,
    planId: string
  ): Promise<CheckoutConfigResponse> {
    this.assertPaymentsEnabled();

    const plan = await this.prisma.plan.findUnique({
      where: { id: planId },
      include: { batch: { select: { name: true } } }
    });
    if (!plan || !plan.isActive) {
      throw new NotFoundException("This plan is not available.");
    }

    const currency = plan.currency;
    const pricing = priceOrder(plan.amount, plan.taxPercent);
    const recurring = isRecurringInterval(plan.interval);
    const methods = await this.availableMethodsForPlan(plan, currency);

    // A payment already in flight means "check status", not "pay again" (§20).
    const pending = await this.prisma.payment.findFirst({
      where: {
        userId: user.id,
        order: { planId: plan.id },
        status: {
          in: [
            PaymentStatus.CREATED,
            PaymentStatus.PENDING,
            PaymentStatus.PROCESSING,
            PaymentStatus.AUTHORIZED
          ]
        },
        createdAt: { gte: this.orderCutoff() }
      },
      orderBy: { createdAt: "desc" },
      select: { id: true }
    });

    // Sibling price options on the same batch, so the screen can offer
    // "monthly or one-time" without a second round trip.
    const alternatives = plan.batchId
      ? await this.prisma.plan.findMany({
          where: {
            batchId: plan.batchId,
            isActive: true,
            id: { not: plan.id }
          },
          include: { batch: { select: { name: true } } },
          orderBy: [{ sortOrder: "asc" }, { amount: "asc" }]
        })
      : [];

    const alreadySubscribed = recurring
      ? (await this.prisma.subscription.count({
          where: {
            userId: user.id,
            planId: plan.id,
            status: { in: ["ACTIVE", "PAST_DUE", "PENDING_ACTIVATION"] }
          }
        })) > 0
      : false;

    return {
      plan: toPlanItem(plan),
      currency,
      subtotal: pricing.subtotal,
      taxAmount: pricing.taxAmount,
      taxPercent: plan.taxPercent,
      taxLabel: pricing.taxAmount > 0 ? this.env.PAYMENTS_TAX_LABEL : null,
      total: pricing.total,
      methods,
      // A code is applied through `previewDiscount`; the initial config never
      // assumes one.
      discount: null,
      alternatives: alternatives.map(toPlanItem),
      recurring,
      pendingPaymentId: pending?.id ?? null,
      alreadyOwned: await this.entitlements.hasActiveAccess(user.id, plan.id),
      alreadySubscribed
    };
  }

  /**
   * Prices a discount code against a plan and method, without committing to
   * anything. The same `DiscountService.resolve` runs again at checkout, so a
   * code that expires between preview and pay is caught there too — this is a
   * preview, never a promise.
   */
  async previewDiscount(
    user: User,
    dto: ApplyDiscountRequest
  ): Promise<ApplyDiscountResponse> {
    const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
    if (!plan || !plan.isActive) {
      throw new NotFoundException("This plan is not available.");
    }

    const resolution = await this.discounts.resolve({
      code: dto.code,
      userId: user.id,
      plan: {
        id: plan.id,
        batchId: plan.batchId,
        amount: plan.amount,
        currency: plan.currency
      },
      method: dto.method
    });

    if (!resolution.valid) {
      return { valid: false, reason: resolution.reason, message: resolution.message };
    }

    // Tax is charged on the DISCOUNTED subtotal — taxing a price nobody paid
    // would overcharge.
    const pricing = priceOrder(
      plan.amount - resolution.amount,
      plan.taxPercent
    );

    return {
      valid: true,
      discount: toAppliedDiscount(resolution.discount, resolution.amount),
      subtotal: plan.amount,
      discountAmount: resolution.amount,
      taxAmount: pricing.taxAmount,
      total: pricing.total,
      currency: plan.currency
    };
  }

  /**
   * The methods this plan can actually be paid with: what the routed gateways
   * support, narrowed by the plan's own `allowedMethods`. A plan can restrict
   * but never widen what the platform offers.
   */
  private async availableMethodsForPlan(
    plan: { allowedMethods: PaymentMethodKind[]; interval: string },
    currency: string
  ): Promise<CheckoutMethodOption[]> {
    const available = await this.router.availableMethods(currency, {
      recurring: isRecurringInterval(
        plan.interval as Parameters<typeof isRecurringInterval>[0]
      )
    });

    if (plan.allowedMethods.length === 0) return available;

    return available.filter((method) =>
      plan.allowedMethods.includes(method.kind)
    );
  }

  /**
   * Opens a checkout.
   *
   * Double-payment protection (§11) is the unique index on
   * `orders.idempotencyKey`, not a check-then-insert: a double click, a
   * refresh, a back-navigation and a second tab all carry the same key, so the
   * second insert collides and we replay the first order instead of billing
   * twice. Every amount is computed here from the plan — a client-supplied
   * amount is never read.
   */
  async createCheckout(
    user: User,
    dto: CreateCheckoutRequest
  ): Promise<CheckoutResponse> {
    this.assertPaymentsEnabled();

    if (user.role !== UserRole.STUDENT && !isAdminRole(user.role)) {
      throw new BadRequestException(
        "Only student accounts can purchase a plan."
      );
    }

    const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
    if (!plan || !plan.isActive) {
      throw new NotFoundException("This plan is not available.");
    }

    const existing = await this.prisma.order.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: {
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
        attempts: { orderBy: { attemptNumber: "desc" }, take: 1 }
      }
    });

    if (existing) {
      if (existing.userId !== user.id) {
        // Someone guessed or replayed another account's key — never reuse it.
        throw new ConflictException("This checkout key is already in use.");
      }
      return this.replayOrder(existing.id, dto);
    }

    const currency = (dto.currency ?? plan.currency).toUpperCase();

    // Re-resolved here, never taken from the client: a code that expired, hit
    // its limit, or does not apply to the chosen method is simply not applied,
    // and the buyer pays the honest price rather than being refused.
    const resolution = dto.discountCode
      ? await this.discounts.resolve({
          code: dto.discountCode,
          userId: user.id,
          plan: {
            id: plan.id,
            batchId: plan.batchId,
            amount: plan.amount,
            currency: plan.currency
          },
          method: dto.method
        })
      : null;

    const discountAmount = resolution?.valid ? resolution.amount : 0;
    const applied: AppliedDiscount | null = resolution?.valid
      ? toAppliedDiscount(resolution.discount, resolution.amount)
      : null;

    // Tax is charged on the discounted subtotal.
    const pricing = priceOrder(plan.amount - discountAmount, plan.taxPercent);

    const order = await this.prisma.order
      .create({
        data: {
          orderNumber: generateOrderNumber(this.env.PAYMENTS_INVOICE_PREFIX),
          userId: user.id,
          planId: plan.id,
          status: OrderStatus.CREATED,
          // subtotalAmount is the list price; discountAmount is what came off.
          subtotalAmount: plan.amount,
          discountAmount,
          taxAmount: pricing.taxAmount,
          amount: pricing.total,
          currency,
          idempotencyKey: dto.idempotencyKey,
          discountId: applied?.id ?? null,
          discountCode: applied?.code ?? null,
          expiresAt: new Date(
            Date.now() + this.env.PAYMENTS_ORDER_TTL_MINUTES * 60 * 1000
          ),
          notes: { planCode: plan.code, method: dto.method ?? null }
        }
      })
      .catch((error: unknown) => {
        // Lost the race against a concurrent identical submit; the winner's
        // order is the one we want, so fall through to the replay path.
        if (isUniqueViolation(error)) return null;
        throw error;
      });

    if (!order) {
      return this.replayOrder(
        (await this.requireOrderByKey(dto.idempotencyKey)).id,
        dto
      );
    }

    // A recurring plan opens a mandate at the gateway rather than taking one
    // charge. The provider bills every cycle after that; we mirror its state.
    if (isRecurringInterval(plan.interval)) {
      return this.openSubscription(user, order.id, plan.id, dto, applied);
    }

    return this.openAttempt(user, order.id, dto.method, dto.returnPath, applied);
  }

  /**
   * Opens a recurring mandate for a monthly/quarterly/yearly plan.
   *
   * The order still exists — it is what the first charge and its invoice hang
   * off — but the gateway, not us, decides when money moves after that.
   */
  private async openSubscription(
    user: User,
    orderId: string,
    planId: string,
    dto: CreateCheckoutRequest,
    discount: AppliedDiscount | null
  ): Promise<CheckoutResponse> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException("Order not found.");

    // Only gateways that can actually mandate this method are candidates.
    const decision = await this.router.route({
      currency: order.currency,
      method: dto.method,
      recurring: true
    });

    const { subscription, handoff } = await this.subscriptions.start(
      user,
      planId,
      decision.provider,
      { orderId: order.id }
    );

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      // A subscription has no payment row until the first charge lands; the
      // webhook creates it.
      paymentId: "",
      attemptId: "",
      status: PaymentStatus.PENDING,
      amount: order.amount,
      currency: order.currency,
      handoff,
      reused: false,
      expiresAt: order.expiresAt?.toISOString() ?? null,
      subscriptionId: subscription.id,
      discount
    };
  }

  /**
   * Starts a fresh attempt on an existing order (§12: same business order, new
   * attempt). Used by the retry button and by a replayed idempotency key whose
   * previous attempt is dead.
   */
  async retry(
    user: User,
    paymentId: string,
    method?: PaymentMethodKind
  ): Promise<CheckoutResponse> {
    this.assertPaymentsEnabled();

    const payment = await this.requirePayment(paymentId);
    assertOwnerOrAdmin(user, payment.userId);

    // Never open a second attempt while the first might still be alive. The
    // status check reconciles against the provider first, so "in flight" is a
    // fact, not an assumption (§17).
    const status = await this.getStatus(user, paymentId);
    if (status.status === "PAID" || isSettledPaymentStatus(status.status)) {
      throw new ConflictException(
        "This order has already been paid. Refresh to see your access."
      );
    }
    if (status.pending) {
      throw new ConflictException(
        "A payment for this order is still being confirmed. Please wait rather than paying again."
      );
    }

    return this.openAttempt(user, payment.orderId, method);
  }

  // ────────────────────────────────────────────────
  // Verification & status
  // ────────────────────────────────────────────────

  /**
   * The client's "payment succeeded" callback. Advisory: the signature is
   * checked where the provider signs one, but the state written always comes
   * from a server-side fetch. A client that lies gets the truth back.
   */
  async verify(
    user: User,
    paymentId: string,
    dto: VerifyPaymentRequest
  ): Promise<PaymentStatusResponse> {
    const payment = await this.requirePayment(paymentId);
    assertOwnerOrAdmin(user, payment.userId);

    const adapter = this.registry.get(payment.provider);

    try {
      const result = await adapter.verifyPayment({
        paymentId: payment.id,
        providerPaymentId:
          dto.providerPaymentId ?? payment.providerPaymentId ?? undefined,
        providerOrderId:
          dto.providerOrderId ?? payment.providerOrderId ?? undefined,
        signature: dto.signature
      });

      if (!result.verified && result.reason) {
        this.logger.debug(
          `Payment ${payment.id} client handshake not trusted: ${result.reason}`
        );
      }

      if (result.details) {
        await this.applyProviderState(payment.id, result.details, "verify");
      }
    } catch (error) {
      this.logProviderError("verify", payment.id, error);
    }

    return this.buildStatus(await this.requirePayment(paymentId));
  }

  /**
   * The safe "Check payment status" button (§6, §20). Reconciles against the
   * provider and returns the truth. It can move a payment to PAID — that is
   * fine, because the state comes from the gateway, not the button.
   */
  async getStatus(user: User, paymentId: string): Promise<PaymentStatusResponse> {
    const payment = await this.requirePayment(paymentId);
    assertOwnerOrAdmin(user, payment.userId);

    if (isInFlightPaymentStatus(payment.status)) {
      await this.reconcile(payment.id);
    }

    return this.buildStatus(await this.requirePayment(paymentId));
  }

  /**
   * Pulls a payment's authoritative state from its gateway and applies it.
   * Safe to call repeatedly — the transition guard makes it a no-op when
   * nothing has changed.
   */
  async reconcile(paymentId: string): Promise<void> {
    const payment = await this.requirePayment(paymentId);
    const adapter = this.registry.get(payment.provider);

    if (!adapter.isConfigured()) return;

    const handle = payment.providerPaymentId ?? payment.providerOrderId;
    if (!handle) {
      // Nothing to ask about: the gateway was never reached. Expire it rather
      // than leaving the user staring at a spinner forever.
      await this.expireIfStale(payment);
      return;
    }

    try {
      const details = await adapter.getPayment(handle, payment.providerOrderId);
      await this.applyProviderState(payment.id, details, "reconcile");
    } catch (error) {
      this.logProviderError("reconcile", payment.id, error);
      await this.expireIfStale(payment);
    }
  }

  // ────────────────────────────────────────────────
  // The single state funnel
  // ────────────────────────────────────────────────

  /**
   * Applies one authoritative provider state to a payment. Every path into a
   * status change goes through here — webhook, verify, status check,
   * reconciliation sweep.
   *
   * Out-of-order events are handled by rank (`canTransitionPaymentStatus`), so
   * a stale "pending" redelivered after a capture cannot un-pay anything. The
   * capture side effects — entitlement, enrolment, invoice — run inside the
   * same transaction, and are individually idempotent on unique keys, so two
   * simultaneous callers cannot both grant.
   */
  async applyProviderState(
    paymentId: string,
    details: PaymentDetails,
    source: string
  ): Promise<{ changed: boolean; status: PaymentStatus }> {
    const outcome = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        // The plan's batch comes along so the invoice line can say WHICH batch
        // was bought — "Monthly fee" alone is not a receipt a parent can read.
        include: {
          order: {
            include: { plan: { include: { batch: { select: { name: true } } } } }
          }
        }
      });
      if (!payment) {
        throw new NotFoundException("Payment not found.");
      }

      // Provider handles and method detail are always worth recording, even
      // when the status itself has not moved — they are how support traces a
      // disputed charge.
      const handleUpdates: Prisma.PaymentUpdateInput = {
        ...(details.providerPaymentId && !payment.providerPaymentId
          ? { providerPaymentId: details.providerPaymentId }
          : {}),
        ...(details.providerOrderId && !payment.providerOrderId
          ? { providerOrderId: details.providerOrderId }
          : {}),
        ...(details.method ? { paymentMethod: details.method } : {}),
        ...(details.methodDetail ? { methodDetail: details.methodDetail } : {})
      };

      const nextStatus = details.status;
      if (!canTransitionPaymentStatus(payment.status, nextStatus)) {
        if (Object.keys(handleUpdates).length > 0) {
          await tx.payment.update({ where: { id: payment.id }, data: handleUpdates });
        }
        return {
          changed: false,
          status: payment.status,
          captured: false,
          invoiceId: null
        };
      }

      // An amount mismatch means the customer paid something other than what
      // we asked for. Record it, never grant on it.
      if (
        nextStatus === PaymentStatus.PAID &&
        details.amount !== null &&
        details.amount !== payment.amount
      ) {
        this.logger.error(
          `Payment ${payment.id} captured ${details.amount} but the order is ${payment.amount} ${payment.currency}. Access withheld for manual review.`
        );
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            ...handleUpdates,
            status: PaymentStatus.PROCESSING,
            failureCode: "amount_mismatch",
            failureMessage: `Provider reported ${details.amount} against an order of ${payment.amount}.`,
            metadata: toJson(details.raw)
          }
        });
        return {
          changed: true,
          status: PaymentStatus.PROCESSING,
          captured: false,
          invoiceId: null
        };
      }

      const paidAt =
        nextStatus === PaymentStatus.PAID
          ? (details.paidAt ?? new Date())
          : payment.paidAt;

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          ...handleUpdates,
          status: nextStatus,
          amountRefunded: Math.max(payment.amountRefunded, details.amountRefunded),
          failureCode: details.failureCode ?? payment.failureCode,
          failureMessage: details.failureMessage ?? payment.failureMessage,
          paidAt,
          metadata: toJson(details.raw)
        }
      });

      await tx.paymentAttempt.updateMany({
        where: { paymentId: payment.id },
        data: {
          status: nextStatus,
          failureCode: details.failureCode ?? undefined,
          failureMessage: details.failureMessage ?? undefined
        }
      });

      await tx.order.update({
        where: { id: payment.orderId },
        data: {
          status: orderStatusForPayment(nextStatus),
          ...(nextStatus === PaymentStatus.PAID && paidAt ? { paidAt } : {})
        }
      });

      let captured = false;
      let invoiceId: string | null = null;

      if (nextStatus === PaymentStatus.PAID && payment.order.planId) {
        // Payment = PAID and Order = PAID → entitlement → access (§21).
        await this.entitlements.grant(tx, {
          userId: payment.order.userId,
          planId: payment.order.planId,
          orderId: payment.orderId,
          paymentId: payment.id,
          subscriptionId: payment.subscriptionId,
          grantedAt: paidAt ?? new Date()
        });

        // The invoice is issued in the SAME transaction as the entitlement, so
        // a paid order always has a receipt and a receipt never exists for an
        // unpaid one. Its figures come from the order row, never the client.
        const issued = await this.invoices.issue(tx, {
          orderId: payment.orderId,
          paymentId: payment.id,
          userId: payment.order.userId,
          items: [
            {
              productId: payment.order.planId,
              description: describePurchase(payment.order.plan),
              quantity: 1,
              unitAmount: payment.order.subtotalAmount
            }
          ],
          discountAmount: payment.order.discountAmount,
          discountCode: payment.order.discountCode,
          taxPercent: payment.order.plan?.taxPercent ?? 0,
          currency: payment.currency,
          paidAt: paidAt ?? new Date(),
          provider: payment.provider,
          paymentMethod: details.method ?? payment.paymentMethod,
          methodDetail: details.methodDetail ?? payment.methodDetail,
          transactionId:
            details.providerPaymentId ?? payment.providerPaymentId
        });
        invoiceId = issued.id;

        await this.invoiceAudit.recordTx(tx, {
          event: "PAYMENT_CONFIRMED",
          invoiceId: issued.id,
          metadata: {
            paymentId: payment.id,
            orderId: payment.orderId,
            amount: payment.amount,
            currency: payment.currency,
            source
          }
        });

        // A code is only consumed once money actually arrives, so an abandoned
        // checkout never burns a limited discount.
        if (payment.order.discountId && payment.order.discountAmount > 0) {
          await this.discounts.redeem(tx, {
            discountId: payment.order.discountId,
            userId: payment.order.userId,
            orderId: payment.orderId,
            amount: payment.order.discountAmount
          });
        }

        captured = true;
      }

      return { changed: true, status: nextStatus, captured, invoiceId };
    });

    if (outcome.changed) {
      this.logger.log(
        `Payment ${paymentId} → ${outcome.status} (${source}).`
      );

      // Messaging is fire-and-forget and outside the transaction: a receipt
      // must never be able to roll back a capture.
      if (outcome.captured) {
        this.messaging.dispatchInBackground({
          event: "PAYMENT_RECEIVED",
          paymentId
        });

        // Same reasoning as the message above: the artifact is generated after
        // the money is settled, and a failure here parks the invoice at
        // pdfStatus FAILED for the retry sweep without touching the payment.
        if (outcome.invoiceId) {
          this.invoiceGeneration.requestGeneration(outcome.invoiceId);
        }
      } else if (outcome.status === PaymentStatus.FAILED) {
        this.messaging.dispatchInBackground({
          event: "PAYMENT_FAILED",
          paymentId
        });
      }
    }

    return { changed: outcome.changed, status: outcome.status };
  }

  // ────────────────────────────────────────────────
  // Reads
  // ────────────────────────────────────────────────

  async getBilling(user: User): Promise<MyBillingResponse> {
    const [
      payments,
      invoices,
      creditNotes,
      billingProfile,
      subscriptions,
      entitlements
    ] = await Promise.all([
      this.prisma.payment.findMany({
        where: { userId: user.id },
        include: PAYMENT_INCLUDE,
        orderBy: { createdAt: "desc" },
        take: 100
      }),
      this.invoices.listForUser(user.id),
      this.creditNotes.listForUser(user.id),
      this.billingProfiles.get(user.id),
      this.prisma.subscription.findMany({
        where: { userId: user.id },
        include: {
          plan: { select: { name: true } },
          user: { select: { firstName: true, lastName: true } }
        },
        orderBy: { createdAt: "desc" }
      }),
      this.entitlements.listForUser(user.id)
    ]);

    return {
      payments: payments.map((payment) => this.toListItem(payment)),
      invoices,
      creditNotes,
      billingProfile,
      subscriptions: subscriptions.map((subscription) => ({
        id: subscription.id,
        userId: subscription.userId,
        userName: fullName(subscription.user),
        planId: subscription.planId,
        planName: subscription.plan.name,
        provider: subscription.provider,
        providerSubscriptionId: subscription.providerSubscriptionId,
        status: subscription.status,
        interval: subscription.interval,
        amount: subscription.amount,
        currency: subscription.currency,
        startDate: subscription.startDate?.toISOString() ?? null,
        currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
        nextBillingDate: subscription.nextBillingDate?.toISOString() ?? null,
        cancelledAt: subscription.cancelledAt?.toISOString() ?? null,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        failedRenewals: subscription.failedRenewals,
        createdAt: subscription.createdAt.toISOString()
      })),
      entitlements
    };
  }

  toListItem(payment: PaymentWithRelations): PaymentListItem {
    return {
      id: payment.id,
      createdAt: payment.createdAt.toISOString(),
      paidAt: payment.paidAt?.toISOString() ?? null,
      orderId: payment.orderId,
      orderNumber: payment.order.orderNumber,
      userId: payment.userId,
      userName: fullName(payment.user),
      userEmail: payment.user?.email ?? null,
      planName: payment.order.plan?.name ?? null,
      amount: payment.amount,
      currency: payment.currency,
      amountRefunded: payment.amountRefunded,
      method: payment.paymentMethod,
      methodDetail: payment.methodDetail,
      provider: payment.provider,
      providerPaymentId: payment.providerPaymentId,
      status: payment.status,
      failureCode: payment.failureCode,
      failureMessage: payment.failureMessage,
      invoiceId: payment.invoice?.id ?? null,
      invoiceNumber: payment.invoice?.number ?? null,
      attempts: payment.attempts.length
    };
  }

  async requirePayment(paymentId: string): Promise<PaymentWithRelations> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: PAYMENT_INCLUDE
    });
    if (!payment) throw new NotFoundException("Payment not found.");
    return payment;
  }

  async buildStatus(payment: PaymentWithRelations): Promise<PaymentStatusResponse> {
    const entitlement = payment.order.planId
      ? await this.prisma.entitlement.findUnique({
          where: {
            orderId_planId: {
              orderId: payment.orderId,
              planId: payment.order.planId
            }
          },
          select: { id: true }
        })
      : null;

    return {
      paymentId: payment.id,
      orderId: payment.orderId,
      orderNumber: payment.order.orderNumber,
      status: payment.status,
      orderStatus: payment.order.status,
      provider: payment.provider,
      method: payment.paymentMethod,
      amount: payment.amount,
      currency: payment.currency,
      amountRefunded: payment.amountRefunded,
      failureCode: payment.failureCode,
      failureMessage: payment.failureMessage,
      paidAt: payment.paidAt?.toISOString() ?? null,
      accessGranted: Boolean(entitlement),
      invoiceId: payment.invoice?.id ?? null,
      pending: isInFlightPaymentStatus(payment.status),
      retryable:
        payment.status === PaymentStatus.FAILED ||
        payment.status === PaymentStatus.CANCELLED ||
        payment.status === PaymentStatus.EXPIRED,
      message:
        payment.failureMessage && payment.status === PaymentStatus.FAILED
          ? `${PAYMENT_STATUS_MESSAGES.FAILED} ${payment.failureMessage}`
          : PAYMENT_STATUS_MESSAGES[payment.status]
    };
  }

  // ────────────────────────────────────────────────
  // Internals
  // ────────────────────────────────────────────────

  /**
   * Creates the attempt + payment rows, then calls the gateway. The rows are
   * written FIRST: if the provider call times out we still hold a reconcilable
   * record rather than a charge nobody knows about.
   */
  private async openAttempt(
    user: User,
    orderId: string,
    method?: PaymentMethodKind,
    returnPath?: string,
    discount: AppliedDiscount | null = null
  ): Promise<CheckoutResponse> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { plan: true, attempts: true }
    });
    if (!order) throw new NotFoundException("Order not found.");

    if (order.status === OrderStatus.PAID) {
      throw new ConflictException("This order has already been paid.");
    }

    // Providers already tried are excluded only after the attempt they belong
    // to reached a settled failure — never while one is still in the air.
    const exhausted = order.attempts
      .filter((attempt) => attempt.status === PaymentStatus.FAILED)
      .map((attempt) => attempt.provider);

    const decision = await this.router.route({
      currency: order.currency,
      method,
      exclude: exhausted.length < 2 ? exhausted : []
    });

    const adapter = this.registry.require(decision.provider);

    const attemptNumber =
      order.attempts.reduce((max, a) => Math.max(max, a.attemptNumber), 0) + 1;

    const { payment, attempt } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          orderId: order.id,
          userId: order.userId,
          provider: decision.provider,
          amount: order.amount,
          currency: order.currency,
          paymentMethod: method ?? null,
          status: PaymentStatus.CREATED
        }
      });

      const createdAttempt = await tx.paymentAttempt.create({
        data: {
          orderId: order.id,
          paymentId: created.id,
          attemptNumber,
          provider: decision.provider,
          method: method ?? null,
          routingRuleId: decision.ruleId,
          status: PaymentStatus.CREATED
        }
      });

      await tx.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.PENDING }
      });

      return { payment: created, attempt: createdAttempt };
    });

    const notes = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      planId: order.planId ?? "",
      nexaPaymentId: payment.id
    };

    try {
      const result = await adapter.createPayment({
        paymentId: payment.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        amount: order.amount,
        currency: order.currency,
        method,
        description: order.plan?.name ?? "NexaChess purchase",
        customer: {
          id: user.id,
          name: fullName(user) ?? user.email,
          email: user.email,
          phone: normalizePhone(
            user.phoneNumber,
            this.env.WHATSAPP_DEFAULT_COUNTRY_CODE
          )
        },
        returnUrl: this.buildReturnUrl(payment.id, returnPath),
        notes
      });

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerPaymentId: result.providerPaymentId,
          providerOrderId: result.providerOrderId,
          status: result.status
        }
      });

      await this.prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: { status: result.status }
      });

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentId: payment.id,
        attemptId: attempt.id,
        status: result.status,
        amount: order.amount,
        currency: order.currency,
        handoff: result.handoff,
        reused: false,
        expiresAt: order.expiresAt?.toISOString() ?? null,
        subscriptionId: null,
        discount
      };
    } catch (error) {
      const message =
        error instanceof PaymentProviderError
          ? error.message
          : (error as Error).message;

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          failureCode:
            error instanceof PaymentProviderError
              ? (error.code ?? "provider_error")
              : "provider_error",
          failureMessage: message.slice(0, 500)
        }
      });
      await this.prisma.paymentAttempt.update({
        where: { id: attempt.id },
        data: { status: PaymentStatus.FAILED, failureMessage: message.slice(0, 500) }
      });

      throw new ServiceUnavailableException(
        `We could not reach the payment gateway. Nothing has been charged — please try again. (${message})`
      );
    }
  }

  /**
   * Replays an order for a repeated idempotency key. If its last attempt is
   * still usable the caller simply gets it back; if that attempt died, a new
   * attempt opens on the same order, so the user never ends up with two orders
   * for one intent.
   */
  private async replayOrder(
    orderId: string,
    dto: CreateCheckoutRequest
  ): Promise<CheckoutResponse> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        user: true,
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
        attempts: { orderBy: { attemptNumber: "desc" }, take: 1 }
      }
    });
    if (!order) throw new NotFoundException("Order not found.");

    const latest = order.payments[0];

    if (order.status === OrderStatus.PAID || (latest && latest.status === PaymentStatus.PAID)) {
      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentId: latest?.id ?? "",
        attemptId: order.attempts[0]?.id ?? "",
        status: PaymentStatus.PAID,
        amount: order.amount,
        currency: order.currency,
        handoff: null,
        reused: true,
        expiresAt: order.expiresAt?.toISOString() ?? null,
        subscriptionId: null,
        discount: appliedFromOrder(order)
      };
    }

    if (latest && isInFlightPaymentStatus(latest.status)) {
      // Reconcile before handing the same attempt back — the gateway may
      // already know something this session does not.
      await this.reconcile(latest.id);
      const refreshed = await this.requirePayment(latest.id);

      if (refreshed.status === PaymentStatus.PAID) {
        return {
          orderId: order.id,
          orderNumber: order.orderNumber,
          paymentId: refreshed.id,
          attemptId: order.attempts[0]?.id ?? "",
          status: PaymentStatus.PAID,
          amount: order.amount,
          currency: order.currency,
          handoff: null,
          reused: true,
          expiresAt: order.expiresAt?.toISOString() ?? null,
          subscriptionId: null,
          discount: appliedFromOrder(order)
        };
      }

      if (isInFlightPaymentStatus(refreshed.status)) {
        // Re-open the same provider session rather than minting another one.
        const adapter = this.registry.get(refreshed.provider);
        const handoff = await adapter
          .createPayment({
            paymentId: refreshed.id,
            orderId: order.id,
            orderNumber: order.orderNumber,
            amount: order.amount,
            currency: order.currency,
            method: dto.method,
            description: "NexaChess purchase",
            customer: {
              id: order.userId,
              name: fullName(order.user) ?? order.user.email,
              email: order.user.email,
              phone: normalizePhone(
                order.user.phoneNumber,
                this.env.WHATSAPP_DEFAULT_COUNTRY_CODE
              )
            },
            returnUrl: this.buildReturnUrl(refreshed.id, dto.returnPath),
            notes: { orderId: order.id, nexaPaymentId: refreshed.id }
          })
          .then((result) => result.handoff)
          .catch(() => null);

        return {
          orderId: order.id,
          orderNumber: order.orderNumber,
          paymentId: refreshed.id,
          attemptId: order.attempts[0]?.id ?? "",
          status: refreshed.status,
          amount: order.amount,
          currency: order.currency,
          handoff,
          reused: true,
          expiresAt: order.expiresAt?.toISOString() ?? null,
          subscriptionId: null,
          discount: appliedFromOrder(order)
        };
      }
    }

    return this.openAttempt(
      order.user,
      order.id,
      dto.method,
      dto.returnPath,
      appliedFromOrder(order)
    );
  }

  /**
   * Closes a payment the gateway can no longer tell us anything about. Only
   * ever applied past the order TTL, and only to a payment that never reached
   * AUTHORIZED — expiring something that might hold an authorisation would risk
   * the customer being charged for a payment we call dead.
   */
  private async expireIfStale(payment: Payment): Promise<void> {
    const age = Date.now() - payment.createdAt.getTime();
    if (age < this.env.PAYMENTS_ORDER_TTL_MINUTES * 60 * 1000) return;

    if (
      payment.status !== PaymentStatus.CREATED &&
      payment.status !== PaymentStatus.PENDING
    ) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.EXPIRED,
          failureCode: "expired",
          failureMessage: "The payment window closed before the payment completed."
        }
      });
      await tx.paymentAttempt.updateMany({
        where: { paymentId: payment.id },
        data: { status: PaymentStatus.EXPIRED }
      });
      await tx.order.updateMany({
        where: { id: payment.orderId, status: { not: OrderStatus.PAID } },
        data: { status: OrderStatus.EXPIRED }
      });
    });
  }

  private buildReturnUrl(paymentId: string, returnPath?: string): string {
    const base = getFrontendUrl(this.env);
    const path = returnPath ?? "/student/billing";
    return `${base}${path}${path.includes("?") ? "&" : "?"}payment=${paymentId}`;
  }

  private orderCutoff(): Date {
    return new Date(
      Date.now() - this.env.PAYMENTS_ORDER_TTL_MINUTES * 60 * 1000 * 2
    );
  }

  private async requireOrderByKey(idempotencyKey: string) {
    const order = await this.prisma.order.findUnique({
      where: { idempotencyKey }
    });
    if (!order) throw new NotFoundException("Order not found.");
    return order;
  }

  private assertPaymentsEnabled(): void {
    if (!this.env.PAYMENTS_ENABLED) {
      throw new ServiceUnavailableException(
        "Payments are turned off on this environment."
      );
    }
    if (!this.registry.anyConfigured()) {
      throw new ServiceUnavailableException(
        "No payment gateway is configured on this environment."
      );
    }
  }

  private logProviderError(
    operation: string,
    paymentId: string,
    error: unknown
  ): void {
    const message =
      error instanceof PaymentProviderError
        ? `${error.provider} ${error.operation}: ${error.message}`
        : (error as Error).message;
    this.logger.warn(`Payment ${paymentId} ${operation} failed — ${message}`);
  }
}

/** Rebuilds the applied discount from what the order froze at checkout time. */
function appliedFromOrder(order: {
  discountId: string | null;
  discountCode: string | null;
  discountAmount: number;
}): AppliedDiscount | null {
  if (!order.discountId || !order.discountCode || order.discountAmount <= 0) {
    return null;
  }
  return {
    id: order.discountId,
    code: order.discountCode,
    name: order.discountCode,
    type: "FIXED",
    amount: order.discountAmount
  };
}

// Re-exported for the modules that already import them from here. The
// definitions live in payments.util so DiscountService can use them without
// importing this service back — that cycle left Nest unable to resolve the
// injected token at runtime.
export { isUniqueViolation, toJson, toPlanItem } from "./payments.util";

export type { Plan };

/**
 * What the invoice line calls the thing that was bought.
 *
 * A batch's price is a Plan carrying that batch's id, and its name is whatever
 * the admin typed ("Monthly fee"), so the plan name ALONE does not identify the
 * purchase. The batch it belongs to and the billing interval are what make the
 * line legible to the person paying — and this string is copied onto the
 * invoice, so it stays right even if the plan is renamed or deleted later.
 */
export function describePurchase(
  plan:
    | {
        name?: string | null;
        interval?: BillingInterval | null;
        batch?: { name?: string | null } | null;
      }
    | null
    | undefined
): string {
  // Defensive throughout: this runs INSIDE the capture transaction, so a throw
  // here would roll back a payment that already succeeded — the one thing the
  // whole invoice design exists to prevent. A missing field costs a nicer
  // label, never the money.
  const name = plan?.name?.trim();
  if (!plan || !name) return "NexaChess purchase";

  const parts = [name];
  const lower = name.toLowerCase();

  const batchName = plan.batch?.name?.trim();
  // Skip when the admin already worked the batch name into the plan name,
  // rather than printing "Monthly fee - Batch A - Batch A".
  if (batchName && !lower.includes(batchName.toLowerCase())) {
    parts.push(batchName);
  }

  const joined = parts.join(" — ");

  // An unrecognised or absent interval simply contributes nothing.
  const interval = plan.interval
    ? BILLING_INTERVAL_LABELS[plan.interval]
    : undefined;
  if (
    interval &&
    plan.interval !== "ONE_TIME" &&
    !lower.includes(interval.toLowerCase())
  ) {
    return `${joined} (${interval})`;
  }

  return joined;
}

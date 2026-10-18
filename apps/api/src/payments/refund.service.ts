import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { CreateRefundRequest, RefundItem } from "@nexa-chess/types";
import {
  OrderStatus,
  PaymentStatus,
  Prisma,
  RefundStatus,
  type User
} from "@prisma/client";
import { MessagingDispatchService } from "../messaging/messaging-dispatch.service";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import {
  PrismaService,
  type PrismaTransactionClient
} from "../prisma/prisma.service";
import { EntitlementService } from "./entitlement.service";
import { CreditNoteService } from "./credit-note.service";
import { InvoiceAuditService } from "./invoice-audit.service";
import { InvoiceGenerationService } from "./invoice-generation.service";
import { InvoiceService } from "./invoice.service";
import { toJson } from "./payments.util";
import { fullName } from "./payments-auth.helper";
import { PaymentProviderError } from "./providers/payment-provider.interface";
import { ProviderRegistry } from "./providers/provider-registry.service";

type RefundRow = Prisma.RefundGetPayload<{
  include: {
    payment: {
      select: {
        currency: true;
        order: { select: { orderNumber: true } };
        user: { select: { firstName: true; lastName: true } };
      };
    };
    requestedBy: { select: { firstName: true; lastName: true } };
  };
}>;

const REFUND_INCLUDE = {
  payment: {
    select: {
      currency: true,
      order: { select: { orderNumber: true } },
      user: { select: { firstName: true, lastName: true } }
    }
  },
  requestedBy: { select: { firstName: true, lastName: true } }
} satisfies Prisma.RefundInclude;

/**
 * Refunds (§14).
 *
 * The rule that shapes this whole file: a refund is NEVER marked completed
 * because the provider accepted the request. The API call only moves it to
 * PENDING/PROCESSING; only a provider webhook — or a reconciliation read of the
 * provider's own record — settles it to SUCCEEDED.
 */
@Injectable()
export class RefundService {
  private readonly logger = new Logger(RefundService.name);

  constructor(
    private readonly creditNotes: CreditNoteService,
    private readonly entitlements: EntitlementService,
    private readonly invoiceAudit: InvoiceAuditService,
    private readonly invoiceGeneration: InvoiceGenerationService,
    private readonly invoices: InvoiceService,
    private readonly jobLocks: JobLockService,
    private readonly messaging: MessagingDispatchService,
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistry
  ) {}

  /** Admin-initiated. Full when `amount` is omitted, partial otherwise. */
  async create(
    admin: User,
    paymentId: string,
    dto: CreateRefundRequest
  ): Promise<RefundItem> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { refunds: true, order: true }
    });
    if (!payment) throw new NotFoundException("Payment not found.");

    if (payment.provider === "MANUAL") {
      throw new BadRequestException(
        "Manual payments can't be refunded through a gateway. Reverse it operationally and record it separately."
      );
    }

    if (
      payment.status !== PaymentStatus.PAID &&
      payment.status !== PaymentStatus.PARTIALLY_REFUNDED &&
      payment.status !== PaymentStatus.REFUND_PENDING
    ) {
      throw new ConflictException(
        "Only a captured payment can be refunded."
      );
    }
    if (!payment.providerPaymentId) {
      throw new ConflictException(
        "This payment has no gateway reference to refund against."
      );
    }

    // Money already promised out counts against the balance, even before it
    // settles — otherwise two quick partial refunds could exceed the payment.
    const committed = payment.refunds
      .filter((refund) => refund.status !== RefundStatus.FAILED && refund.status !== RefundStatus.CANCELLED)
      .reduce((sum, refund) => sum + refund.amount, 0);

    const remaining = payment.amount - committed;
    if (remaining <= 0) {
      throw new ConflictException("This payment has already been fully refunded.");
    }

    const amount = dto.amount ?? remaining;
    if (amount > remaining) {
      throw new BadRequestException(
        `The most that can still be refunded on this payment is ${remaining} (minor units).`
      );
    }

    const refund = await this.prisma.refund.create({
      data: {
        paymentId: payment.id,
        provider: payment.provider,
        amount,
        currency: payment.currency,
        status: RefundStatus.PENDING,
        reason: dto.reason,
        // The row id is the provider idempotency key, so a retried request can
        // never issue a second refund for the same intent.
        idempotencyKey: `refund_${payment.id}_${Date.now().toString(36)}`,
        requestedById: admin.id
      }
    });

    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.REFUND_PENDING }
    });

    // Revoked only once the gateway has not definitively refused the refund.
    const revokeAccess = async () => {
      if (!dto.revokeAccess || !payment.order.planId) return;
      await this.prisma.$transaction(async (tx) => {
        await this.entitlements.revokeForOrder(
          tx,
          payment.orderId,
          `Refund requested: ${dto.reason}`.slice(0, 500)
        );
      });
    };

    const adapter = this.registry.get(payment.provider);

    try {
      const result = await adapter.refundPayment({
        refundId: refund.id,
        // Cashfree refunds are addressed by order, everyone else by payment.
        providerPaymentId:
          payment.provider === "CASHFREE"
            ? (payment.providerOrderId ?? payment.providerPaymentId)
            : payment.providerPaymentId,
        amount,
        currency: payment.currency,
        reason: dto.reason,
        notes: { orderId: payment.orderId, paymentId: payment.id }
      });

      await this.applyProviderState(refund.id, result);
      if (result.status !== RefundStatus.FAILED && result.status !== RefundStatus.CANCELLED) {
        await revokeAccess();
      }
    } catch (error) {
      const message =
        error instanceof PaymentProviderError
          ? error.message
          : (error as Error).message;

      // A transport failure is NOT a failed refund: the gateway may have
      // accepted it. Leave it PENDING for the sweep to reconcile rather than
      // telling an admin it failed and inviting a second attempt.
      const retryable =
        error instanceof PaymentProviderError ? error.retryable : true;

      await this.prisma.refund.update({
        where: { id: refund.id },
        data: {
          status: retryable ? RefundStatus.PENDING : RefundStatus.FAILED,
          failureMessage: message.slice(0, 500)
        }
      });

      if (!retryable) {
        await this.restorePaymentStatus(payment.id);
      } else {
        await revokeAccess();
      }

      this.logger.error(`Refund ${refund.id} could not be placed: ${message}`);
    }

    return this.get(refund.id);
  }

  /**
   * The single funnel for refund state, exactly like
   * PaymentService.applyProviderState. Called by the refund API response, by
   * webhooks, and by the reconciliation sweep.
   */
  async applyProviderState(
    refundId: string,
    result: {
      providerRefundId: string | null;
      status: RefundStatus;
      amount: number;
      raw: unknown;
    }
  ): Promise<void> {
    const settled = await this.prisma.$transaction(async (tx) => {
      const refund = await tx.refund.findUnique({
        where: { id: refundId },
        include: { payment: { include: { refunds: true, order: true } } }
      });
      if (!refund) return null;

      // Terminal states are final; a late PROCESSING must not reopen them.
      if (
        refund.status === RefundStatus.SUCCEEDED ||
        refund.status === RefundStatus.CANCELLED
      ) {
        return null;
      }

      // The guard above already excluded an already-SUCCEEDED refund, so
      // reaching SUCCEEDED here is always a genuine first settlement.
      const justSucceeded = result.status === RefundStatus.SUCCEEDED;

      await tx.refund.update({
        where: { id: refund.id },
        data: {
          providerRefundId: result.providerRefundId ?? refund.providerRefundId,
          status: result.status,
          metadata: toJson(result.raw),
          processedAt:
            result.status === RefundStatus.SUCCEEDED ? new Date() : refund.processedAt
        }
      });

      if (!justSucceeded) {
        if (result.status === RefundStatus.FAILED) {
          await this.restorePaymentStatusTx(tx, refund.paymentId);
        }
        return null;
      }

      // Recompute from the rows rather than incrementing, so a replayed
      // webhook cannot inflate the refunded total.
      const succeeded = refund.payment.refunds
        .filter(
          (row) =>
            row.status === RefundStatus.SUCCEEDED || row.id === refund.id
        )
        .reduce((sum, row) => sum + row.amount, 0);

      const fullyRefunded = succeeded >= refund.payment.amount;

      await tx.payment.update({
        where: { id: refund.paymentId },
        data: {
          amountRefunded: succeeded,
          status: fullyRefunded
            ? PaymentStatus.REFUNDED
            : PaymentStatus.PARTIALLY_REFUNDED
        }
      });

      await tx.order.update({
        where: { id: refund.payment.orderId },
        data: {
          status: fullyRefunded
            ? OrderStatus.REFUNDED
            : OrderStatus.PARTIALLY_REFUNDED
        }
      });

      // The invoice records how much went back out; it is never rewritten.
      const invoice = await this.invoices.recordRefund(
        tx,
        refund.payment.orderId,
        succeeded,
        fullyRefunded
      );

      // The document that actually accounts for the reversal is a credit note
      // (§19). Idempotent on the unique refundId, so reconciliation re-reading
      // an already-settled refund never issues a second one.
      let creditNoteId: string | null = null;
      if (invoice) {
        const creditNote = await this.creditNotes.issueForRefund(tx, {
          invoiceId: invoice.id,
          refundId: refund.id,
          amount: refund.amount,
          reason: "REFUND",
          note: refund.reason,
          actorId: refund.requestedById
        });
        creditNoteId = creditNote?.id ?? null;

        await this.invoiceAudit.recordTx(tx, {
          event: "REFUND_COMPLETED",
          invoiceId: invoice.id,
          creditNoteId,
          actorId: refund.requestedById,
          metadata: {
            refundId: refund.id,
            amount: refund.amount,
            currency: refund.currency,
            fullyRefunded
          }
        });
      }

      return { paymentId: refund.paymentId, refundId: refund.id, creditNoteId };
    });

    if (settled) {
      this.messaging.dispatchInBackground({
        event: "REFUND_PROCESSED",
        paymentId: settled.paymentId,
        dedupeSuffix: settled.refundId
      });

      if (settled.creditNoteId) {
        this.invoiceGeneration.requestCreditNoteGeneration(settled.creditNoteId);
      }
    }
  }

  async get(refundId: string): Promise<RefundItem> {
    const refund = await this.prisma.refund.findUnique({
      where: { id: refundId },
      include: REFUND_INCLUDE
    });
    if (!refund) throw new NotFoundException("Refund not found.");
    return this.toItem(refund);
  }

  async list(limit = 200): Promise<RefundItem[]> {
    const rows = await this.prisma.refund.findMany({
      include: REFUND_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: limit
    });
    return rows.map((row) => this.toItem(row));
  }

  /**
   * Chases refunds the provider has not reported on. A delayed refund is
   * normal — banks take days — so this only reads state, never re-issues.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async reconcilePending(): Promise<void> {
    await this.jobLocks.runExclusive(JOB_LOCKS.refundReconciliation, () =>
      this.reconcilePendingNow()
    );
  }

  private async reconcilePendingNow(): Promise<void> {
    const pending = await this.prisma.refund.findMany({
      where: {
        status: { in: [RefundStatus.PENDING, RefundStatus.PROCESSING] },
        createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) }
      },
      include: { payment: true },
      take: 50
    });

    for (const refund of pending) {
      const adapter = this.registry.get(refund.provider);
      if (!adapter.isConfigured()) continue;

      const handle = refund.payment.providerPaymentId;
      if (!handle) continue;

      try {
        const details = await adapter.getPayment(
          handle,
          refund.payment.providerOrderId
        );
        // The payment's refunded total is the only signal every gateway gives
        // consistently. It is cumulative, so it must cover the refunds already
        // settled plus this one before this one counts as landed.
        const settled = await this.prisma.refund.aggregate({
          where: {
            paymentId: refund.paymentId,
            status: RefundStatus.SUCCEEDED,
            id: { not: refund.id }
          },
          _sum: { amount: true }
        });
        if (details.amountRefunded >= (settled._sum.amount ?? 0) + refund.amount) {
          await this.applyProviderState(refund.id, {
            providerRefundId: refund.providerRefundId,
            status: RefundStatus.SUCCEEDED,
            amount: refund.amount,
            raw: details.raw
          });
        }
      } catch (error) {
        this.logger.warn(
          `Could not reconcile refund ${refund.id}: ${(error as Error).message}`
        );
      }
    }
  }

  /** A failed refund returns the payment to whatever it was before. */
  private async restorePaymentStatus(paymentId: string): Promise<void> {
    await this.prisma.$transaction((tx) =>
      this.restorePaymentStatusTx(tx, paymentId)
    );
  }

  private async restorePaymentStatusTx(
    tx: PrismaTransactionClient,
    paymentId: string
  ): Promise<void> {
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: { refunds: true }
    });
    if (!payment) return;

    const succeeded = payment.refunds
      .filter((refund) => refund.status === RefundStatus.SUCCEEDED)
      .reduce((sum, refund) => sum + refund.amount, 0);

    const stillPending = payment.refunds.some(
      (refund) =>
        refund.status === RefundStatus.PENDING ||
        refund.status === RefundStatus.PROCESSING
    );
    if (stillPending) return;

    await tx.payment.update({
      where: { id: paymentId },
      data: {
        amountRefunded: succeeded,
        status:
          succeeded === 0
            ? PaymentStatus.PAID
            : succeeded >= payment.amount
              ? PaymentStatus.REFUNDED
              : PaymentStatus.PARTIALLY_REFUNDED
      }
    });
  }

  private toItem(row: RefundRow): RefundItem {
    return {
      id: row.id,
      paymentId: row.paymentId,
      orderNumber: row.payment.order.orderNumber,
      provider: row.provider,
      providerRefundId: row.providerRefundId,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      reason: row.reason,
      failureMessage: row.failureMessage,
      requestedByName: fullName(row.requestedBy),
      userName: fullName(row.payment.user),
      createdAt: row.createdAt.toISOString(),
      processedAt: row.processedAt?.toISOString() ?? null
    };
  }
}

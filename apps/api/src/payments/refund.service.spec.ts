import { BadRequestException, ConflictException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { PaymentStatus, RefundStatus } from "@prisma/client";
import { MessagingDispatchService } from "../messaging/messaging-dispatch.service";
import { JobLockService } from "../prisma/job-lock.service";
import { createJobLockStub } from "../prisma/job-lock.testing";
import { PrismaService } from "../prisma/prisma.service";
import { EntitlementService } from "./entitlement.service";
import { CreditNoteService } from "./credit-note.service";
import { InvoiceAuditService } from "./invoice-audit.service";
import { InvoiceGenerationService } from "./invoice-generation.service";
import { InvoiceService } from "./invoice.service";
import { PaymentProviderError } from "./providers/payment-provider.interface";
import { ProviderRegistry } from "./providers/provider-registry.service";
import { RefundService } from "./refund.service";

/**
 * Refunds (§14).
 *
 * The rule under test throughout: accepting a refund request is not the same as
 * the money arriving back. Only the gateway's later confirmation moves a refund
 * to SUCCEEDED — and a network failure must never be reported as "refund
 * failed", because that invites an admin to issue a second one.
 */
describe("RefundService.create", () => {
  const admin = { id: "adm_1" } as never;

  const buildModule = async (overrides: {
    payment?: Record<string, unknown>;
    refundPayment?: jest.Mock;
  }) => {
    const payment = {
      id: "pmt_1",
      orderId: "ord_1",
      provider: "RAZORPAY",
      providerPaymentId: "pay_1",
      providerOrderId: "order_1",
      amount: 99900,
      amountRefunded: 0,
      currency: "INR",
      status: PaymentStatus.PAID,
      refunds: [],
      order: { planId: "plan_1" },
      ...overrides.payment
    };

    const refundRow = {
      id: "rfnd_1",
      paymentId: "pmt_1",
      provider: "RAZORPAY",
      providerRefundId: null,
      amount: 99900,
      currency: "INR",
      status: RefundStatus.PENDING,
      reason: "Duplicate charge",
      failureMessage: null,
      requestedBy: { firstName: "Admin", lastName: null },
      createdAt: new Date(),
      processedAt: null,
      payment: {
        currency: "INR",
        order: { orderNumber: "NEXA-2026-ABC123" },
        user: { firstName: "Asha", lastName: "Menon" }
      }
    };

    const refundUpdate = jest.fn().mockResolvedValue(refundRow);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundService,
        { provide: JobLockService, useValue: createJobLockStub() },
        {
          provide: PrismaService,
          useValue: {
            payment: {
              findUnique: jest.fn().mockResolvedValue(payment),
              update: jest.fn().mockResolvedValue(payment)
            },
            refund: {
              create: jest.fn().mockResolvedValue(refundRow),
              findUnique: jest.fn().mockResolvedValue(refundRow),
              update: refundUpdate,
              findMany: jest.fn().mockResolvedValue([])
            },
            $transaction: (callback: (client: unknown) => unknown) =>
              Promise.resolve(
                callback({
                  $queryRaw: jest.fn().mockResolvedValue([]),
                  refund: { findUnique: jest.fn().mockResolvedValue(null) },
                  payment: {
                    findUnique: jest.fn().mockResolvedValue(payment),
                    // A definitive rejection restores the payment's status.
                    update: jest.fn().mockResolvedValue(payment)
                  },
                  entitlement: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) }
                })
              )
          }
        },
        { provide: EntitlementService, useValue: { revokeForOrder: jest.fn() } },
        { provide: CreditNoteService, useValue: { issueForRefund: jest.fn() } },
        { provide: InvoiceAuditService, useValue: { recordTx: jest.fn() } },
        {
          provide: InvoiceGenerationService,
          useValue: { generateCreditNote: jest.fn().mockResolvedValue(true) }
        },
        { provide: InvoiceService, useValue: { recordRefund: jest.fn() } },
        {
          provide: MessagingDispatchService,
          useValue: { dispatchInBackground: jest.fn() }
        },
        {
          provide: ProviderRegistry,
          useValue: {
            get: () => ({
              refundPayment:
                overrides.refundPayment ??
                jest.fn().mockResolvedValue({
                  providerRefundId: "rfnd_provider_1",
                  status: RefundStatus.PENDING,
                  amount: 99900,
                  raw: {}
                })
            })
          }
        }
      ]
    }).compile();

    return { service: module.get(RefundService), refundUpdate, payment };
  };

  it("refuses to refund a payment that was never captured", async () => {
    const { service } = await buildModule({
      payment: { status: PaymentStatus.FAILED }
    });

    await expect(
      service.create(admin, "pmt_1", { reason: "x", revokeAccess: false })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses when there is no gateway reference to refund against", async () => {
    const { service } = await buildModule({
      payment: { providerPaymentId: null }
    });

    await expect(
      service.create(admin, "pmt_1", { reason: "x", revokeAccess: false })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses a partial refund larger than the remaining balance", async () => {
    const { service } = await buildModule({
      payment: {
        refunds: [{ id: "r1", amount: 50000, status: RefundStatus.SUCCEEDED }]
      }
    });

    await expect(
      service.create(admin, "pmt_1", {
        amount: 60000,
        reason: "x",
        revokeAccess: false
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("counts an unsettled refund against the balance", async () => {
    // Two quick partial refunds must not be able to exceed the payment while
    // the first is still in flight.
    const { service } = await buildModule({
      payment: {
        refunds: [{ id: "r1", amount: 99900, status: RefundStatus.PENDING }]
      }
    });

    await expect(
      service.create(admin, "pmt_1", { reason: "x", revokeAccess: false })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("leaves a refund PENDING when the gateway only acknowledged it", async () => {
    const { service } = await buildModule({});

    const refund = await service.create(admin, "pmt_1", {
      reason: "Duplicate charge",
      revokeAccess: false
    });

    // Not SUCCEEDED: the API accepting the request proves nothing.
    expect(refund.status).toBe(RefundStatus.PENDING);
  });

  it("keeps a refund PENDING when the gateway call times out", async () => {
    // A transport failure may still have placed the refund. Marking it FAILED
    // would invite a second refund for the same money.
    const { service, refundUpdate } = await buildModule({
      refundPayment: jest.fn().mockRejectedValue(
        new PaymentProviderError("RAZORPAY", "refundPayment", "socket timeout", {
          retryable: true
        })
      )
    });

    await service.create(admin, "pmt_1", { reason: "x", revokeAccess: false });

    expect(refundUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: RefundStatus.PENDING })
      })
    );
  });

  it("marks a refund FAILED only on a definitive rejection", async () => {
    const { service, refundUpdate } = await buildModule({
      refundPayment: jest.fn().mockRejectedValue(
        new PaymentProviderError(
          "RAZORPAY",
          "refundPayment",
          "Refund amount exceeds payment",
          { retryable: false, statusCode: 400 }
        )
      )
    });

    await service.create(admin, "pmt_1", { reason: "x", revokeAccess: false });

    expect(refundUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: RefundStatus.FAILED })
      })
    );
  });
});

describe("RefundService.applyProviderState", () => {
  const buildModule = async (refund: Record<string, unknown>) => {
    const refundUpdate = jest.fn().mockResolvedValue({});
    const paymentUpdate = jest.fn().mockResolvedValue({});
    const orderUpdate = jest.fn().mockResolvedValue({});
    const recordRefund = jest.fn();
    const dispatch = jest.fn();

    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      refund: { findUnique: jest.fn().mockResolvedValue(refund), update: refundUpdate },
      payment: { update: paymentUpdate, findUnique: jest.fn() },
      order: { update: orderUpdate }
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundService,
        { provide: JobLockService, useValue: createJobLockStub() },
        {
          provide: PrismaService,
          useValue: {
            $transaction: (callback: (client: unknown) => unknown) =>
              Promise.resolve(callback(tx))
          }
        },
        { provide: EntitlementService, useValue: {} },
        {
          provide: CreditNoteService,
          useValue: {
            issueForRefund: jest.fn().mockResolvedValue({ id: "cn_1" })
          }
        },
        { provide: InvoiceAuditService, useValue: { recordTx: jest.fn() } },
        {
          provide: InvoiceGenerationService,
          useValue: { generateCreditNote: jest.fn().mockResolvedValue(true) }
        },
        { provide: InvoiceService, useValue: { recordRefund } },
        {
          provide: MessagingDispatchService,
          useValue: { dispatchInBackground: dispatch }
        },
        { provide: ProviderRegistry, useValue: {} }
      ]
    }).compile();

    return {
      service: module.get(RefundService),
      refundUpdate,
      paymentUpdate,
      orderUpdate,
      recordRefund,
      dispatch
    };
  };

  const baseRefund = {
    id: "rfnd_1",
    paymentId: "pmt_1",
    status: RefundStatus.PENDING,
    amount: 99900,
    providerRefundId: null,
    processedAt: null,
    payment: {
      id: "pmt_1",
      orderId: "ord_1",
      amount: 99900,
      refunds: [{ id: "rfnd_1", amount: 99900, status: RefundStatus.PENDING }]
    }
  };

  it("marks the payment REFUNDED once the gateway confirms a full refund", async () => {
    const { service, paymentUpdate, orderUpdate, dispatch } =
      await buildModule(baseRefund);

    await service.applyProviderState("rfnd_1", {
      providerRefundId: "rfnd_provider_1",
      status: RefundStatus.SUCCEEDED,
      amount: 99900,
      raw: {}
    });

    expect(paymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amountRefunded: 99900,
          status: PaymentStatus.REFUNDED
        })
      })
    );
    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "REFUNDED" })
      })
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ event: "REFUND_PROCESSED", paymentId: "pmt_1" })
    );
  });

  it("marks a partial refund PARTIALLY_REFUNDED", async () => {
    const { service, paymentUpdate } = await buildModule({
      ...baseRefund,
      amount: 40000,
      payment: {
        ...baseRefund.payment,
        refunds: [{ id: "rfnd_1", amount: 40000, status: RefundStatus.PENDING }]
      }
    });

    await service.applyProviderState("rfnd_1", {
      providerRefundId: "rfnd_provider_1",
      status: RefundStatus.SUCCEEDED,
      amount: 40000,
      raw: {}
    });

    expect(paymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amountRefunded: 40000,
          status: PaymentStatus.PARTIALLY_REFUNDED
        })
      })
    );
  });

  it("ignores a duplicate settlement rather than double-counting", async () => {
    // A replayed refund webhook must not inflate amountRefunded.
    const { service, paymentUpdate, dispatch } = await buildModule({
      ...baseRefund,
      status: RefundStatus.SUCCEEDED
    });

    await service.applyProviderState("rfnd_1", {
      providerRefundId: "rfnd_provider_1",
      status: RefundStatus.SUCCEEDED,
      amount: 99900,
      raw: {}
    });

    expect(paymentUpdate).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not touch the payment while a refund is still processing", async () => {
    const { service, paymentUpdate, dispatch } = await buildModule(baseRefund);

    await service.applyProviderState("rfnd_1", {
      providerRefundId: "rfnd_provider_1",
      status: RefundStatus.PROCESSING,
      amount: 99900,
      raw: {}
    });

    expect(paymentUpdate).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
});

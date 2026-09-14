import { ConflictException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { MessagingDispatchService } from "../messaging/messaging-dispatch.service";
import { PrismaService } from "../prisma/prisma.service";
import { BillingProfileService } from "./billing-profile.service";
import { CreditNoteService } from "./credit-note.service";
import { DiscountService } from "./discount.service";
import { EntitlementService } from "./entitlement.service";
import { InvoiceAuditService } from "./invoice-audit.service";
import { InvoiceGenerationService } from "./invoice-generation.service";
import { InvoiceService } from "./invoice.service";
import { PaymentRouterService } from "./payment-router.service";
import { PaymentService } from "./payment.service";
import type { PaymentDetails } from "./providers/payment-provider.interface";
import { ProviderRegistry } from "./providers/provider-registry.service";
import { SubscriptionService } from "./subscription.service";

/**
 * The capture funnel (§5, §11, §21).
 *
 * Every scenario here is one of the failure modes the spec calls out: a webhook
 * arriving twice, a webhook arriving out of order, a gateway reporting an
 * amount that does not match the order, and a client claiming success it cannot
 * prove. In all of them the invariant is the same — access is granted exactly
 * once, and only for money the gateway actually confirmed.
 */

type PaymentRow = {
  id: string;
  orderId: string;
  userId: string;
  provider: "RAZORPAY";
  providerPaymentId: string | null;
  providerOrderId: string | null;
  amount: number;
  amountRefunded: number;
  currency: string;
  paymentMethod: string | null;
  methodDetail: string | null;
  status: PaymentStatus;
  failureCode: string | null;
  failureMessage: string | null;
  paidAt: Date | null;
  subscriptionId: string | null;
  createdAt: Date;
  order: {
    id: string;
    userId: string;
    planId: string | null;
    orderNumber: string;
    status: OrderStatus;
    subtotalAmount: number;
    taxAmount: number;
    discountAmount: number;
    discountId: string | null;
    discountCode: string | null;
    plan: { name: string; taxPercent: number } | null;
  };
};

const details = (overrides: Partial<PaymentDetails> = {}): PaymentDetails => ({
  providerPaymentId: "pay_1",
  providerOrderId: "order_1",
  status: "PAID",
  method: "UPI",
  methodDetail: "upi · gpay",
  amount: 99900,
  amountRefunded: 0,
  currency: "INR",
  failureCode: null,
  failureMessage: null,
  paidAt: new Date("2026-09-14T10:00:00Z"),
  raw: { ok: true },
  ...overrides
});

describe("PaymentService.applyProviderState", () => {
  let service: PaymentService;
  let payment: PaymentRow;
  let grant: jest.Mock;
  let issue: jest.Mock;
  let dispatch: jest.Mock;
  let redeem: jest.Mock;
  let paymentUpdate: jest.Mock;
  let orderUpdate: jest.Mock;

  beforeEach(async () => {
    payment = {
      id: "pmt_1",
      orderId: "ord_1",
      userId: "usr_1",
      provider: "RAZORPAY",
      providerPaymentId: null,
      providerOrderId: "order_1",
      amount: 99900,
      amountRefunded: 0,
      currency: "INR",
      paymentMethod: null,
      methodDetail: null,
      status: PaymentStatus.PENDING,
      failureCode: null,
      failureMessage: null,
      paidAt: null,
      subscriptionId: null,
      createdAt: new Date("2026-09-14T09:00:00Z"),
      order: {
        id: "ord_1",
        userId: "usr_1",
        planId: "plan_1",
        orderNumber: "NEXA-2026-ABC123",
        status: OrderStatus.PENDING,
        subtotalAmount: 99900,
        taxAmount: 0,
        discountAmount: 0,
        discountId: null,
        discountCode: null,
        plan: { name: "Premium Membership", taxPercent: 0 }
      }
    };

    grant = jest.fn().mockResolvedValue({ id: "ent_1" });
    issue = jest.fn().mockResolvedValue({ id: "inv_1" });
    dispatch = jest.fn();
    redeem = jest.fn();
    paymentUpdate = jest.fn().mockImplementation(({ data }) => {
      // Mirror the write back onto the row, so a second call in the same test
      // sees the state the first one left.
      if (data.status) payment.status = data.status;
      if (data.paidAt !== undefined) payment.paidAt = data.paidAt;
      return Promise.resolve(payment);
    });
    orderUpdate = jest.fn().mockResolvedValue(payment.order);

    const tx = {
      payment: { findUnique: () => Promise.resolve(payment), update: paymentUpdate },
      paymentAttempt: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      order: { update: orderUpdate }
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: (callback: (client: unknown) => unknown) =>
              Promise.resolve(callback(tx)),
            entitlement: { findUnique: jest.fn().mockResolvedValue(null) },
            payment: { findUnique: jest.fn().mockResolvedValue(payment) }
          }
        },
        { provide: BillingProfileService, useValue: {} },
        { provide: CreditNoteService, useValue: { listForUser: jest.fn() } },
        { provide: DiscountService, useValue: { redeem } },
        { provide: EntitlementService, useValue: { grant } },
        { provide: InvoiceAuditService, useValue: { recordTx: jest.fn() } },
        {
          provide: InvoiceGenerationService,
          useValue: { requestGeneration: jest.fn() }
        },
        { provide: InvoiceService, useValue: { issue } },
        {
          provide: MessagingDispatchService,
          useValue: { dispatchInBackground: dispatch }
        },
        { provide: ProviderRegistry, useValue: {} },
        { provide: PaymentRouterService, useValue: {} },
        { provide: SubscriptionService, useValue: {} }
      ]
    }).compile();

    service = module.get(PaymentService);
  });

  it("captures a payment and grants access exactly once", async () => {
    const result = await service.applyProviderState("pmt_1", details(), "webhook");

    expect(result).toEqual({ changed: true, status: PaymentStatus.PAID });
    expect(grant).toHaveBeenCalledTimes(1);
    expect(grant).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: "usr_1",
        planId: "plan_1",
        orderId: "ord_1",
        paymentId: "pmt_1"
      })
    );
    expect(issue).toHaveBeenCalledTimes(1);
    expect(orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PAID" }) })
    );
    expect(dispatch).toHaveBeenCalledWith({
      event: "PAYMENT_RECEIVED",
      paymentId: "pmt_1"
    });
  });

  it("ignores a duplicate webhook rather than granting twice", async () => {
    await service.applyProviderState("pmt_1", details(), "webhook");
    grant.mockClear();
    issue.mockClear();
    dispatch.mockClear();

    // The same captured event redelivered by the gateway.
    const second = await service.applyProviderState("pmt_1", details(), "webhook");

    expect(second.changed).toBe(false);
    expect(grant).not.toHaveBeenCalled();
    expect(issue).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("ignores a stale PENDING arriving after the capture", async () => {
    await service.applyProviderState("pmt_1", details(), "webhook");
    grant.mockClear();

    const late = await service.applyProviderState(
      "pmt_1",
      details({ status: "PENDING" }),
      "webhook"
    );

    expect(late).toEqual({ changed: false, status: PaymentStatus.PAID });
    expect(grant).not.toHaveBeenCalled();
  });

  it("ignores a late FAILED for another attempt on a paid order", async () => {
    await service.applyProviderState("pmt_1", details(), "webhook");

    const late = await service.applyProviderState(
      "pmt_1",
      details({ status: "FAILED", failureCode: "BAD_CARD" }),
      "webhook"
    );

    // Access must survive a failed sibling attempt.
    expect(late.status).toBe(PaymentStatus.PAID);
    expect(late.changed).toBe(false);
  });

  it("withholds access when the captured amount is not the order amount", async () => {
    const result = await service.applyProviderState(
      "pmt_1",
      details({ amount: 1000 }),
      "webhook"
    );

    // Underpayment parks the payment for review instead of granting.
    expect(result.status).toBe(PaymentStatus.PROCESSING);
    expect(grant).not.toHaveBeenCalled();
    expect(issue).not.toHaveBeenCalled();
    expect(paymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failureCode: "amount_mismatch" })
      })
    );
  });

  it("records a genuine failure and tells the customer", async () => {
    const result = await service.applyProviderState(
      "pmt_1",
      details({
        status: "FAILED",
        failureCode: "BAD_REQUEST_ERROR",
        failureMessage: "Payment declined by the bank",
        paidAt: null
      }),
      "webhook"
    );

    expect(result.status).toBe(PaymentStatus.FAILED);
    expect(grant).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({
      event: "PAYMENT_FAILED",
      paymentId: "pmt_1"
    });
  });

  it("still records gateway handles when the status has not moved", async () => {
    payment.status = PaymentStatus.PROCESSING;

    // Same status, but the gateway now knows the payment id — worth storing,
    // because reconciliation and dispute handling need it.
    const result = await service.applyProviderState(
      "pmt_1",
      details({ status: "PROCESSING" }),
      "reconcile"
    );

    expect(result.changed).toBe(false);
    expect(paymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ providerPaymentId: "pay_1" })
      })
    );
  });
});

describe("PaymentService.retry", () => {
  it("refuses a second attempt while one is still in flight", async () => {
    const payment = {
      id: "pmt_1",
      orderId: "ord_1",
      userId: "usr_1",
      status: PaymentStatus.PENDING
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        {
          provide: PrismaService,
          useValue: { payment: { findUnique: jest.fn().mockResolvedValue(payment) } }
        },
        { provide: BillingProfileService, useValue: {} },
        { provide: CreditNoteService, useValue: {} },
        { provide: DiscountService, useValue: {} },
        { provide: EntitlementService, useValue: {} },
        { provide: InvoiceAuditService, useValue: { recordTx: jest.fn() } },
        {
          provide: InvoiceGenerationService,
          useValue: { requestGeneration: jest.fn() }
        },
        { provide: InvoiceService, useValue: {} },
        { provide: MessagingDispatchService, useValue: { dispatchInBackground: jest.fn() } },
        { provide: ProviderRegistry, useValue: { anyConfigured: () => true } },
        { provide: PaymentRouterService, useValue: {} },
        { provide: SubscriptionService, useValue: {} }
      ]
    }).compile();

    const service = module.get(PaymentService);
    jest.spyOn(service, "getStatus").mockResolvedValue({
      pending: true,
      status: "PROCESSING"
    } as never);

    // §17: while the original attempt may still debit the customer, opening a
    // second one is exactly the double-charge this rule exists to prevent.
    await expect(
      service.retry({ id: "usr_1", role: "STUDENT" } as never, "pmt_1")
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses a retry on an order that is already paid", async () => {
    const payment = {
      id: "pmt_1",
      orderId: "ord_1",
      userId: "usr_1",
      status: PaymentStatus.PAID
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        {
          provide: PrismaService,
          useValue: { payment: { findUnique: jest.fn().mockResolvedValue(payment) } }
        },
        { provide: BillingProfileService, useValue: {} },
        { provide: CreditNoteService, useValue: {} },
        { provide: DiscountService, useValue: {} },
        { provide: EntitlementService, useValue: {} },
        { provide: InvoiceAuditService, useValue: { recordTx: jest.fn() } },
        {
          provide: InvoiceGenerationService,
          useValue: { requestGeneration: jest.fn() }
        },
        { provide: InvoiceService, useValue: {} },
        { provide: MessagingDispatchService, useValue: { dispatchInBackground: jest.fn() } },
        { provide: ProviderRegistry, useValue: { anyConfigured: () => true } },
        { provide: PaymentRouterService, useValue: {} },
        { provide: SubscriptionService, useValue: {} }
      ]
    }).compile();

    const service = module.get(PaymentService);
    jest.spyOn(service, "getStatus").mockResolvedValue({
      pending: false,
      status: "PAID"
    } as never);

    await expect(
      service.retry({ id: "usr_1", role: "STUDENT" } as never, "pmt_1")
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("idempotency-key collisions", () => {
  it("treats P2002 on the order key as a replay, not an error", () => {
    // The unique index on orders.idempotencyKey IS the double-submit guard;
    // the code must recognise its violation rather than surfacing a 500.
    const error = new Prisma.PrismaClientKnownRequestError("dup", {
      code: "P2002",
      clientVersion: "6.19.3"
    });

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { isUniqueViolation } = require("./payment.service") as {
      isUniqueViolation: (error: unknown) => boolean;
    };

    expect(isUniqueViolation(error)).toBe(true);
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
  });
});

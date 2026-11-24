import { BadRequestException, ConflictException } from "@nestjs/common";
import { getApiEnv } from "@nexa-chess/config";
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
  let verifyPayment: jest.Mock;
  let getPayment: jest.Mock;
  let expireMany: jest.Mock;
  let module: TestingModule;

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
    verifyPayment = jest.fn();
    getPayment = jest.fn();
    expireMany = jest.fn().mockResolvedValue({ count: 0 });

    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      payment: { findUnique: () => Promise.resolve(payment), update: paymentUpdate, updateMany: expireMany },
      paymentAttempt: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      order: { update: orderUpdate }
    };

    module = await Test.createTestingModule({
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
        {
          provide: ProviderRegistry,
          useValue: { get: () => ({ getPayment, isConfigured: () => true, verifyPayment }) }
        },
        { provide: PaymentRouterService, useValue: {} },
        { provide: SubscriptionService, useValue: {} }
      ]
    }).compile();

    service = module.get(PaymentService);
  });

  // Review P6: a second capture on an order already paid is held for a refund.
  it("holds a second capture on an already-paid order instead of granting again", async () => {
    payment.order.status = OrderStatus.PAID;
    const result = await service.applyProviderState("pmt_1", details({ providerPaymentId: "pay_2" }), "webhook");
    expect(result.status).toBe(PaymentStatus.PROCESSING);
    expect(grant).not.toHaveBeenCalled();
    expect(issue).not.toHaveBeenCalled();
    expect(paymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ failureCode: "duplicate_capture" }) })
    );
  });

  // Review P7: a failed attempt then a success on the same gateway order.
  it("takes the capturing payment id over a failed attempt's", async () => {
    payment.providerPaymentId = "pay_failed";
    await service.applyProviderState("pmt_1", details({ providerPaymentId: "pay_ok" }), "webhook");
    expect(paymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ providerPaymentId: "pay_ok" }) })
    );
  });

  it("keeps the id of a payment that already captured", async () => {
    payment.providerPaymentId = "pay_ok";
    payment.status = PaymentStatus.PAID;
    await service.applyProviderState(
      "pmt_1",
      details({ providerPaymentId: "pay_failed", status: PaymentStatus.FAILED }),
      "webhook"
    );
    const writes = paymentUpdate.mock.calls.map(([arg]) => arg.data);
    expect(writes.some((data) => data.providerPaymentId)).toBe(false);
  });

  it("ignores a capture that belongs to a different gateway order", async () => {
    const result = await service.applyProviderState(
      "pmt_1",
      details({ providerOrderId: "order_other", providerPaymentId: "pay_other" }),
      "verify"
    );

    expect(result).toEqual({ changed: false, status: PaymentStatus.PENDING });
    expect(paymentUpdate).not.toHaveBeenCalled();
    expect(grant).not.toHaveBeenCalled();
  });

  describe("verify", () => {
    const student = { id: "usr_1", role: "STUDENT" } as never;

    it("only queries the payment's own gateway order", async () => {
      verifyPayment.mockResolvedValue({
        verified: false,
        reason: "bad signature",
        details: details({ providerOrderId: "order_other", providerPaymentId: "pay_other" })
      });

      await service.verify(student, "pmt_1", { providerPaymentId: "pay_other", signature: "x" });

      expect(verifyPayment).toHaveBeenCalledWith(
        expect.objectContaining({ providerOrderId: "order_1" })
      );
      expect(grant).not.toHaveBeenCalled();
      expect(payment.status).toBe(PaymentStatus.PENDING);
    });

    it("rejects an order handle that is not this payment's", async () => {
      await expect(
        service.verify(student, "pmt_1", { providerOrderId: "order_other" })
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(verifyPayment).not.toHaveBeenCalled();
    });

    it("does not ask a gateway about a payment that never reached one", async () => {
      payment.providerOrderId = null;

      await service.verify(student, "pmt_1", { providerOrderId: "order_other" });

      expect(verifyPayment).not.toHaveBeenCalled();
      expect(grant).not.toHaveBeenCalled();
    });

    it("still captures a genuine handshake for its own order", async () => {
      verifyPayment.mockResolvedValue({ verified: true, reason: null, details: details() });

      await service.verify(student, "pmt_1", {
        providerOrderId: "order_1",
        providerPaymentId: "pay_1",
        signature: "sig"
      });

      expect(grant).toHaveBeenCalledTimes(1);
    });
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

  it("withholds access when the capture is in another currency", async () => {
    // Review P1: 99900 paise of PKR is not ₹999.
    const result = await service.applyProviderState(
      "pmt_1",
      details({ currency: "PKR" }),
      "webhook"
    );

    expect(result.status).toBe(PaymentStatus.PROCESSING);
    expect(grant).not.toHaveBeenCalled();
    expect(paymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failureCode: "currency_mismatch" })
      })
    );
  });

  it("refuses a checkout in a currency other than the plan's", async () => {
    Object.assign(getApiEnv(), { PAYMENTS_ENABLED: true });
    const registry = module.get(ProviderRegistry) as unknown as { anyConfigured?: () => boolean };
    registry.anyConfigured = () => true;
    const prisma = module.get(PrismaService) as unknown as Record<string, unknown>;
    const orderLookup = jest.fn().mockResolvedValue(null);
    prisma.plan = {
      findUnique: jest.fn().mockResolvedValue({ amount: 99900, currency: "INR", id: "plan_1", isActive: true })
    };
    prisma.order = { findUnique: orderLookup };

    await expect(
      service.createCheckout({ id: "usr_1", role: "STUDENT" } as never, {
        currency: "PKR",
        idempotencyKey: "key-1",
        planId: "plan_1"
      } as never)
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(orderLookup).not.toHaveBeenCalled();
  });

  it("refuses to replay an unpaid order under a different discount code (FE review P2)", async () => {
    Object.assign(getApiEnv(), { PAYMENTS_ENABLED: true });
    const registry = module.get(ProviderRegistry) as unknown as { anyConfigured?: () => boolean };
    registry.anyConfigured = () => true;
    const prisma = module.get(PrismaService) as unknown as Record<string, unknown>;
    prisma.plan = {
      findUnique: jest.fn().mockResolvedValue({ amount: 99900, currency: "INR", id: "plan_1", isActive: true })
    };
    prisma.order = {
      findUnique: jest.fn().mockResolvedValue({
        discountCode: null,
        id: "ord_1",
        status: OrderStatus.PENDING,
        userId: "usr_1"
      })
    };

    await expect(
      service.createCheckout({ id: "usr_1", role: "STUDENT" } as never, {
        discountCode: "SAVE20",
        idempotencyKey: "key-1",
        planId: "plan_1"
      } as never)
    ).rejects.toMatchObject({ response: expect.objectContaining({ code: "CHECKOUT_CHANGED" }) });
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

  // Review P5: a failed lookup must never expire a payment that may have captured.
  describe("reconcile", () => {
    beforeEach(() => {
      payment.createdAt = new Date("2020-01-01T00:00:00Z"); // long stale
      payment.providerPaymentId = null;
    });

    it("leaves the payment alone when the gateway lookup fails", async () => {
      getPayment.mockRejectedValue(new Error("gateway down"));
      await service.reconcile("pmt_1");
      expect(getPayment).toHaveBeenCalledWith("order_1", "order_1");
      expect(expireMany).not.toHaveBeenCalled();
      expect(payment.status).toBe(PaymentStatus.PENDING);
    });

    it("applies a capture the gateway reports for the order", async () => {
      getPayment.mockResolvedValue(details());
      await service.reconcile("pmt_1");
      expect(grant).toHaveBeenCalled();
      expect(expireMany).not.toHaveBeenCalled();
    });

    it("expires a stale payment only when the gateway says nothing was paid", async () => {
      getPayment.mockResolvedValue(details({ amount: null, providerPaymentId: null, status: PaymentStatus.PENDING }));
      await service.reconcile("pmt_1");
      expect(expireMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: PaymentStatus.EXPIRED }) })
      );
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
  // Review P6: the payment being retried failed, but ANOTHER attempt on the
  // same order is still in the air.
  it("refuses a new attempt while another payment on the order is in flight", async () => {
    const failed = { id: "pmt_1", orderId: "ord_1", status: PaymentStatus.FAILED, userId: "usr_1" };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      order: { update: jest.fn() },
      payment: { create: jest.fn(), findFirst: jest.fn().mockResolvedValue({ id: "pmt_2" }) },
      paymentAttempt: { create: jest.fn() }
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        {
          provide: PrismaService,
          useValue: {
            $transaction: (callback: (client: unknown) => unknown) => Promise.resolve(callback(tx)),
            order: {
              findUnique: jest.fn().mockResolvedValue({
                amount: 99900,
                attempts: [{ attemptNumber: 1, provider: "RAZORPAY", status: PaymentStatus.FAILED }],
                currency: "INR",
                id: "ord_1",
                plan: null,
                status: OrderStatus.PENDING,
                userId: "usr_1"
              })
            },
            payment: { findUnique: jest.fn().mockResolvedValue(failed) }
          }
        },
        { provide: BillingProfileService, useValue: {} },
        { provide: CreditNoteService, useValue: {} },
        { provide: DiscountService, useValue: {} },
        { provide: EntitlementService, useValue: {} },
        { provide: InvoiceAuditService, useValue: { recordTx: jest.fn() } },
        { provide: InvoiceGenerationService, useValue: { requestGeneration: jest.fn() } },
        { provide: InvoiceService, useValue: {} },
        { provide: MessagingDispatchService, useValue: { dispatchInBackground: jest.fn() } },
        {
          provide: ProviderRegistry,
          useValue: { anyConfigured: () => true, require: () => ({ createPayment: jest.fn() }) }
        },
        { provide: PaymentRouterService, useValue: { route: jest.fn().mockResolvedValue({ provider: "RAZORPAY", ruleId: null }) } },
        { provide: SubscriptionService, useValue: {} }
      ]
    }).compile();

    const service = module.get(PaymentService);
    jest.spyOn(service, "getStatus").mockResolvedValue({ pending: false, status: "FAILED" } as never);

    await expect(service.retry({ id: "usr_1", role: "STUDENT" } as never, "pmt_1")).rejects.toThrow(
      "A payment for this order is still being confirmed."
    );
    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

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

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { isUniqueViolation } = require("./payment.service") as {
      isUniqueViolation: (error: unknown) => boolean;
    };

    expect(isUniqueViolation(error)).toBe(true);
    expect(isUniqueViolation(new Error("boom"))).toBe(false);
  });
});

// Review P4: checkout charges what the invoice will total, from the same engine.
describe("PaymentService.priceForUser", () => {
  it("prices tax with the invoice's engine for this buyer", async () => {
    const taxFor = jest.fn().mockResolvedValue({ taxTotal: 0, treatment: "EXPORT" });
    const priced = await PaymentService.prototype.priceForUser.call(
      { invoices: { taxFor } } as never,
      "usr_1",
      99900,
      18
    );
    expect(taxFor).toHaveBeenCalledWith("usr_1", 99900, 18);
    expect(priced).toEqual({ subtotal: 99900, taxAmount: 0, total: 99900 });
  });

  it("skips the lookups for a plan without tax", async () => {
    const taxFor = jest.fn();
    const priced = await PaymentService.prototype.priceForUser.call({ invoices: { taxFor } } as never, "usr_1", 500, 0);
    expect(taxFor).not.toHaveBeenCalled();
    expect(priced.total).toBe(500);
  });
});

// Review P2: each cycle charge becomes a Payment through applyProviderState.
describe("PaymentService.recordSubscriptionCharge", () => {
  const subscription = {
    amount: 118000,
    currency: "INR",
    id: "sub_1",
    initialOrderId: "ord_1",
    planId: "plan_1",
    userId: "usr_1"
  };
  const initialOrder = {
    amount: 118000,
    currency: "INR",
    discountAmount: 0,
    discountCode: null,
    id: "ord_1",
    notes: { planCode: "MONTHLY", taxPercent: 18 },
    subtotalAmount: 100000,
    taxAmount: 18000
  };
  const charge = {
    amount: 118000,
    currency: "INR",
    eventType: "subscription.charged",
    method: null,
    methodDetail: null,
    paidAt: null,
    providerOrderId: null,
    providerPaymentId: "pay_9",
    providerSubscriptionId: "rzp_sub_1",
    raw: {},
    subscriptionCharge: true
  };

  const build = (initialPayments: Array<{ id: string }>) => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      order: {
        create: jest.fn().mockResolvedValue({ amount: 118000, currency: "INR", id: "ord_2" }),
        findUnique: jest.fn().mockResolvedValue({ ...initialOrder, payments: initialPayments })
      },
      payment: {
        create: jest.fn().mockResolvedValue({ id: "pmt_new" }),
        findFirst: jest.fn().mockResolvedValue(null)
      }
    };
    const service = Object.create(PaymentService.prototype) as PaymentService;
    const applyProviderState = jest.fn().mockResolvedValue({ changed: true, status: "PAID" });
    Object.assign(service, {
      applyProviderState,
      env: { PAYMENTS_INVOICE_PREFIX: "NX" },
      logger: { warn: jest.fn() },
      prisma: {
        $transaction: (callback: (client: unknown) => unknown) => Promise.resolve(callback(tx)),
        payment: { findFirst: jest.fn().mockResolvedValue(null) },
        subscription: { findFirst: jest.fn().mockResolvedValue(subscription) }
      }
    });
    return { applyProviderState, service, tx };
  };

  it("puts the first cycle on the order the mandate was opened from", async () => {
    const { applyProviderState, service, tx } = build([]);
    await service.recordSubscriptionCharge("RAZORPAY", charge as never);

    expect(tx.order.create).not.toHaveBeenCalled();
    expect(tx.payment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ amount: 118000, orderId: "ord_1", providerPaymentId: "pay_9", subscriptionId: "sub_1" })
    });
    expect(applyProviderState).toHaveBeenCalledWith(
      "pmt_new",
      expect.objectContaining({ amount: 118000, providerPaymentId: "pay_9", status: "PAID" }),
      "subscription-charge"
    );
  });

  it("gives a renewal its own order priced like the first, without redeeming the code again", async () => {
    const { service, tx } = build([{ id: "pmt_first" }]);
    await service.recordSubscriptionCharge("RAZORPAY", charge as never);

    expect(tx.order.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        amount: 118000,
        idempotencyKey: "subscription:sub_1:pay_9",
        subtotalAmount: 100000,
        taxAmount: 18000
      })
    });
    expect(tx.order.create.mock.calls[0][0].data.discountId).toBeUndefined();
    expect(tx.payment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ orderId: "ord_2" }) });
  });

  it("re-applies to the existing payment on a repeat event", async () => {
    const { applyProviderState, service, tx } = build([]);
    (service as unknown as { prisma: { payment: { findFirst: jest.Mock } } }).prisma.payment.findFirst.mockResolvedValue({
      id: "pmt_old"
    });
    await service.recordSubscriptionCharge("RAZORPAY", charge as never);

    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(applyProviderState).toHaveBeenCalledWith("pmt_old", expect.anything(), "subscription-charge");
  });
});

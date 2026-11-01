import { PaymentProvider, PaymentStatus, RefundStatus, UserRole } from "@prisma/client";
import { PaymentService } from "../../../payments/payment.service";
import type { PaymentDetails } from "../../../payments/providers/payment-provider.interface";
import { RefundService } from "../../../payments/refund.service";
import { createTestApp, type TestApp } from "../app";
import { createUser, resetDatabase } from "../db";

const AMOUNT = 100_000;
const ROUNDS = 5;

const details = (status: PaymentStatus): PaymentDetails => ({
  amount: AMOUNT,
  amountRefunded: 0,
  currency: "INR",
  failureCode: status === PaymentStatus.FAILED ? "declined" : null,
  failureMessage: null,
  method: null,
  methodDetail: null,
  paidAt: null,
  providerOrderId: null,
  providerPaymentId: null,
  raw: {},
  status
});

describe("payment/refund row locks (real app, real Postgres)", () => {
  let t: TestApp;
  let seq = 0;

  // No plan and no invoice, so only the status/amount bookkeeping runs.
  const createPayment = async (status: PaymentStatus) => {
    seq += 1;
    const user = await createUser(t.prisma, UserRole.STUDENT);
    const order = await t.prisma.order.create({
      data: {
        amount: AMOUNT,
        idempotencyKey: `lock-${seq}`,
        orderNumber: `ORD-LOCK-${seq}`,
        subtotalAmount: AMOUNT,
        userId: user.id
      }
    });
    return t.prisma.payment.create({
      data: { amount: AMOUNT, orderId: order.id, provider: PaymentProvider.RAZORPAY, status, userId: user.id }
    });
  };

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
  }, 60_000);

  afterAll(async () => {
    await t?.close();
  });

  it("a PAID and a FAILED webhook arriving together always end PAID", async () => {
    const payments = t.app.get(PaymentService);
    for (let round = 0; round < ROUNDS; round++) {
      const payment = await createPayment(PaymentStatus.PENDING);
      await Promise.all([
        payments.applyProviderState(payment.id, details(PaymentStatus.FAILED), "int-failed"),
        payments.applyProviderState(payment.id, details(PaymentStatus.PAID), "int-paid")
      ]);
      const after = await t.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(after.status).toBe(PaymentStatus.PAID);
    }
  });

  it("two partial refunds settling together both count", async () => {
    const refunds = t.app.get(RefundService);
    for (let round = 0; round < ROUNDS; round++) {
      const payment = await createPayment(PaymentStatus.PAID);
      const [a, b] = await Promise.all(
        ["a", "b"].map((key) =>
          t.prisma.refund.create({
            data: {
              amount: 30_000,
              idempotencyKey: `refund-${payment.id}-${key}`,
              paymentId: payment.id,
              provider: PaymentProvider.RAZORPAY
            }
          })
        )
      );
      await Promise.all(
        [a, b].map((refund) =>
          refunds.applyProviderState(refund.id, {
            amount: refund.amount,
            providerRefundId: `rfnd_${refund.id}`,
            raw: {},
            status: RefundStatus.SUCCEEDED
          })
        )
      );
      const after = await t.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
      expect(after.amountRefunded).toBe(60_000);
      expect(after.status).toBe(PaymentStatus.PARTIALLY_REFUNDED);
    }
  });
});

/**
 * Integration check for per-batch pricing and discounts, against the real
 * database.
 *
 * Covers the things unit tests cannot: that a batch price option really is an
 * ordinary plan, that a discount is priced server-side and only consumed when
 * money arrives, and that tax is charged on the discounted subtotal rather than
 * the list price.
 *
 * Needs a built dist and a seeded database:
 *   npm run build -w apps/api && npm run db:seed
 *   npm run test:payments:pricing -w apps/api
 */
const { NestFactory } = require("@nestjs/core");
const { AppModule } = require("../dist/src/app.module");
const { PrismaService } = require("../dist/src/prisma/prisma.service");
const { PaymentService } = require("../dist/src/payments/payment.service");
const {
  BatchPricingService
} = require("../dist/src/payments/batch-pricing.service");
const { DiscountService } = require("../dist/src/payments/discount.service");
const { createDiscountRequestSchema } = require("@nexa-chess/types");

let failures = 0;

function check(label, condition, detail) {
  if (condition) {
    console.log(`  PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error"]
  });
  const prisma = app.get(PrismaService);
  const payments = app.get(PaymentService);
  const pricing = app.get(BatchPricingService);
  const discounts = app.get(DiscountService);

  const stamp = Date.now();
  const created = { planIds: [], orderIds: [], discountIds: [] };

  try {
    const batch = await prisma.batch.findFirst({ where: { isDeleted: false } });
    const student = await prisma.user.findFirst({
      where: { email: "student@nexa.test" }
    });
    if (!batch || !student) {
      throw new Error("Seed the database first (npm run db:seed).");
    }

    console.log("\n1. Pricing a batch");

    const monthly = await pricing.create(batch.id, {
      name: `Monthly ${stamp}`,
      amount: 99900,
      currency: "INR",
      interval: "MONTHLY",
      taxPercent: 18,
      allowedMethods: ["UPI", "CARD"],
      features: ["Weekly classes"],
      isActive: true,
      sortOrder: 0
    });
    created.planIds.push(monthly.id);

    const oneTime = await pricing.create(batch.id, {
      name: `Lifetime ${stamp}`,
      amount: 499900,
      currency: "INR",
      interval: "ONE_TIME",
      taxPercent: 18,
      allowedMethods: [],
      features: [],
      isActive: true,
      sortOrder: 1
    });
    created.planIds.push(oneTime.id);

    check("a batch can hold monthly AND one-time options side by side",
      monthly.interval === "MONTHLY" && oneTime.interval === "ONE_TIME");
    check("per-option payment methods are stored",
      monthly.allowedMethods.join(",") === "UPI,CARD", monthly.allowedMethods.join(","));
    check("an option with no restriction accepts everything",
      oneTime.allowedMethods.length === 0);
    check("codes are generated, not invented by the admin",
      /^[a-z0-9-]+$/.test(monthly.code) && monthly.code !== oneTime.code,
      `${monthly.code} / ${oneTime.code}`);

    const listed = await pricing.get(batch.id);
    check("both options come back on the batch",
      listed.plans.filter((p) => created.planIds.includes(p.id)).length === 2);
    check("the price option IS an ordinary plan",
      (await prisma.plan.findUnique({ where: { id: monthly.id } }))?.batchId ===
        batch.id);

    console.log("\n2. Discount pricing");

    const percentOff = await discounts.create(student, {
      code: `PCT${stamp}`,
      name: "Integration percent",
      type: "PERCENTAGE",
      value: 25,
      maxDiscountAmount: 20000,
      maxPerUser: 5,
      planIds: [],
      batchIds: [],
      methods: [],
      isActive: true
    });
    created.discountIds.push(percentOff.id);

    const upiOnly = await discounts.create(student, {
      code: `UPI${stamp}`,
      name: "Integration UPI only",
      type: "FIXED",
      value: 10000,
      currency: "INR",
      maxPerUser: 5,
      planIds: [],
      batchIds: [],
      methods: ["UPI"],
      isActive: true
    });
    created.discountIds.push(upiOnly.id);

    const planForDiscount = {
      id: oneTime.id,
      batchId: batch.id,
      amount: oneTime.amount,
      currency: "INR"
    };

    const capped = await discounts.resolve({
      code: percentOff.code,
      userId: student.id,
      plan: planForDiscount
    });
    // 25% of ₹4,999 is ₹1,249.75, but the code caps at ₹200.
    check("a percentage cap is honoured",
      capped.valid && capped.amount === 20000,
      capped.valid ? String(capped.amount) : capped.reason);

    const wrongMethod = await discounts.resolve({
      code: upiOnly.code,
      userId: student.id,
      plan: planForDiscount,
      method: "CARD"
    });
    check("a UPI-only code is refused on cards",
      !wrongMethod.valid && wrongMethod.reason === "METHOD_NOT_ELIGIBLE");

    const rightMethod = await discounts.resolve({
      code: upiOnly.code,
      userId: student.id,
      plan: planForDiscount,
      method: "UPI"
    });
    check("the same code applies on UPI",
      rightMethod.valid && rightMethod.amount === 10000);

    console.log("\n3. Tax is charged on the discounted subtotal");

    const preview = await payments.previewDiscount(student, {
      planId: oneTime.id,
      code: percentOff.code,
      currency: "INR"
    });

    if (!preview.valid) {
      check("preview returns a price", false, preview.reason);
    } else {
      const expectedTax = Math.round(((499900 - 20000) * 18) / 100);
      check("tax is computed after the discount, not before",
        preview.taxAmount === expectedTax,
        `${preview.taxAmount} vs ${expectedTax}`);
      check("the total is subtotal - discount + tax",
        preview.total === 499900 - 20000 + expectedTax,
        String(preview.total));
      // Taxing the list price would overcharge by 18% of the discount.
      check("the buyer is not taxed on money they did not pay",
        preview.taxAmount < Math.round((499900 * 18) / 100));
    }

    console.log("\n4. A code is only consumed when money arrives");

    const order = await prisma.order.create({
      data: {
        orderNumber: `PRICE-${stamp}`,
        userId: student.id,
        planId: oneTime.id,
        status: "PENDING",
        subtotalAmount: 499900,
        discountAmount: 20000,
        taxAmount: Math.round(((499900 - 20000) * 18) / 100),
        amount: 499900 - 20000 + Math.round(((499900 - 20000) * 18) / 100),
        currency: "INR",
        idempotencyKey: `price-key-${stamp}`,
        discountId: percentOff.id,
        discountCode: percentOff.code
      }
    });
    created.orderIds.push(order.id);

    const beforeCapture = await prisma.discount.findUnique({
      where: { id: percentOff.id }
    });
    check("an unpaid order has not consumed the code",
      beforeCapture.redemptionCount === 0,
      String(beforeCapture.redemptionCount));

    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        userId: student.id,
        provider: "RAZORPAY",
        amount: order.amount,
        currency: "INR",
        status: "PENDING"
      }
    });

    await payments.applyProviderState(
      payment.id,
      {
        providerPaymentId: `pay_price_${stamp}`,
        providerOrderId: null,
        status: "PAID",
        method: "UPI",
        methodDetail: "upi",
        amount: order.amount,
        amountRefunded: 0,
        currency: "INR",
        failureCode: null,
        failureMessage: null,
        paidAt: new Date(),
        raw: {}
      },
      "pricing-check"
    );

    const afterCapture = await prisma.discount.findUnique({
      where: { id: percentOff.id }
    });
    check("capture consumes exactly one use",
      afterCapture.redemptionCount === 1, String(afterCapture.redemptionCount));

    const redemption = await prisma.discountRedemption.findUnique({
      where: { orderId: order.id }
    });
    check("the redemption records what was taken off",
      redemption?.amount === 20000);

    // A replayed webhook must not consume a second use.
    await payments.applyProviderState(
      payment.id,
      {
        providerPaymentId: `pay_price_${stamp}`,
        providerOrderId: null,
        status: "PAID",
        method: "UPI",
        methodDetail: "upi",
        amount: order.amount,
        amountRefunded: 0,
        currency: "INR",
        failureCode: null,
        failureMessage: null,
        paidAt: new Date(),
        raw: {}
      },
      "pricing-check"
    );

    const afterReplay = await prisma.discount.findUnique({
      where: { id: percentOff.id }
    });
    check("a replayed capture does not consume a second use",
      afterReplay.redemptionCount === 1, String(afterReplay.redemptionCount));

    console.log("\n5. The invoice shows the discount");

    const invoice = await prisma.invoice.findUnique({
      where: { orderId: order.id }
    });
    const lines = invoice?.lines ?? [];
    const discountLine = lines.find((line) => line.amount < 0);
    check("a negative discount line is on the receipt", Boolean(discountLine));
    check("the line names the code",
      discountLine?.description?.includes(percentOff.code) === true,
      discountLine?.description);
    check("the invoice total matches what was charged",
      invoice?.total === order.amount, `${invoice?.total} vs ${order.amount}`);

    console.log("\n6. Per-user limits hold");

    const secondUse = await discounts.resolve({
      code: upiOnly.code,
      userId: student.id,
      plan: planForDiscount,
      method: "UPI"
    });
    // maxPerUser is 5 and this code has never been redeemed, so it still applies.
    check("a code under its per-user limit still applies", secondUse.valid);

    // A once-per-user code, redeemed once, must stop applying for that user.
    const once = await discounts.create(student, {
      code: `ONCE${stamp}`,
      name: "Single use",
      type: "FIXED",
      value: 5000,
      currency: "INR",
      maxRedemptions: null,
      maxPerUser: 1,
      planIds: [],
      batchIds: [],
      methods: [],
      isActive: true
    });
    created.discountIds.push(once.id);
    const onceOrder = await prisma.order.create({
      data: {
        orderNumber: `PRICE-ONCE-${stamp}`,
        userId: student.id,
        planId: oneTime.id,
        status: "PAID",
        subtotalAmount: 499900,
        discountAmount: 5000,
        taxAmount: 0,
        amount: 494900,
        currency: "INR",
        idempotencyKey: `price-once-${stamp}`,
        discountId: once.id,
        discountCode: once.code
      }
    });
    created.orderIds.push(onceOrder.id);
    await prisma.discountRedemption.create({
      data: { discountId: once.id, userId: student.id, orderId: onceOrder.id, amount: 5000 }
    });
    const afterOnce = await discounts.resolve({
      code: once.code,
      userId: student.id,
      plan: planForDiscount,
      method: "UPI"
    });
    check("a code at its per-user limit no longer applies", !afterOnce.valid);

    // The API validates bodies with the shared schema before the service runs.
    const zeroLimit = createDiscountRequestSchema.safeParse({
      code: `ZERO${stamp}`,
      name: "Zero uses",
      type: "FIXED",
      value: 5000,
      currency: "INR",
      maxRedemptions: 0,
      maxPerUser: 1
    });
    check(
      "a zero total-use limit is rejected by validation",
      !zeroLimit.success && zeroLimit.error.issues.some((issue) => issue.path[0] === "maxRedemptions")
    );
  } finally {
    if (created.orderIds.length > 0) {
      await prisma.discountRedemption.deleteMany({
        where: { orderId: { in: created.orderIds } }
      });
      await prisma.entitlement.deleteMany({
        where: { orderId: { in: created.orderIds } }
      });
      await prisma.invoice.deleteMany({
        where: { orderId: { in: created.orderIds } }
      });
      await prisma.paymentAttempt.deleteMany({
        where: { orderId: { in: created.orderIds } }
      });
      await prisma.payment.deleteMany({
        where: { orderId: { in: created.orderIds } }
      });
      await prisma.order.deleteMany({ where: { id: { in: created.orderIds } } });
    }
    if (created.discountIds.length > 0) {
      await prisma.discount.deleteMany({
        where: { id: { in: created.discountIds } }
      });
    }
    if (created.planIds.length > 0) {
      await prisma.plan.deleteMany({ where: { id: { in: created.planIds } } });
    }
    await app.close();
  }

  console.log(
    failures === 0
      ? "\nAll pricing and discount checks passed."
      : `\n${failures} check(s) FAILED.`
  );
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => {
  console.error("Pricing check crashed:", error);
  process.exit(1);
});

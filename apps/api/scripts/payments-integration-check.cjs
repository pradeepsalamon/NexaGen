/**
 * Integration check for the payment capture path, against the real database.
 *
 * Boots the Nest app, drives PaymentService.applyProviderState the way a
 * webhook would, and asserts the things that actually matter: access is granted
 * exactly once, an invoice is issued, the student is enrolled, and neither a
 * duplicate nor an out-of-order event can change any of that.
 *
 * Cleans up everything it creates. Needs a built dist and a seeded database:
 *   npm run build -w apps/api && npm run db:seed
 *   npm run test:payments:integration -w apps/api
 */
const { NestFactory } = require("@nestjs/core");
const { AppModule } = require("../dist/src/app.module");
const { PrismaService } = require("../dist/src/prisma/prisma.service");
const { PaymentService } = require("../dist/src/payments/payment.service");

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

  const stamp = Date.now();
  let created = {};
  // Seeded state this check changes, put back in `finally`.
  const restore = {};

  try {
    const plan = await prisma.plan.findUnique({
      where: { code: "premium-monthly" }
    });
    if (!plan) throw new Error("Seed the database first (npm run db:seed).");

    const batch = await prisma.batch.findFirst({ where: { isDeleted: false } });
    if (!batch) throw new Error("No batch to enrol into; seed the database first (npm run db:seed).");
    restore.plan = { id: plan.id, batchId: plan.batchId };
    await prisma.plan.update({
      where: { id: plan.id },
      data: { batchId: batch.id }
    });

    const student = await prisma.user.findFirst({
      where: { email: "student@nexa.test" }
    });
    if (!student) throw new Error("Seed the database first (npm run db:seed).");

    // Start from a clean enrolment so the restore path is genuinely exercised.
    restore.enrolment = {
      batchId: batch.id,
      row: await prisma.withDeleted.batchStudent.findFirst({
        where: { batchId: batch.id, studentId: student.id }
      }),
      studentId: student.id
    };
    await prisma.batchStudent.deleteMany({
      where: { batchId: batch.id, studentId: student.id }
    });

    const order = await prisma.order.create({
      data: {
        orderNumber: `ITEST-${stamp}`,
        userId: student.id,
        planId: plan.id,
        status: "PENDING",
        subtotalAmount: plan.amount,
        taxAmount: 0,
        amount: plan.amount,
        currency: plan.currency,
        idempotencyKey: `itest-key-${stamp}`
      }
    });
    created.orderId = order.id;

    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        userId: student.id,
        provider: "RAZORPAY",
        providerOrderId: `order_itest_${stamp}`,
        amount: order.amount,
        currency: order.currency,
        status: "PENDING"
      }
    });
    created.paymentId = payment.id;

    const captured = {
      providerPaymentId: `pay_itest_${stamp}`,
      providerOrderId: `order_itest_${stamp}`,
      status: "PAID",
      method: "UPI",
      methodDetail: "upi · gpay",
      amount: order.amount,
      amountRefunded: 0,
      currency: order.currency,
      failureCode: null,
      failureMessage: null,
      paidAt: new Date(),
      raw: { source: "integration-check" }
    };

    console.log("\n1. First capture (as a webhook would deliver it)");
    const first = await payments.applyProviderState(
      payment.id,
      captured,
      "integration-check"
    );
    check("payment moves to PAID", first.changed && first.status === "PAID");

    const entitlements = await prisma.entitlement.findMany({
      where: { orderId: order.id }
    });
    check("exactly one entitlement granted", entitlements.length === 1,
      `found ${entitlements.length}`);
    check("entitlement is ACTIVE", entitlements[0]?.status === "ACTIVE");
    check("entitlement carries an end date for a monthly plan",
      entitlements[0]?.endsAt !== null);

    const invoice = await prisma.invoice.findUnique({
      where: { orderId: order.id }
    });
    created.invoiceId = invoice?.id;
    check("invoice issued", Boolean(invoice));
    check("invoice number is formatted and padded",
      /^NEXA\/\d{4}\/\d{6}$/.test(invoice?.number ?? ""), invoice?.number);
    check("invoice total matches the order", invoice?.total === order.amount);

    const enrolment = await prisma.batchStudent.findFirst({
      where: { batchId: batch.id, studentId: student.id }
    });
    check("student enrolled into the plan's batch", Boolean(enrolment));

    const refreshedOrder = await prisma.order.findUnique({
      where: { id: order.id }
    });
    check("order marked PAID", refreshedOrder?.status === "PAID");
    check("order stamped with paidAt", refreshedOrder?.paidAt !== null);

    console.log("\n2. The same webhook delivered again");
    const duplicate = await payments.applyProviderState(
      payment.id,
      captured,
      "integration-check"
    );
    check("duplicate is a no-op", duplicate.changed === false);
    check("still exactly one entitlement",
      (await prisma.entitlement.count({ where: { orderId: order.id } })) === 1);
    check("still exactly one invoice",
      (await prisma.invoice.count({ where: { orderId: order.id } })) === 1);

    console.log("\n3. A stale PENDING arriving after the capture");
    const stale = await payments.applyProviderState(
      payment.id,
      { ...captured, status: "PENDING" },
      "integration-check"
    );
    check("stale event ignored", stale.changed === false);
    check("payment is still PAID", stale.status === "PAID");

    console.log("\n4. A sibling attempt's FAILED arriving late");
    const late = await payments.applyProviderState(
      payment.id,
      { ...captured, status: "FAILED", failureCode: "BANK_DECLINED" },
      "integration-check"
    );
    check("late failure does not revoke access", late.status === "PAID");
    check("entitlement survives",
      (await prisma.entitlement.count({
        where: { orderId: order.id, status: "ACTIVE" }
      })) === 1);

    console.log("\n5. Invoice numbering is gapless under a second capture");
    const order2 = await prisma.order.create({
      data: {
        orderNumber: `ITEST-${stamp}-b`,
        userId: student.id,
        planId: plan.id,
        status: "PENDING",
        subtotalAmount: plan.amount,
        taxAmount: 0,
        amount: plan.amount,
        currency: plan.currency,
        idempotencyKey: `itest-key-${stamp}-b`
      }
    });
    created.orderId2 = order2.id;

    const payment2 = await prisma.payment.create({
      data: {
        orderId: order2.id,
        userId: student.id,
        provider: "STRIPE",
        amount: order2.amount,
        currency: order2.currency,
        status: "PENDING"
      }
    });
    created.paymentId2 = payment2.id;

    await payments.applyProviderState(
      payment2.id,
      { ...captured, providerPaymentId: `pi_itest_${stamp}` },
      "integration-check"
    );

    const invoice2 = await prisma.invoice.findUnique({
      where: { orderId: order2.id }
    });
    created.invoiceId2 = invoice2?.id;
    const n1 = Number(invoice.number.split("/")[2]);
    const n2 = Number(invoice2.number.split("/")[2]);
    check("second invoice number is the next in sequence", n2 === n1 + 1,
      `${invoice.number} then ${invoice2.number}`);

    console.log("\n6. Underpayment withholds access");
    const order3 = await prisma.order.create({
      data: {
        orderNumber: `ITEST-${stamp}-c`,
        userId: student.id,
        planId: plan.id,
        status: "PENDING",
        subtotalAmount: plan.amount,
        taxAmount: 0,
        amount: plan.amount,
        currency: plan.currency,
        idempotencyKey: `itest-key-${stamp}-c`
      }
    });
    created.orderId3 = order3.id;

    const payment3 = await prisma.payment.create({
      data: {
        orderId: order3.id,
        userId: student.id,
        provider: "CASHFREE",
        amount: order3.amount,
        currency: order3.currency,
        status: "PENDING"
      }
    });
    created.paymentId3 = payment3.id;

    const short = await payments.applyProviderState(
      payment3.id,
      { ...captured, providerPaymentId: `cf_itest_${stamp}`, amount: 100 },
      "integration-check"
    );
    check("underpayment parks at PROCESSING", short.status === "PROCESSING");
    check("no entitlement granted for an underpayment",
      (await prisma.entitlement.count({ where: { orderId: order3.id } })) === 0);

    console.log("\n7. The order idempotency key rejects a duplicate order");
    let collided = false;
    try {
      await prisma.order.create({
        data: {
          orderNumber: `ITEST-${stamp}-dup`,
          userId: student.id,
          planId: plan.id,
          status: "PENDING",
          subtotalAmount: plan.amount,
          taxAmount: 0,
          amount: plan.amount,
          currency: plan.currency,
          // The same key the first order used.
          idempotencyKey: `itest-key-${stamp}`
        }
      });
    } catch (error) {
      collided = error.code === "P2002";
    }
    check("a replayed idempotency key collides instead of opening an order",
      collided);
  } finally {
    // Tear down everything this check created, in dependency order.
    const orderIds = [created.orderId, created.orderId2, created.orderId3].filter(
      Boolean
    );
    if (orderIds.length > 0) {
      await prisma.entitlement.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.invoice.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.paymentAttempt.deleteMany({
        where: { orderId: { in: orderIds } }
      });
      await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
    }
    if (restore.enrolment) {
      const { batchId, row, studentId } = restore.enrolment;
      await prisma.withDeleted.batchStudent.deleteMany({ where: { batchId, studentId } });
      if (row) await prisma.withDeleted.batchStudent.create({ data: row });
    }
    if (restore.plan) {
      await prisma.plan.update({ where: { id: restore.plan.id }, data: { batchId: restore.plan.batchId } });
    }
    await app.close();
  }

  console.log(
    failures === 0
      ? "\nAll integration checks passed."
      : `\n${failures} integration check(s) FAILED.`
  );
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => {
  console.error("Integration check crashed:", error);
  process.exit(1);
});

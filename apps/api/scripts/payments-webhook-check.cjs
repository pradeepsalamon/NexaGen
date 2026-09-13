/**
 * Verifies that a genuinely-signed webhook from each gateway is ACCEPTED and
 * captures the payment — the other half of "unsigned payloads are rejected".
 *
 * Sets sandbox credentials in-process before the env is read, so it proves the
 * real signature code path rather than a mock. Cleans up after itself.
 *
 * Needs a built dist and a seeded database:
 *   npm run build -w apps/api && npm run db:seed
 *   npm run test:payments:webhooks -w apps/api
 */
process.env.RAZORPAY_KEY_ID = "rzp_test_integration";
process.env.RAZORPAY_KEY_SECRET = "rzp_secret_integration";
process.env.RAZORPAY_WEBHOOK_SECRET = "rzp_webhook_secret";
process.env.CASHFREE_APP_ID = "cf_test_integration";
process.env.CASHFREE_SECRET_KEY = "cf_secret_integration";
process.env.CASHFREE_WEBHOOK_SECRET = "cf_webhook_secret";
process.env.STRIPE_SECRET_KEY = "sk_test_integration";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_integration";

const { createHmac } = require("node:crypto");
const { NestFactory } = require("@nestjs/core");
const { AppModule } = require("../dist/src/app.module");
const { PrismaService } = require("../dist/src/prisma/prisma.service");
const {
  PaymentWebhookService
} = require("../dist/src/payments/payment-webhook.service");

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
  const webhooks = app.get(PaymentWebhookService);

  const stamp = Date.now();
  const orderIds = [];

  const makePayment = async (provider, providerOrderId) => {
    const plan = await prisma.plan.findUnique({
      where: { code: "starter-monthly" }
    });
    const student = await prisma.user.findFirst({
      where: { email: "student@nexa.test" }
    });

    const order = await prisma.order.create({
      data: {
        orderNumber: `WHCHK-${stamp}-${provider}`,
        userId: student.id,
        planId: plan.id,
        status: "PENDING",
        subtotalAmount: plan.amount,
        taxAmount: 0,
        amount: plan.amount,
        currency: "INR",
        idempotencyKey: `whchk-${stamp}-${provider}`
      }
    });
    orderIds.push(order.id);

    return prisma.payment.create({
      data: {
        orderId: order.id,
        userId: student.id,
        provider,
        providerOrderId,
        amount: order.amount,
        currency: order.currency,
        status: "PENDING"
      }
    });
  };

  try {
    // ── Razorpay: HMAC-SHA256 hex of the raw body ──
    console.log("\nRazorpay");
    const rzpPayment = await makePayment("RAZORPAY", `order_wh_${stamp}`);
    const rzpBody = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_wh_${stamp}`,
            order_id: `order_wh_${stamp}`,
            status: "captured",
            method: "upi",
            vpa: "student@okhdfcbank",
            amount: rzpPayment.amount,
            currency: "INR",
            created_at: Math.floor(Date.now() / 1000),
            notes: { nexaPaymentId: rzpPayment.id }
          }
        }
      }
    });
    const rzpSignature = createHmac("sha256", "rzp_webhook_secret")
      .update(rzpBody)
      .digest("hex");

    const rzpResult = await webhooks.handle("RAZORPAY", rzpBody, {
      "x-razorpay-signature": rzpSignature,
      "x-razorpay-event-id": `evt_wh_${stamp}`
    });
    check("signed webhook is PROCESSED", rzpResult.status === "PROCESSED",
      rzpResult.status);

    const rzpAfter = await prisma.payment.findUnique({
      where: { id: rzpPayment.id }
    });
    check("payment captured to PAID", rzpAfter.status === "PAID", rzpAfter.status);
    check("method recorded from the payload", rzpAfter.paymentMethod === "UPI");
    check("gateway payment id stored",
      rzpAfter.providerPaymentId === `pay_wh_${stamp}`);
    check("access granted",
      (await prisma.entitlement.count({
        where: { orderId: rzpPayment.orderId, status: "ACTIVE" }
      })) === 1);

    const replay = await webhooks.handle("RAZORPAY", rzpBody, {
      "x-razorpay-signature": rzpSignature,
      "x-razorpay-event-id": `evt_wh_${stamp}`
    });
    check("redelivery is deduped by (provider, eventId)",
      replay.status === "PROCESSED");
    check("no second entitlement from the redelivery",
      (await prisma.entitlement.count({
        where: { orderId: rzpPayment.orderId }
      })) === 1);

    let rejected = false;
    try {
      await webhooks.handle("RAZORPAY", rzpBody, {
        "x-razorpay-signature": "0".repeat(64),
        "x-razorpay-event-id": `evt_forged_${stamp}`
      });
    } catch (error) {
      rejected = error.status === 400;
    }
    check("a forged signature is rejected", rejected);

    // ── Cashfree: HMAC-SHA256 base64 of timestamp + raw body ──
    console.log("\nCashfree");
    const cfPayment = await makePayment("CASHFREE", `cf_order_${stamp}`);
    const cfTimestamp = String(Math.floor(Date.now() / 1000));
    const cfBody = JSON.stringify({
      type: "PAYMENT_SUCCESS_WEBHOOK",
      event_id: `cf_evt_${stamp}`,
      data: {
        order: { order_id: cfPayment.id, order_currency: "INR" },
        payment: {
          cf_payment_id: `cf_pay_${stamp}`,
          payment_status: "SUCCESS",
          payment_amount: cfPayment.amount / 100,
          payment_currency: "INR",
          payment_group: "upi",
          payment_time: new Date().toISOString(),
          payment_method: { upi: { upi_id: "student@okaxis" } }
        }
      }
    });
    const cfSignature = createHmac("sha256", "cf_webhook_secret")
      .update(`${cfTimestamp}${cfBody}`)
      .digest("base64");

    const cfResult = await webhooks.handle("CASHFREE", cfBody, {
      "x-webhook-signature": cfSignature,
      "x-webhook-timestamp": cfTimestamp
    });
    check("signed webhook is PROCESSED", cfResult.status === "PROCESSED",
      cfResult.status);

    const cfAfter = await prisma.payment.findUnique({
      where: { id: cfPayment.id }
    });
    check("payment captured to PAID", cfAfter.status === "PAID", cfAfter.status);
    check("major-unit amount converted back to minor units",
      cfAfter.amount === cfPayment.amount);

    let cfRejected = false;
    try {
      await webhooks.handle("CASHFREE", cfBody, {
        "x-webhook-signature": cfSignature,
        // Same signature, different timestamp — the timestamp is signed, so
        // this is exactly the replay the scheme exists to stop.
        "x-webhook-timestamp": String(Number(cfTimestamp) + 60)
      });
    } catch (error) {
      cfRejected = error.status === 400;
    }
    check("a replayed timestamp is rejected", cfRejected);

    // ── Stripe: t=<ts>,v1=<hmac over `${ts}.${body}`> ──
    console.log("\nStripe");
    const stripePayment = await makePayment("STRIPE", `cs_test_${stamp}`);
    const stripeBody = JSON.stringify({
      id: `evt_stripe_${stamp}`,
      type: "checkout.session.completed",
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: `cs_test_${stamp}`,
          object: "checkout.session",
          status: "complete",
          payment_status: "paid",
          payment_intent: `pi_test_${stamp}`,
          amount_total: stripePayment.amount,
          currency: "inr",
          client_reference_id: stripePayment.id,
          metadata: { nexaPaymentId: stripePayment.id },
          payment_method_types: ["card"]
        }
      }
    });
    const stripeTs = Math.floor(Date.now() / 1000);
    const stripeSignature = `t=${stripeTs},v1=${createHmac(
      "sha256",
      "whsec_integration"
    )
      .update(`${stripeTs}.${stripeBody}`)
      .digest("hex")}`;

    const stripeResult = await webhooks.handle("STRIPE", stripeBody, {
      "stripe-signature": stripeSignature
    });
    check("signed webhook is PROCESSED", stripeResult.status === "PROCESSED",
      stripeResult.status);

    const stripeAfter = await prisma.payment.findUnique({
      where: { id: stripePayment.id }
    });
    check("payment captured to PAID", stripeAfter.status === "PAID",
      stripeAfter.status);
    check("PaymentIntent id stored",
      stripeAfter.providerPaymentId === `pi_test_${stamp}`);

    let stripeRejected = false;
    try {
      // A signature that was valid hours ago must not be accepted now.
      const oldTs = stripeTs - 7200;
      await webhooks.handle("STRIPE", stripeBody, {
        "stripe-signature": `t=${oldTs},v1=${createHmac(
          "sha256",
          "whsec_integration"
        )
          .update(`${oldTs}.${stripeBody}`)
          .digest("hex")}`
      });
    } catch (error) {
      stripeRejected = error.status === 400;
    }
    check("an expired signature is rejected", stripeRejected);
  } finally {
    if (orderIds.length > 0) {
      const payments = await prisma.payment.findMany({
        where: { orderId: { in: orderIds } },
        select: { id: true }
      });
      const paymentIds = payments.map((payment) => payment.id);

      await prisma.paymentWebhookEvent.deleteMany({
        where: { paymentId: { in: paymentIds } }
      });
      await prisma.entitlement.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.invoice.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.paymentAttempt.deleteMany({
        where: { orderId: { in: orderIds } }
      });
      await prisma.payment.deleteMany({ where: { orderId: { in: orderIds } } });
      await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
      await prisma.paymentWebhookEvent.deleteMany({
        where: { eventId: { contains: String(stamp) } }
      });
    }
    await app.close();
  }

  console.log(
    failures === 0
      ? "\nAll webhook checks passed."
      : `\n${failures} webhook check(s) FAILED.`
  );
  process.exit(failures === 0 ? 0 : 1);
})().catch((error) => {
  console.error("Webhook check crashed:", error);
  process.exit(1);
});

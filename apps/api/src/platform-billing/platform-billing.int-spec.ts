import { createHmac } from "node:crypto";
import {
  API_ROUTES,
  computeTax,
  type AcademyBillingResponse,
  type PlatformCheckoutView,
  type PlatformTenantResponse,
  type TenantGatewaysResponse
} from "@nexa-chess/types";
import { UserRole, UserStatus } from "@prisma/client";
import { hashSecret } from "../auth/auth.utils";
import { createTestApp, type TestApp } from "../test/integration/app";
import { TEST_PLATFORM_RAZORPAY_WEBHOOK_SECRET } from "../test/integration/app-env";
import { createUser, resetDatabase } from "../test/integration/db";
import { asPlatform } from "../tenancy/tenant-context";
import { PlatformRazorpayClient } from "./platform-razorpay.client";

// SaaS Phase 6 (docs/SAAS_MULTI_TENANCY.md §G "Two money flows").
describe("platform billing and per-academy gateways (real app, real Postgres)", () => {
  let t: TestApp;
  let operator: Awaited<ReturnType<typeof createUser>>;
  let knightOwner: Awaited<ReturnType<typeof createUser>>;
  let bishopOwner: Awaited<ReturnType<typeof createUser>>;
  let knightId: string;
  let orderSeq = 0;
  const KNIGHT = "https://knight.nexachess.in";
  const BISHOP = "https://bishop.nexachess.in";
  const base = () => t.baseUrl.replace("[::1]", "127.0.0.1");
  const op = (method: string, path: string, body?: unknown) => t.call(operator, method, path, body);
  const asKnight = (method: string, path: string, body?: unknown) => t.call(knightOwner, method, path, body, { origin: KNIGHT });
  const asBishop = (method: string, path: string, body?: unknown) => t.call(bishopOwner, method, path, body, { origin: BISHOP });
  const orderPayments = jest.fn();

  const postRaw = (path: string, body: string, headers: Record<string, string>) =>
    fetch(`${base()}${path}`, { body, headers: { "Content-Type": "application/json", ...headers }, method: "POST" });
  const capturedEvent = (orderId: string, amount: number, paymentId: string) =>
    JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { amount, currency: "INR", id: paymentId, order_id: orderId, status: "captured" } } }
    });
  const sign = (secret: string, body: string) => createHmac("sha256", secret).update(body).digest("hex");

  async function academy(slug: string, name: string) {
    const created = await op("POST", API_ROUTES.platform.tenants, {
      idempotencyKey: `billing-${slug}-0001`,
      name,
      planCode: "GROWTH",
      slug,
      superAdmin: { email: `owner@${slug}.int.test`, firstName: "Owner" }
    });
    const tenantId = (created.body as PlatformTenantResponse).tenant.id;
    const owner = await asPlatform("spec", async () =>
      t.prisma.user.update({
        data: { password: await hashSecret("Billing@12345"), status: UserStatus.ACTIVE },
        where: { id: (await t.prisma.user.findFirstOrThrow({ where: { email: `owner@${slug}.int.test` } })).id }
      })
    );
    return { owner, tenantId };
  }

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    operator = await t.prisma.user.update({
      data: { status: UserStatus.ACTIVE },
      where: { id: (await createUser(t.prisma, UserRole.SUPER_ADMIN)).id }
    });
    ({ owner: knightOwner, tenantId: knightId } = await academy("knight", "Knight Academy"));
    ({ owner: bishopOwner } = await academy("bishop", "Bishop Academy"));

    // The owner's Razorpay account: the order calls are mocked, the webhook
    // signature check is real (test secret in app-env).
    const gateway = t.app.get(PlatformRazorpayClient);
    jest.spyOn(gateway, "createOrder").mockImplementation(async () => ({ id: `order_${++orderSeq}` }));
    jest.spyOn(gateway, "orderPayments").mockImplementation(orderPayments);
  });

  afterAll(async () => {
    await t?.close();
  });

  it("the owner's seller details decide the GST; an invalid GSTIN is refused", async () => {
    expect((await op("PUT", API_ROUTES.platform.sellerDetails, { gstin: "29NOTAGSTIN" })).status).toBe(400);
    const saved = await op("PUT", API_ROUTES.platform.sellerDetails, { gstin: "29ABCDE1234F1Z5", legalName: "Nexa Chess Pvt Ltd" });
    expect(saved.status).toBe(200);
    expect((await asKnight("GET", API_ROUTES.platform.sellerDetails)).status).toBe(403);
  });

  let monthly: PlatformCheckoutView;

  it("the academy's super admin starts a checkout priced from its plan plus GST; a second click reuses it", async () => {
    const res = await asKnight("POST", API_ROUTES.subscription.checkout, { period: "MONTHLY" });
    expect(res.status).toBe(201);
    monthly = res.body as PlatformCheckoutView;
    const tax = computeTax(699900, {
      buyerCountry: "IN",
      buyerHasGstin: false,
      buyerStateCode: null,
      ratePercent: 18,
      sellerCountry: "IN",
      sellerStateCode: "29"
    });
    expect(monthly).toMatchObject({ amountMinor: 699900 + tax.taxTotal, planCode: "GROWTH", status: "CREATED", subtotalMinor: 699900 });
    expect(monthly.gateway?.orderId).toBe("order_1");
    const again = await asKnight("POST", API_ROUTES.subscription.checkout, { period: "MONTHLY" });
    expect((again.body as PlatformCheckoutView).id).toBe(monthly.id);
  });

  it("a forged browser callback grants nothing: only the order read decides", async () => {
    orderPayments.mockResolvedValueOnce([]);
    const res = await asKnight("POST", API_ROUTES.subscription.checkoutConfirm(monthly.id), {
      razorpayOrderId: "order_1",
      razorpayPaymentId: "pay_forged",
      razorpaySignature: "deadbeef"
    });
    expect((res.body as PlatformCheckoutView).status).toBe("CREATED");
    const sub = await asPlatform("spec", () => t.prisma.tenantSubscription.findUniqueOrThrow({ where: { tenantId: knightId } }));
    expect(sub.status).toBe("TRIALING");
  });

  it("an unsigned webhook is refused and never stored", async () => {
    const body = capturedEvent("order_1", monthly.amountMinor, "pay_1");
    const res = await postRaw(API_ROUTES.platformBilling.webhookRazorpay, body, { "x-razorpay-signature": sign("wrong-secret", body) });
    expect(res.status).toBe(400);
    expect(await asPlatform("spec", () => t.prisma.platformWebhookEvent.count())).toBe(0);
  });

  it("a signed webhook settles the checkout once: payment, ACTIVE period, GST invoice; a redelivery is a no-op", async () => {
    const body = capturedEvent("order_1", monthly.amountMinor, "pay_1");
    const headers = { "x-razorpay-event-id": "evt_1", "x-razorpay-signature": sign(TEST_PLATFORM_RAZORPAY_WEBHOOK_SECRET, body) };
    const first = await postRaw(API_ROUTES.platformBilling.webhookRazorpay, body, headers);
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ status: "PROCESSED" });
    const replay = await postRaw(API_ROUTES.platformBilling.webhookRazorpay, body, headers);
    expect(await replay.json()).toMatchObject({ status: "DUPLICATE" });
    // The same payment under another event id (order.paid after payment.captured) changes nothing either.
    const other = await postRaw(API_ROUTES.platformBilling.webhookRazorpay, body, { ...headers, "x-razorpay-event-id": "evt_2" });
    expect(other.status).toBe(200);

    const [sub, payments, invoices] = await asPlatform("spec", () =>
      Promise.all([
        t.prisma.tenantSubscription.findUniqueOrThrow({ where: { tenantId: knightId } }),
        t.prisma.platformPayment.findMany({ where: { tenantId: knightId } }),
        t.prisma.platformInvoice.findMany({ where: { tenantId: knightId } })
      ])
    );
    expect(sub.status).toBe("ACTIVE");
    expect(sub.currentPeriodEnd!.getTime()).toBeGreaterThan(Date.now() + 27 * 24 * 3600_000);
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ amountMinor: monthly.amountMinor, gatewayPaymentId: "pay_1", method: "RAZORPAY" });
    expect(invoices).toHaveLength(1);
    expect(invoices[0].number).toMatch(/^NXP\/\d{2}-\d{2}\/00001$/);

    const billing = (await asKnight("GET", API_ROUTES.subscription.billing)).body as AcademyBillingResponse;
    expect(billing.invoices[0]).toMatchObject({ cgstMinor: expect.any(Number), totalMinor: monthly.amountMinor });
    expect(billing.invoices[0].cgstMinor).toBeGreaterThan(0);
  });

  it("a payment for less than the order is not applied", async () => {
    const yearly = (await asKnight("POST", API_ROUTES.subscription.checkout, { period: "YEARLY" })).body as PlatformCheckoutView;
    const body = capturedEvent(yearly.gateway!.orderId, 100, "pay_short");
    const res = await postRaw(API_ROUTES.platformBilling.webhookRazorpay, body, {
      "x-razorpay-event-id": "evt_short",
      "x-razorpay-signature": sign(TEST_PLATFORM_RAZORPAY_WEBHOOK_SECRET, body)
    });
    expect(await res.json()).toMatchObject({ status: "IGNORED" });
    expect(((await asKnight("GET", API_ROUTES.subscription.checkoutGet(yearly.id))).body as PlatformCheckoutView).status).toBe("CREATED");
  });

  it("another academy can't see this academy's checkout or invoice", async () => {
    const invoice = await asPlatform("spec", () => t.prisma.platformInvoice.findFirstOrThrow({ where: { tenantId: knightId } }));
    expect((await asBishop("GET", API_ROUTES.subscription.checkoutGet(monthly.id))).status).toBe(404);
    expect((await asBishop("POST", API_ROUTES.subscription.checkoutConfirm(monthly.id), {})).status).toBe(404);
    expect((await asBishop("GET", API_ROUTES.subscription.invoice(invoice.id))).status).toBe(404);
    expect((await asKnight("GET", API_ROUTES.subscription.invoice(invoice.id))).status).toBe(200);
  });

  it("the owner sends a pay link from the console; academies can't", async () => {
    const link = await op("POST", API_ROUTES.platform.tenantPayLink(knightId), { note: "Q3 renewal", period: "MONTHLY", subtotalMinor: 500000 });
    expect(link.status).toBe(201);
    expect(link.body).toMatchObject({ createdByPlatform: true, payPath: expect.stringContaining("/admin/subscription?checkout=") });
    expect((await asKnight("POST", API_ROUTES.platform.tenantPayLink(knightId), { period: "MONTHLY" })).status).toBe(403);
    const billing = (await asKnight("GET", API_ROUTES.subscription.billing)).body as AcademyBillingResponse;
    expect(billing.openCheckouts.some((checkout) => checkout.note === "Q3 renewal" && checkout.subtotalMinor === 500000)).toBe(true);
  });

  describe("student gateways per academy", () => {
    it("Nexa keeps the server's keys; an academy stores its own, and secrets never come back", async () => {
      expect((await op("PUT", API_ROUTES.adminPayments.gateway("razorpay"), { enabled: true, keySecret: "x".repeat(20), publicKey: "rzp_test_nexa" })).status).toBe(400);
      expect((await asKnight("PUT", API_ROUTES.adminPayments.gateway("razorpay"), { enabled: true, publicKey: "rzp_test_knight" })).status).toBe(400);
      expect(
        (await asKnight("PUT", API_ROUTES.adminPayments.gateway("razorpay"), { enabled: true, keySecret: "knight-key-secret", publicKey: "rzp_test_knight" }))
          .status
      ).toBe(400);
      const saved = await asKnight("PUT", API_ROUTES.adminPayments.gateway("razorpay"), {
        enabled: true,
        keySecret: "knight-key-secret",
        publicKey: "rzp_test_knight",
        webhookSecret: "knight-webhook-secret"
      });
      expect(saved.status).toBe(200);
      expect(JSON.stringify(saved.body)).not.toContain("knight-key-secret");
      expect(JSON.stringify(saved.body)).not.toContain("knight-webhook-secret");
      const razorpay = (saved.body as TenantGatewaysResponse).gateways.find((gateway) => gateway.provider === "RAZORPAY");
      expect(razorpay).toMatchObject({ configured: true, hasKeySecret: true, hasWebhookSecret: true, publicKey: "rzp_test_knight" });
      expect(razorpay?.webhookPath).toMatch(/^\/payments\/webhooks\/razorpay\/[A-Za-z0-9_-]{20,}$/);
    });

    it("a webhook on the academy's URL is verified with its secret and lands in its rows only", async () => {
      const listed = await asKnight("GET", API_ROUTES.adminPayments.gateways);
      expect(listed.body).toMatchObject({ usesPlatformAccount: false });
      const view = listed.body as TenantGatewaysResponse;
      const path = view.gateways.find((gateway) => gateway.provider === "RAZORPAY")!.webhookPath!;
      const body = capturedEvent("order_student_1", 1000, "pay_student_1");
      expect((await postRaw(path, body, { "x-razorpay-signature": sign("not-the-academy-secret", body) })).status).toBe(400);
      expect((await postRaw("/payments/webhooks/razorpay/unknownkeyunknownkey", body, { "x-razorpay-signature": sign("knight-webhook-secret", body) })).status).toBe(404);
      const ok = await postRaw(path, body, { "x-razorpay-event-id": "evt_student_1", "x-razorpay-signature": sign("knight-webhook-secret", body) });
      expect(ok.status).toBe(200);
      const rows = await asPlatform("spec", () => t.prisma.paymentWebhookEvent.findMany({ select: { tenantId: true } }));
      expect(rows.map((row) => row.tenantId)).toEqual([knightId]);
    });
  });
});

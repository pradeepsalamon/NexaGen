import { createHmac } from "node:crypto";
import type { ProviderHealthService } from "../provider-health.service";
import { CashfreeProvider } from "./cashfree.provider";
import { hmacBase64, hmacHex, safeCompare } from "./provider-http";
import { RazorpayProvider } from "./razorpay.provider";
import { verifyStripeSignature } from "./stripe.provider";

/**
 * Signature verification is the only thing standing between a webhook endpoint
 * and anyone who knows its URL. These tests are deliberately adversarial.
 */

describe("safeCompare", () => {
  it("matches identical strings", () => {
    expect(safeCompare("abc123", "abc123")).toBe(true);
  });

  it("rejects a mismatch", () => {
    expect(safeCompare("abc123", "abc124")).toBe(false);
  });

  it("rejects a different length without throwing", () => {
    // timingSafeEqual throws on unequal lengths; the guard must catch that.
    expect(safeCompare("abc", "abcdef")).toBe(false);
    expect(safeCompare("", "a")).toBe(false);
  });
});

const env: Record<string, string | undefined> = {};
jest.mock("@nexa-chess/config/api", () => ({
  ...jest.requireActual("@nexa-chess/config/api"),
  getApiEnv: () => env
}));

const health = { record: jest.fn() } as unknown as ProviderHealthService;

describe("RazorpayProvider.handleWebhook", () => {
  const secret = "razorpay-webhook-secret";
  const body = JSON.stringify({ event: "payment.captured", payload: {} });
  const verify = (rawBody: string, headers: Record<string, string>) =>
    new RazorpayProvider(health).handleWebhook({ rawBody, headers }).then((r) => r.signatureValid);

  beforeEach(() => {
    env.RAZORPAY_WEBHOOK_SECRET = secret;
  });

  it("accepts a correctly signed body", async () => {
    await expect(verify(body, { "x-razorpay-signature": hmacHex(secret, body) })).resolves.toBe(true);
  });

  it("rejects a body altered after signing", async () => {
    const signature = hmacHex(secret, body);
    await expect(
      verify(body.replace("captured", "failed"), { "x-razorpay-signature": signature })
    ).resolves.toBe(false);
  });

  it("rejects a signature made with a different secret", async () => {
    await expect(
      verify(body, { "x-razorpay-signature": hmacHex("wrong-secret", body) })
    ).resolves.toBe(false);
  });

  it("rejects a missing signature header", async () => {
    await expect(verify(body, {})).resolves.toBe(false);
  });

  it("fails closed when the secret is unset", async () => {
    env.RAZORPAY_WEBHOOK_SECRET = undefined;
    await expect(verify(body, { "x-razorpay-signature": hmacHex(secret, body) })).resolves.toBe(false);
  });
});

describe("RazorpayProvider.verifyPayment handshake", () => {
  const keySecret = "razorpay-key-secret";

  beforeEach(() => {
    env.RAZORPAY_KEY_SECRET = keySecret;
  });

  const verify = (providerPaymentId: string, signature: string) => {
    const provider = new RazorpayProvider(health);
    jest.spyOn(provider, "getPayment").mockResolvedValue(null as never);
    return provider
      .verifyPayment({ providerOrderId: "order_ABC", providerPaymentId, signature } as never)
      .then((r) => r.verified);
  };

  it("accepts the signed order|payment pair", async () => {
    await expect(verify("pay_XYZ", hmacHex(keySecret, "order_ABC|pay_XYZ"))).resolves.toBe(true);
  });

  it("rejects someone else's payment id under the same signature", async () => {
    await expect(verify("pay_OTHER", hmacHex(keySecret, "order_ABC|pay_XYZ"))).resolves.toBe(false);
  });
});

describe("CashfreeProvider.handleWebhook", () => {
  const secret = "cashfree-webhook-secret";
  const timestamp = "1757800000";
  const body = JSON.stringify({ type: "PAYMENT_SUCCESS_WEBHOOK", data: {} });
  const signed = (ts = timestamp, payload = body, key = secret) => ({
    "x-webhook-signature": hmacBase64(key, `${ts}${payload}`),
    "x-webhook-timestamp": ts
  });
  const verify = (rawBody: string, headers: Record<string, string>) =>
    new CashfreeProvider(health).handleWebhook({ rawBody, headers }).then((r) => r.signatureValid);

  beforeEach(() => {
    env.CASHFREE_WEBHOOK_SECRET = secret;
  });

  it("accepts timestamp + body signed in base64", async () => {
    await expect(verify(body, signed())).resolves.toBe(true);
  });

  it("rejects a replay under a different timestamp", async () => {
    // The timestamp is inside the signed payload, so it cannot be swapped.
    const headers = { ...signed(), "x-webhook-timestamp": "1757900000" };
    await expect(verify(body, headers)).resolves.toBe(false);
  });

  it("rejects a tampered body", async () => {
    await expect(verify(body.replace("SUCCESS", "FAILED"), signed())).resolves.toBe(false);
  });

  it("rejects a signature made with a different secret", async () => {
    await expect(verify(body, signed(timestamp, body, "wrong-secret"))).resolves.toBe(false);
  });

  it("rejects missing headers", async () => {
    await expect(verify(body, { "x-webhook-signature": signed()["x-webhook-signature"] })).resolves.toBe(false);
    await expect(verify(body, {})).resolves.toBe(false);
  });

  it("fails closed when the secret is unset", async () => {
    env.CASHFREE_WEBHOOK_SECRET = undefined;
    await expect(verify(body, signed())).resolves.toBe(false);
  });
});

describe("verifyStripeSignature", () => {
  const secret = "whsec_test";
  const body = JSON.stringify({ id: "evt_1", type: "checkout.session.completed" });
  const now = 1_757_800_000;

  const sign = (timestamp: number, payload = body, key = secret) =>
    `t=${timestamp},v1=${createHmac("sha256", key)
      .update(`${timestamp}.${payload}`)
      .digest("hex")}`;

  it("accepts a fresh, correctly signed event", () => {
    expect(verifyStripeSignature(body, sign(now), secret, now)).toBe(true);
  });

  it("accepts a signature within the tolerance window", () => {
    expect(verifyStripeSignature(body, sign(now - 200), secret, now)).toBe(true);
  });

  it("rejects a replay outside the tolerance window", () => {
    // A captured webhook replayed hours later must not be accepted.
    expect(verifyStripeSignature(body, sign(now - 4000), secret, now)).toBe(false);
  });

  it("rejects a signature from a future timestamp beyond tolerance", () => {
    expect(verifyStripeSignature(body, sign(now + 4000), secret, now)).toBe(false);
  });

  it("rejects a tampered body", () => {
    const header = sign(now);
    const tampered = body.replace("completed", "expired");
    expect(verifyStripeSignature(tampered, header, secret, now)).toBe(false);
  });

  it("rejects a signature made with another secret", () => {
    expect(
      verifyStripeSignature(body, sign(now, body, "whsec_other"), secret, now)
    ).toBe(false);
  });

  it("rejects when the secret is unset", () => {
    // An unconfigured webhook secret must fail closed, never open.
    expect(verifyStripeSignature(body, sign(now), null, now)).toBe(false);
  });

  it("rejects a missing or malformed header", () => {
    expect(verifyStripeSignature(body, null, secret, now)).toBe(false);
    expect(verifyStripeSignature(body, "garbage", secret, now)).toBe(false);
    expect(verifyStripeSignature(body, `t=${now}`, secret, now)).toBe(false);
    expect(verifyStripeSignature(body, "v1=abc", secret, now)).toBe(false);
  });

  it("accepts when any of several v1 signatures matches", () => {
    // Stripe sends more than one v1 during a secret rotation.
    const valid = sign(now);
    const header = `${valid},v1=${"0".repeat(64)}`;
    expect(verifyStripeSignature(body, header, secret, now)).toBe(true);
  });
});

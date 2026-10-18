import { createHmac } from "node:crypto";
import { hmacBase64, hmacHex, safeCompare } from "./provider-http";
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

describe("Razorpay signature scheme", () => {
  const secret = "razorpay-webhook-secret";
  const body = JSON.stringify({ event: "payment.captured", payload: {} });

  it("accepts a correctly signed body", () => {
    expect(safeCompare(hmacHex(secret, body), hmacHex(secret, body))).toBe(true);
  });

  it("rejects a body altered after signing", () => {
    const signature = hmacHex(secret, body);
    const tampered = body.replace("captured", "failed");
    expect(safeCompare(hmacHex(secret, tampered), signature)).toBe(false);
  });

  it("rejects a signature made with a different secret", () => {
    const forged = hmacHex("wrong-secret", body);
    expect(safeCompare(hmacHex(secret, body), forged)).toBe(false);
  });

  it("verifies the checkout handshake over order|payment", () => {
    // What the browser hands back after Razorpay Checkout closes.
    const orderId = "order_ABC";
    const paymentId = "pay_XYZ";
    const expected = hmacHex(secret, `${orderId}|${paymentId}`);

    expect(safeCompare(hmacHex(secret, `${orderId}|${paymentId}`), expected)).toBe(
      true
    );
    // A client swapping in someone else's payment id cannot re-sign it.
    expect(safeCompare(hmacHex(secret, `${orderId}|pay_OTHER`), expected)).toBe(
      false
    );
  });
});

describe("Cashfree signature scheme", () => {
  const secret = "cashfree-webhook-secret";
  const timestamp = "1757800000";
  const body = JSON.stringify({ type: "PAYMENT_SUCCESS_WEBHOOK", data: {} });

  it("signs timestamp + body, base64", () => {
    const expected = hmacBase64(secret, `${timestamp}${body}`);
    expect(safeCompare(hmacBase64(secret, `${timestamp}${body}`), expected)).toBe(
      true
    );
  });

  it("rejects a replay under a different timestamp", () => {
    // The timestamp is inside the signed payload, so it cannot be swapped.
    const signature = hmacBase64(secret, `${timestamp}${body}`);
    expect(safeCompare(hmacBase64(secret, `1757900000${body}`), signature)).toBe(
      false
    );
  });

  it("rejects a tampered body", () => {
    const signature = hmacBase64(secret, `${timestamp}${body}`);
    const tampered = body.replace("SUCCESS", "FAILED");
    expect(safeCompare(hmacBase64(secret, `${timestamp}${tampered}`), signature)).toBe(
      false
    );
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

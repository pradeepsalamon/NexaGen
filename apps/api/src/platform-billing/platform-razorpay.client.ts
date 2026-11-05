import { Injectable } from "@nestjs/common";
import { getApiEnv } from "@nexa-chess/config/api";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const API_BASE = "https://api.razorpay.com/v1";

export type PlatformGatewayPayment = {
  id: string;
  orderId: string | null;
  /** Razorpay's status: created | authorized | captured | refunded | failed. */
  status: string;
  amountMinor: number;
  currency: string;
};

export class PlatformGatewayError extends Error {}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * The owner's own Razorpay account, for academies paying their plan
 * (docs/SAAS_MULTI_TENANCY.md §G "Two money flows" 1; Phase 6). Deliberately
 * separate from `payments/providers/` (the academies' student gateways): it
 * never touches `PaymentService`, student entitlements or student invoices,
 * and it reads its own `PLATFORM_RAZORPAY_*` keys. Tests replace its methods.
 */
@Injectable()
export class PlatformRazorpayClient {
  private readonly env = getApiEnv();

  isConfigured(): boolean {
    return Boolean(this.env.PLATFORM_RAZORPAY_KEY_ID && this.env.PLATFORM_RAZORPAY_KEY_SECRET);
  }

  keyId(): string | null {
    return this.env.PLATFORM_RAZORPAY_KEY_ID ?? null;
  }

  async createOrder(input: { amountMinor: number; currency: string; receipt: string; notes: Record<string, string> }): Promise<{ id: string }> {
    const body = await this.call("POST", "/orders", {
      amount: input.amountMinor,
      currency: input.currency,
      notes: input.notes,
      receipt: input.receipt.slice(0, 40)
    });
    const id = typeof body.id === "string" ? body.id : null;
    if (!id) throw new PlatformGatewayError("Razorpay returned no order id.");
    return { id };
  }

  /** Every payment made against an order (the reconcile read). */
  async orderPayments(orderId: string): Promise<PlatformGatewayPayment[]> {
    const body = await this.call("GET", `/orders/${encodeURIComponent(orderId)}/payments`);
    const items = Array.isArray(body.items) ? (body.items as Record<string, unknown>[]) : [];
    return items.map(toPayment).filter((payment): payment is PlatformGatewayPayment => payment !== null);
  }

  /** Razorpay signs the exact webhook body with the webhook secret (HMAC-SHA256, hex). */
  verifyWebhook(rawBody: string, signature: string | undefined): boolean {
    const secret = this.env.PLATFORM_RAZORPAY_WEBHOOK_SECRET;
    if (!secret || !signature) return false;
    return safeEqual(createHmac("sha256", secret).update(rawBody).digest("hex"), signature);
  }

  /** Checkout's handshake: HMAC(order_id|payment_id) with the key secret. A hint only; the order read decides. */
  verifyCheckoutSignature(orderId: string, paymentId: string, signature: string): boolean {
    const secret = this.env.PLATFORM_RAZORPAY_KEY_SECRET;
    if (!secret) return false;
    return safeEqual(createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex"), signature);
  }

  static hashPayload(raw: string): string {
    return createHash("sha256").update(raw).digest("hex");
  }

  private async call(method: "GET" | "POST", path: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.isConfigured()) throw new PlatformGatewayError("The platform's Razorpay account is not configured.");
    const auth = Buffer.from(`${this.env.PLATFORM_RAZORPAY_KEY_ID}:${this.env.PLATFORM_RAZORPAY_KEY_SECRET}`).toString("base64");
    const response = await fetch(`${API_BASE}${path}`, {
      body: body ? JSON.stringify(body) : undefined,
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
      method,
      signal: AbortSignal.timeout(this.env.PAYMENTS_HTTP_TIMEOUT_MS)
    });
    const parsed = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      const error = parsed.error as { description?: unknown } | undefined;
      throw new PlatformGatewayError(
        typeof error?.description === "string" ? error.description : `Razorpay answered ${response.status}.`
      );
    }
    return parsed;
  }
}

function toPayment(item: Record<string, unknown>): PlatformGatewayPayment | null {
  if (typeof item.id !== "string" || typeof item.amount !== "number") return null;
  return {
    amountMinor: item.amount,
    currency: typeof item.currency === "string" ? item.currency : "INR",
    id: item.id,
    orderId: typeof item.order_id === "string" ? item.order_id : null,
    status: typeof item.status === "string" ? item.status : "unknown"
  };
}

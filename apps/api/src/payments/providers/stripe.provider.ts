import { createHash, createHmac } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { getApiEnv } from "@nexa-chess/config/api";
import type {
  PaymentMethodKind,
  PaymentStatus,
  RefundStatus,
  SubscriptionStatus,
  UpiFlow
} from "@nexa-chess/types";
import { ProviderHealthService } from "../provider-health.service";
import {
  PaymentProviderError,
  type CancelSubscriptionInput,
  type CreatePaymentInput,
  type CreateSubscriptionInput,
  type PaymentDetails,
  type PaymentProviderAdapter,
  type PaymentResult,
  type PaymentVerificationResult,
  type RefundPaymentInput,
  type RefundResult,
  type SubscriptionResult,
  type VerifyPaymentInput,
  type WebhookInput,
  type WebhookResult
} from "./payment-provider.interface";
import {
  headerValue,
  pick,
  pickNumber,
  pickString,
  providerError,
  providerFetch,
  safeCompare,
  type JsonRecord,
  type ProviderResponse
} from "./provider-http";

const API_BASE = "https://api.stripe.com/v1";

/**
 * Stripe Checkout, used as a hosted redirect. That is deliberate: Checkout
 * brings Apple Pay, Google Pay, Link and every local method Stripe supports
 * with no client-side SDK and no card data ever touching our origin.
 *
 * Stripe speaks minor units natively, so no conversion happens here.
 */
@Injectable()
export class StripeProvider implements PaymentProviderAdapter {
  readonly id = "STRIPE" as const;

  private readonly env = getApiEnv();

  constructor(private readonly health: ProviderHealthService) {}

  isConfigured(): boolean {
    return Boolean(this.env.STRIPE_SECRET_KEY);
  }

  supportedMethods(): PaymentMethodKind[] {
    // Apple Pay / Google Pay are surfaced by Checkout itself on capable
    // devices; we list them so the picker can name them, but Stripe decides
    // whether they actually appear.
    return ["CARD", "APPLE_PAY", "GOOGLE_PAY", "OTHER"];
  }

  upiFlows(): UpiFlow[] {
    // Stripe does not serve Indian UPI for this account type. Saying so keeps
    // the router from ever sending a UPI intent here.
    return [];
  }

  supportsRecurring(): boolean {
    return true;
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    const form = new URLSearchParams();
    form.set("mode", "payment");
    form.set("client_reference_id", input.paymentId);
    form.set("customer_email", input.customer.email);
    form.set("success_url", appendQuery(input.returnUrl, "stripe=success"));
    form.set("cancel_url", appendQuery(input.returnUrl, "stripe=cancelled"));
    form.set("line_items[0][quantity]", "1");
    form.set(
      "line_items[0][price_data][currency]",
      input.currency.toLowerCase()
    );
    form.set("line_items[0][price_data][unit_amount]", String(input.amount));
    form.set(
      "line_items[0][price_data][product_data][name]",
      input.description.slice(0, 250)
    );
    form.set("payment_intent_data[metadata][nexaPaymentId]", input.paymentId);
    form.set("metadata[nexaPaymentId]", input.paymentId);
    form.set("metadata[nexaOrderId]", input.orderId);
    for (const [key, value] of Object.entries(input.notes)) {
      form.set(`metadata[${key.slice(0, 40)}]`, String(value).slice(0, 480));
    }

    const response = await this.call("createPayment", {
      path: "/checkout/sessions",
      method: "POST",
      form,
      idempotencyKey: input.paymentId
    });

    const sessionId = pickString(response.body, "id");
    const redirectUrl = pickString(response.body, "url");

    if (!sessionId || !redirectUrl) {
      throw new PaymentProviderError(
        this.id,
        "createPayment",
        "Stripe did not return a checkout session URL.",
        { retryable: true }
      );
    }

    return {
      providerPaymentId: pickString(response.body, "payment_intent"),
      providerOrderId: sessionId,
      status: "PENDING",
      handoff: {
        kind: "REDIRECT",
        provider: this.id,
        publicKey: this.env.STRIPE_PUBLISHABLE_KEY,
        providerOrderId: sessionId,
        redirectUrl,
        environment: this.env.PAYMENTS_MODE,
        method: input.method
      }
    };
  }

  /**
   * Stripe's success redirect carries only a session id, which proves nothing —
   * anyone can visit that URL. The session is always re-read from the API.
   */
  async verifyPayment(
    input: VerifyPaymentInput
  ): Promise<PaymentVerificationResult> {
    const sessionId = input.providerOrderId;
    if (!sessionId) {
      return {
        verified: false,
        reason: "No Stripe checkout session was supplied.",
        details: null
      };
    }

    const details = await this.getSession(sessionId);
    return {
      verified: false,
      reason:
        "Stripe's redirect is unsigned; state was read from the Checkout Session.",
      details
    };
  }

  async getPayment(
    providerPaymentId: string,
    providerOrderId?: string | null
  ): Promise<PaymentDetails> {
    // A session id is what we hold before the PaymentIntent exists.
    if (providerPaymentId.startsWith("cs_")) {
      return this.getSession(providerPaymentId);
    }
    if (!providerPaymentId && providerOrderId) {
      return this.getSession(providerOrderId);
    }

    const response = await this.call("getPayment", {
      path: `/payment_intents/${encodeURIComponent(providerPaymentId)}`,
      method: "GET"
    });
    return this.toDetails(response.body, providerOrderId ?? null);
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundResult> {
    const form = new URLSearchParams();
    form.set("payment_intent", input.providerPaymentId);
    form.set("amount", String(input.amount));
    form.set("metadata[reason]", input.reason.slice(0, 480));
    form.set("metadata[nexaRefundId]", input.refundId);

    const response = await this.call("refundPayment", {
      path: "/refunds",
      method: "POST",
      form,
      idempotencyKey: input.refundId
    });

    return {
      providerRefundId: pickString(response.body, "id"),
      status: mapRefundStatus(pickString(response.body, "status")),
      amount: pickNumber(response.body, "amount") ?? input.amount,
      raw: response.body
    };
  }

  /**
   * Stripe signs `t=<timestamp>,v1=<hmac>` over `${timestamp}.${rawBody}` in
   * `stripe-signature`. The timestamp is checked against a tolerance so a
   * captured webhook cannot be replayed days later.
   */
  async handleWebhook(input: WebhookInput): Promise<WebhookResult> {
    const secret = this.env.STRIPE_WEBHOOK_SECRET;
    const header = headerValue(input.headers, "stripe-signature");

    const signatureValid = verifyStripeSignature(
      input.rawBody,
      header,
      secret ?? null
    );

    const payload = parseJson(input.rawBody);
    const eventType = pickString(payload, "type") ?? "unknown";
    const object = pick(payload, "data", "object");
    const isSession = pickString(object, "object") === "checkout.session";
    // A subscription-mode session is the only event carrying both the session id
    // we stored and the real sub_ id, so it must reach the subscription handler.
    const isSubscriptionSession = isSession && pickString(object, "mode") === "subscription";

    const subject = eventType.startsWith("charge.refund")
      ? "REFUND"
      : eventType.startsWith("refund.")
        ? "REFUND"
        : eventType.startsWith("customer.subscription.") ||
            eventType.startsWith("invoice.") ||
            isSubscriptionSession
          ? "SUBSCRIPTION"
          : "PAYMENT";

    this.health.record({
      provider: this.id,
      kind: "WEBHOOK",
      operation: `webhook:${eventType}`,
      success: signatureValid
    });

    return {
      eventId: pickString(payload, "id") ?? hashPayload(input.rawBody),
      eventType,
      signatureValid,
      subject,
      providerPaymentId: isSession
        ? pickString(object, "payment_intent")
        : (pickString(object, "payment_intent") ?? pickString(object, "id")),
      providerOrderId: isSession ? pickString(object, "id") : null,
      providerRefundId: subject === "REFUND" ? pickString(object, "id") : null,
      providerSubscriptionId:
        pickString(object, "subscription") ??
        (eventType.startsWith("customer.subscription.")
          ? pickString(object, "id")
          : null),
      paymentId:
        pickString(object, "metadata", "nexaPaymentId") ??
        pickString(object, "client_reference_id"),
      paymentStatus:
        subject === "PAYMENT"
          ? eventType === "checkout.session.async_payment_failed"
            ? "FAILED"
            : isSession
              ? mapSessionStatus(
                  pickString(object, "status"),
                  pickString(object, "payment_status")
                )
              : mapPaymentStatus(pickString(object, "status"))
          : null,
      refundStatus:
        subject === "REFUND" ? mapRefundStatus(pickString(object, "status")) : null,
      subscriptionStatus:
        subject === "SUBSCRIPTION"
          ? isSubscriptionSession
            ? pickString(object, "status") === "expired"
              ? "EXPIRED"
              : pickString(object, "payment_status") === "paid" ||
                pickString(object, "payment_status") === "no_payment_required"
                ? "ACTIVE"
                : "PENDING_ACTIVATION"
            : mapSubscriptionStatus(pickString(object, "status"))
          : null,
      method: methodFromObject(object),
      methodDetail: methodDetail(object),
      amount:
        pickNumber(object, "amount_total") ??
        pickNumber(object, "amount") ??
        pickNumber(object, "amount_received"),
      amountRefunded: pickNumber(object, "amount_refunded"),
      currency: pickString(object, "currency")?.toUpperCase() ?? null,
      failureCode: pickString(object, "last_payment_error", "code"),
      failureMessage: pickString(object, "last_payment_error", "message"),
      paidAt: epochToDate(pickNumber(payload, "created")),
      nextBillingDate: epochToDate(pickNumber(object, "current_period_end")),
      raw: payload
    };
  }

  async createSubscription(
    input: CreateSubscriptionInput
  ): Promise<SubscriptionResult> {
    const form = new URLSearchParams();
    form.set("mode", "subscription");
    form.set("client_reference_id", input.subscriptionId);
    form.set("customer_email", input.customer.email);
    form.set("success_url", appendQuery(input.returnUrl, "stripe=success"));
    form.set("cancel_url", appendQuery(input.returnUrl, "stripe=cancelled"));
    form.set("line_items[0][quantity]", "1");
    form.set("line_items[0][price_data][currency]", input.currency.toLowerCase());
    form.set("line_items[0][price_data][unit_amount]", String(input.amount));
    form.set(
      "line_items[0][price_data][product_data][name]",
      input.planName.slice(0, 250)
    );
    form.set(
      "line_items[0][price_data][recurring][interval]",
      input.intervalMonths === 12 ? "year" : "month"
    );
    if (input.intervalMonths !== 12 && input.intervalMonths > 1) {
      form.set(
        "line_items[0][price_data][recurring][interval_count]",
        String(input.intervalMonths)
      );
    }
    form.set(
      "subscription_data[metadata][nexaSubscriptionId]",
      input.subscriptionId
    );
    form.set("metadata[nexaSubscriptionId]", input.subscriptionId);

    const response = await this.call("createSubscription", {
      path: "/checkout/sessions",
      method: "POST",
      form,
      idempotencyKey: input.subscriptionId
    });

    const sessionId = pickString(response.body, "id");
    const redirectUrl = pickString(response.body, "url");
    if (!sessionId || !redirectUrl) {
      throw new PaymentProviderError(
        this.id,
        "createSubscription",
        "Stripe did not return a subscription checkout URL.",
        { retryable: true }
      );
    }

    return {
      // The real subscription id only exists once the customer completes
      // Checkout; the webhook fills it in. Until then the session id stands in.
      providerSubscriptionId: sessionId,
      providerCustomerId: pickString(response.body, "customer"),
      status: "PENDING_ACTIVATION",
      nextBillingDate: null,
      handoff: {
        kind: "REDIRECT",
        provider: this.id,
        publicKey: this.env.STRIPE_PUBLISHABLE_KEY,
        providerOrderId: sessionId,
        redirectUrl,
        environment: this.env.PAYMENTS_MODE
      }
    };
  }

  async cancelSubscription(input: CancelSubscriptionInput): Promise<void> {
    if (input.atPeriodEnd) {
      const form = new URLSearchParams();
      form.set("cancel_at_period_end", "true");
      await this.call("cancelSubscription", {
        path: `/subscriptions/${encodeURIComponent(input.providerSubscriptionId)}`,
        method: "POST",
        form
      });
      return;
    }

    await this.call("cancelSubscription", {
      path: `/subscriptions/${encodeURIComponent(input.providerSubscriptionId)}`,
      method: "DELETE"
    });
  }

  private async getSession(sessionId: string): Promise<PaymentDetails> {
    const response = await this.call("getSession", {
      path: `/checkout/sessions/${encodeURIComponent(sessionId)}`,
      method: "GET"
    });

    const body = response.body;
    const paymentIntentId = pickString(body, "payment_intent");

    // The session knows whether it was paid; the PaymentIntent knows how.
    if (paymentIntentId) {
      const intent = await this.call("getPayment", {
        path: `/payment_intents/${encodeURIComponent(paymentIntentId)}`,
        method: "GET"
      });
      return this.toDetails(intent.body, sessionId);
    }

    return {
      providerPaymentId: null,
      providerOrderId: sessionId,
      status: mapSessionStatus(
        pickString(body, "status"),
        pickString(body, "payment_status")
      ),
      method: null,
      methodDetail: null,
      amount: pickNumber(body, "amount_total"),
      amountRefunded: 0,
      currency: pickString(body, "currency")?.toUpperCase() ?? null,
      failureCode: null,
      failureMessage: null,
      paidAt: null,
      raw: body
    };
  }

  private toDetails(intent: JsonRecord, sessionId: string | null): PaymentDetails {
    const status = pickString(intent, "status");
    const charge = firstCharge(intent);

    return {
      providerPaymentId: pickString(intent, "id"),
      providerOrderId: sessionId,
      status: mapPaymentStatus(status),
      method: methodFromObject(charge ?? intent),
      methodDetail: methodDetail(charge ?? intent),
      amount:
        pickNumber(intent, "amount_received") || pickNumber(intent, "amount"),
      amountRefunded: pickNumber(charge, "amount_refunded") ?? 0,
      currency: pickString(intent, "currency")?.toUpperCase() ?? null,
      failureCode: pickString(intent, "last_payment_error", "code"),
      failureMessage: pickString(intent, "last_payment_error", "message"),
      paidAt:
        status === "succeeded" ? epochToDate(pickNumber(intent, "created")) : null,
      raw: intent
    };
  }

  private async call(
    operation: string,
    request: {
      path: string;
      method: "GET" | "POST" | "DELETE";
      form?: URLSearchParams;
      idempotencyKey?: string;
    }
  ): Promise<ProviderResponse> {
    if (!this.isConfigured()) {
      throw new PaymentProviderError(
        this.id,
        operation,
        "Stripe is not configured."
      );
    }

    const response = await providerFetch({
      url: `${API_BASE}${request.path}`,
      method: request.method,
      headers: {
        Authorization: `Bearer ${this.env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": this.env.STRIPE_API_VERSION,
        ...(request.idempotencyKey
          ? { "Idempotency-Key": request.idempotencyKey }
          : {})
      },
      body: request.form?.toString(),
      timeoutMs: this.env.PAYMENTS_HTTP_TIMEOUT_MS
    });

    this.health.record({
      provider: this.id,
      kind: "API_CALL",
      operation,
      success: response.ok,
      durationMs: response.durationMs,
      statusCode: response.status
    });

    if (!response.ok) {
      throw providerError(
        this.id,
        operation,
        response,
        `Stripe ${operation} failed.`
      );
    }

    return response;
  }
}

// ── Signature ──

/** Five minutes, matching Stripe's own recommended tolerance. */
const SIGNATURE_TOLERANCE_SECONDS = 300;

export function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string | null,
  nowSeconds: number = Math.floor(Date.now() / 1000)
): boolean {
  if (!header || !secret) return false;

  const parts = header.split(",").map((part) => part.trim());
  const timestamp = parts
    .find((part) => part.startsWith("t="))
    ?.slice(2);
  const signatures = parts
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));

  if (!timestamp || signatures.length === 0) return false;

  const age = Math.abs(nowSeconds - Number(timestamp));
  if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  return signatures.some((signature) => safeCompare(expected, signature));
}

// ── Status mapping. The ONLY place Stripe's vocabulary exists. ──

export function mapPaymentStatus(status: string | null): PaymentStatus {
  switch (status) {
    case "requires_payment_method":
    case "requires_confirmation":
      return "PENDING";
    case "requires_action":
    case "processing":
      return "PROCESSING";
    case "requires_capture":
      return "AUTHORIZED";
    case "succeeded":
      return "PAID";
    case "canceled":
      return "CANCELLED";
    default:
      return "PENDING";
  }
}

export function mapSessionStatus(
  status: string | null,
  paymentStatus: string | null
): PaymentStatus {
  if (paymentStatus === "paid") return "PAID";
  if (paymentStatus === "no_payment_required") return "PAID";
  switch (status) {
    // Complete but unpaid: a delayed method (bank debit) whose funds have not
    // arrived. async_payment_succeeded later carries payment_status "paid".
    case "complete":
      return "PROCESSING";
    case "expired":
      return "EXPIRED";
    case "open":
      return "PENDING";
    default:
      return "PENDING";
  }
}

export function mapRefundStatus(status: string | null): RefundStatus {
  switch (status) {
    case "succeeded":
      return "SUCCEEDED";
    case "pending":
      return "PROCESSING";
    case "failed":
      return "FAILED";
    case "canceled":
      return "CANCELLED";
    default:
      return "PENDING";
  }
}

export function mapSubscriptionStatus(status: string | null): SubscriptionStatus {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "trialing":
      return "ACTIVE";
    case "past_due":
    case "unpaid":
      return "PAST_DUE";
    case "paused":
      return "PAUSED";
    case "canceled":
      return "CANCELLED";
    case "incomplete":
      return "PENDING_ACTIVATION";
    case "incomplete_expired":
      return "EXPIRED";
    default:
      return "CREATED";
  }
}

function methodFromObject(object: unknown): PaymentMethodKind | null {
  const wallet = pickString(object, "payment_method_details", "card", "wallet", "type");
  if (wallet === "apple_pay") return "APPLE_PAY";
  if (wallet === "google_pay") return "GOOGLE_PAY";

  const type =
    pickString(object, "payment_method_details", "type") ??
    (Array.isArray(pick(object, "payment_method_types"))
      ? String((pick(object, "payment_method_types") as unknown[])[0])
      : null);

  switch (type) {
    case "card":
      return "CARD";
    case "upi":
      return "UPI";
    case null:
    case undefined:
      return null;
    default:
      return "OTHER";
  }
}

function methodDetail(object: unknown): string | null {
  const brand = pickString(object, "payment_method_details", "card", "brand");
  const last4 = pickString(object, "payment_method_details", "card", "last4");
  if (brand) return last4 ? `card · ${brand} ${last4}` : `card · ${brand}`;

  const type = pickString(object, "payment_method_details", "type");
  return type ?? null;
}

function firstCharge(intent: JsonRecord): JsonRecord | null {
  const charges = pick(intent, "charges", "data");
  if (Array.isArray(charges) && charges.length > 0) {
    return charges[0] as JsonRecord;
  }
  const latest = pick(intent, "latest_charge");
  return latest && typeof latest === "object" ? (latest as JsonRecord) : null;
}

function appendQuery(url: string, query: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}${query}`;
}

function epochToDate(seconds: number | null): Date | null {
  return seconds ? new Date(seconds * 1000) : null;
}

function parseJson(raw: string): JsonRecord {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as JsonRecord) : {};
  } catch {
    return {};
  }
}

function hashPayload(raw: string): string {
  return `sha256:${createHash("sha256").update(raw).digest("hex")}`;
}

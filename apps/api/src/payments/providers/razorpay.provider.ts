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
  basicAuthHeader,
  headerValue,
  hmacHex,
  pick,
  pickNumber,
  pickString,
  providerError,
  providerFetch,
  safeCompare,
  type JsonRecord,
  type ProviderResponse
} from "./provider-http";

const API_BASE = "https://api.razorpay.com/v1";

/** Razorpay speaks paise natively, which is already our minor-unit model. */
@Injectable()
export class RazorpayProvider implements PaymentProviderAdapter {
  readonly id = "RAZORPAY" as const;

  private readonly env = getApiEnv();

  constructor(private readonly health: ProviderHealthService) {}

  isConfigured(): boolean {
    return Boolean(this.env.RAZORPAY_KEY_ID && this.env.RAZORPAY_KEY_SECRET);
  }

  supportedMethods(currency: string): PaymentMethodKind[] {
    if (currency.toUpperCase() !== "INR") return ["CARD"];
    return ["UPI", "CARD", "NET_BANKING", "WALLET", "EMI", "PAY_LATER"];
  }

  upiFlows(currency: string): UpiFlow[] {
    // Checkout.js drives intent, collect and QR itself — we never build a UPI
    // request, we hand the user to Razorpay's own UPI block.
    return currency.toUpperCase() === "INR"
      ? ["CHECKOUT", "INTENT", "QR", "COLLECT"]
      : [];
  }

  supportsRecurring(currency: string): boolean {
    return currency.toUpperCase() === "INR";
  }

  /**
   * Creates a Razorpay Order. No money moves here — Checkout.js opens against
   * this order id and Razorpay mints the payment.
   */
  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    const response = await this.call("createPayment", {
      path: "/orders",
      method: "POST",
      body: {
        amount: input.amount,
        currency: input.currency.toUpperCase(),
        receipt: input.orderNumber,
        notes: { ...input.notes, nexaPaymentId: input.paymentId }
      },
      // Razorpay dedupes on this header, so a retried create returns the same
      // order instead of opening a second one.
      idempotencyKey: input.paymentId
    });

    const providerOrderId = pickString(response.body, "id");
    if (!providerOrderId) {
      throw new PaymentProviderError(
        this.id,
        "createPayment",
        "Razorpay did not return an order id.",
        { retryable: true }
      );
    }

    return {
      providerPaymentId: null,
      providerOrderId,
      status: "PENDING",
      handoff: {
        kind: "SDK",
        provider: this.id,
        // Publishable key id only. The secret never leaves the server.
        publicKey: this.env.RAZORPAY_KEY_ID,
        providerOrderId,
        environment: this.env.PAYMENTS_MODE,
        method: input.method,
        customer: {
          name: input.customer.name,
          email: input.customer.email,
          phone: input.customer.phone
        },
        notes: input.notes
      }
    };
  }

  /**
   * Checks the browser handshake, then — regardless of the result — fetches the
   * payment from Razorpay. A valid signature is not permission to trust the
   * client's `status`; only the fetched record decides.
   */
  async verifyPayment(
    input: VerifyPaymentInput
  ): Promise<PaymentVerificationResult> {
    const { providerPaymentId, providerOrderId, signature } = input;

    let verified = false;
    let reason: string | null = null;

    if (providerPaymentId && providerOrderId && signature) {
      const expected = hmacHex(
        this.env.RAZORPAY_KEY_SECRET ?? "",
        `${providerOrderId}|${providerPaymentId}`
      );
      verified = safeCompare(expected, signature);
      reason = verified ? null : "Razorpay checkout signature did not match.";
    } else {
      reason = "Razorpay checkout returned no signed handshake.";
    }

    const details = providerPaymentId
      ? await this.getPayment(providerPaymentId, providerOrderId ?? null)
      : providerOrderId
        ? await this.getPaymentByOrder(providerOrderId)
        : null;

    return { verified, reason, details };
  }

  async getPayment(
    providerPaymentId: string,
    // Razorpay addresses payments by their own id; the order handle is part of
    // the shared signature and is only used by the fallback lookup below.
    _providerOrderId?: string | null
  ): Promise<PaymentDetails> {
    const response = await this.call("getPayment", {
      path: `/payments/${encodeURIComponent(providerPaymentId)}`,
      method: "GET"
    });
    return this.toDetails(response.body);
  }

  /** Used when the browser died before Checkout.js handed back a payment id. */
  async getPaymentByOrder(
    providerOrderId: string
  ): Promise<PaymentDetails | null> {
    const response = await this.call("getPaymentByOrder", {
      path: `/orders/${encodeURIComponent(providerOrderId)}/payments`,
      method: "GET"
    });

    const items = pick(response.body, "items");
    if (!Array.isArray(items) || items.length === 0) return null;

    // An order can hold several failed attempts plus one captured payment;
    // the captured/authorized one is the only one that matters.
    const settled =
      items.find(
        (item) =>
          pickString(item, "status") === "captured" ||
          pickString(item, "status") === "authorized"
      ) ?? items[items.length - 1];

    return this.toDetails(settled as JsonRecord);
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundResult> {
    const response = await this.call("refundPayment", {
      path: `/payments/${encodeURIComponent(input.providerPaymentId)}/refund`,
      method: "POST",
      body: {
        amount: input.amount,
        speed: "normal",
        notes: { ...(input.notes ?? {}), reason: input.reason.slice(0, 250) }
      },
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
   * Razorpay signs the exact request body with the webhook secret (HMAC-SHA256,
   * hex) in `x-razorpay-signature`. An unsigned or misconfigured request is
   * rejected — there is no bypass.
   */
  async handleWebhook(input: WebhookInput): Promise<WebhookResult> {
    const secret = this.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = headerValue(input.headers, "x-razorpay-signature");

    const signatureValid = Boolean(
      secret && signature && safeCompare(hmacHex(secret, input.rawBody), signature)
    );

    const payload = parseJson(input.rawBody);
    const eventType = pickString(payload, "event") ?? "unknown";
    const entity =
      pick(payload, "payload", "payment", "entity") ??
      pick(payload, "payload", "refund", "entity") ??
      pick(payload, "payload", "subscription", "entity");

    const subject = eventType.startsWith("refund.")
      ? "REFUND"
      : eventType.startsWith("subscription.")
        ? "SUBSCRIPTION"
        : eventType.startsWith("payment.") || eventType.startsWith("order.")
          ? "PAYMENT"
          : "UNKNOWN";

    const paymentEntity = pick(payload, "payload", "payment", "entity");
    const refundEntity = pick(payload, "payload", "refund", "entity");
    const subscriptionEntity = pick(payload, "payload", "subscription", "entity");

    const source = paymentEntity ?? entity;

    this.health.record({
      provider: this.id,
      kind: "WEBHOOK",
      operation: `webhook:${eventType}`,
      success: signatureValid
    });

    return {
      eventId:
        headerValue(input.headers, "x-razorpay-event-id") ??
        hashPayload(input.rawBody),
      eventType,
      signatureValid,
      subject,
      providerPaymentId:
        pickString(paymentEntity, "id") ??
        pickString(refundEntity, "payment_id"),
      providerOrderId: pickString(source, "order_id"),
      providerRefundId: pickString(refundEntity, "id"),
      providerSubscriptionId: pickString(subscriptionEntity, "id"),
      paymentId: pickString(source, "notes", "nexaPaymentId"),
      paymentStatus:
        subject === "PAYMENT" ? mapPaymentStatus(pickString(source, "status")) : null,
      refundStatus:
        subject === "REFUND"
          ? mapRefundStatus(pickString(refundEntity, "status"))
          : null,
      subscriptionStatus:
        subject === "SUBSCRIPTION"
          ? mapSubscriptionStatus(pickString(subscriptionEntity, "status"))
          : null,
      method: mapMethod(pickString(source, "method")),
      methodDetail: methodDetail(source),
      amount: pickNumber(source, "amount"),
      amountRefunded: pickNumber(source, "amount_refunded"),
      currency: pickString(source, "currency"),
      failureCode: pickString(source, "error_code"),
      failureMessage:
        pickString(source, "error_description") ??
        pickString(source, "error_reason"),
      paidAt: epochToDate(pickNumber(source, "created_at")),
      nextBillingDate: epochToDate(
        pickNumber(subscriptionEntity, "charge_at")
      ),
      raw: payload
    };
  }

  async createSubscription(
    input: CreateSubscriptionInput
  ): Promise<SubscriptionResult> {
    // Razorpay bills a subscription against a Plan; one is created per
    // (amount, interval) and reused by id thereafter.
    const plan = await this.call("createSubscriptionPlan", {
      path: "/plans",
      method: "POST",
      body: {
        period: input.intervalMonths === 12 ? "yearly" : "monthly",
        interval: input.intervalMonths === 12 ? 1 : input.intervalMonths,
        item: {
          name: input.planName,
          amount: input.amount,
          currency: input.currency.toUpperCase()
        },
        notes: input.notes
      },
      idempotencyKey: `${input.subscriptionId}-plan`
    });

    const planId = pickString(plan.body, "id");
    if (!planId) {
      throw new PaymentProviderError(
        this.id,
        "createSubscription",
        "Razorpay did not return a plan id.",
        { retryable: true }
      );
    }

    const response = await this.call("createSubscription", {
      path: "/subscriptions",
      method: "POST",
      body: {
        plan_id: planId,
        customer_notify: 1,
        // Razorpay requires a finite count; 120 cycles is 10 years monthly.
        total_count: input.intervalMonths === 12 ? 10 : 120,
        notes: { ...input.notes, nexaSubscriptionId: input.subscriptionId }
      },
      idempotencyKey: input.subscriptionId
    });

    const providerSubscriptionId = pickString(response.body, "id");
    if (!providerSubscriptionId) {
      throw new PaymentProviderError(
        this.id,
        "createSubscription",
        "Razorpay did not return a subscription id.",
        { retryable: true }
      );
    }

    return {
      providerSubscriptionId,
      providerCustomerId: pickString(response.body, "customer_id"),
      status: mapSubscriptionStatus(pickString(response.body, "status")),
      nextBillingDate: epochToDate(pickNumber(response.body, "charge_at")),
      handoff: {
        kind: "REDIRECT",
        provider: this.id,
        redirectUrl: pickString(response.body, "short_url") ?? input.returnUrl,
        providerOrderId: providerSubscriptionId,
        environment: this.env.PAYMENTS_MODE
      }
    };
  }

  async cancelSubscription(input: CancelSubscriptionInput): Promise<void> {
    await this.call("cancelSubscription", {
      path: `/subscriptions/${encodeURIComponent(input.providerSubscriptionId)}/cancel`,
      method: "POST",
      body: { cancel_at_cycle_end: input.atPeriodEnd ? 1 : 0 }
    });
  }

  private toDetails(entity: unknown): PaymentDetails {
    const status = pickString(entity, "status");
    return {
      providerPaymentId: pickString(entity, "id"),
      providerOrderId: pickString(entity, "order_id"),
      status: mapPaymentStatus(status),
      method: mapMethod(pickString(entity, "method")),
      methodDetail: methodDetail(entity),
      amount: pickNumber(entity, "amount"),
      amountRefunded: pickNumber(entity, "amount_refunded") ?? 0,
      currency: pickString(entity, "currency"),
      failureCode: pickString(entity, "error_code"),
      failureMessage:
        pickString(entity, "error_description") ??
        pickString(entity, "error_reason"),
      paidAt:
        status === "captured" ? epochToDate(pickNumber(entity, "created_at")) : null,
      raw: entity
    };
  }

  private async call(
    operation: string,
    request: {
      path: string;
      method: "GET" | "POST";
      body?: JsonRecord;
      idempotencyKey?: string;
    }
  ): Promise<ProviderResponse> {
    if (!this.isConfigured()) {
      throw new PaymentProviderError(
        this.id,
        operation,
        "Razorpay is not configured."
      );
    }

    const response = await providerFetch({
      url: `${API_BASE}${request.path}`,
      method: request.method,
      headers: {
        Authorization: basicAuthHeader(
          this.env.RAZORPAY_KEY_ID ?? "",
          this.env.RAZORPAY_KEY_SECRET ?? ""
        ),
        "Content-Type": "application/json",
        ...(request.idempotencyKey
          ? { "X-Razorpay-Idempotency-Key": request.idempotencyKey }
          : {})
      },
      body: request.body ? JSON.stringify(request.body) : undefined,
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
        `Razorpay ${operation} failed.`
      );
    }

    return response;
  }
}

// ── Status mapping. The ONLY place Razorpay's vocabulary exists. ──

export function mapPaymentStatus(status: string | null): PaymentStatus {
  switch (status) {
    case "created":
      return "PENDING";
    case "attempted":
      return "PROCESSING";
    case "authorized":
      return "AUTHORIZED";
    case "captured":
    case "paid":
      return "PAID";
    case "refunded":
      return "REFUNDED";
    case "failed":
      return "FAILED";
    default:
      return "PENDING";
  }
}

export function mapRefundStatus(status: string | null): RefundStatus {
  switch (status) {
    case "processed":
      return "SUCCEEDED";
    case "failed":
      return "FAILED";
    case "pending":
      return "PROCESSING";
    default:
      return "PENDING";
  }
}

export function mapSubscriptionStatus(status: string | null): SubscriptionStatus {
  switch (status) {
    case "created":
      return "CREATED";
    case "authenticated":
      return "PENDING_ACTIVATION";
    case "active":
      return "ACTIVE";
    case "pending":
    case "halted":
      return "PAST_DUE";
    case "paused":
      return "PAUSED";
    case "cancelled":
      return "CANCELLED";
    case "completed":
    case "expired":
      return "EXPIRED";
    default:
      return "CREATED";
  }
}

export function mapMethod(method: string | null): PaymentMethodKind | null {
  switch (method) {
    case "upi":
      return "UPI";
    case "card":
      return "CARD";
    case "netbanking":
      return "NET_BANKING";
    case "wallet":
      return "WALLET";
    case "emi":
      return "EMI";
    case "paylater":
      return "PAY_LATER";
    case null:
    case undefined:
      return null;
    default:
      return "OTHER";
  }
}

/** Human trace line for the admin table: "upi · gpay", "card · Visa 4242". */
function methodDetail(entity: unknown): string | null {
  const method = pickString(entity, "method");
  if (!method) return null;

  const parts = [method];
  const vpa = pickString(entity, "vpa");
  const wallet = pickString(entity, "wallet");
  const bank = pickString(entity, "bank");
  const network = pickString(entity, "card", "network");
  const last4 = pickString(entity, "card", "last4");

  if (vpa) parts.push(vpa);
  else if (wallet) parts.push(wallet);
  else if (bank) parts.push(bank);
  else if (network) parts.push(last4 ? `${network} ${last4}` : network);

  return parts.join(" · ");
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
  // Razorpay does not always send an event id; a content hash still dedupes a
  // byte-identical redelivery, which is what a retry actually is.
  return `sha256:${hmacHex("razorpay-event", raw)}`;
}

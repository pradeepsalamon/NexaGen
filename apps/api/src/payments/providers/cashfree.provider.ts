import { createHash } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { getApiEnv } from "@nexa-chess/config/api";
import {
  toMajorUnits,
  toMinorUnits,
  type PaymentMethodKind,
  type PaymentStatus,
  type RefundStatus,
  type UpiFlow
} from "@nexa-chess/types";
import { ProviderHealthService } from "../provider-health.service";
import {
  PaymentProviderError,
  type CreatePaymentInput,
  type PaymentDetails,
  type PaymentProviderAdapter,
  type PaymentResult,
  type PaymentVerificationResult,
  type RefundPaymentInput,
  type RefundResult,
  type VerifyPaymentInput,
  type WebhookInput,
  type WebhookResult
} from "./payment-provider.interface";
import {
  headerValue,
  hmacBase64,
  pick,
  pickNumber,
  pickString,
  providerError,
  providerFetch,
  safeCompare,
  type JsonRecord,
  type ProviderResponse
} from "./provider-http";

const SANDBOX_BASE = "https://sandbox.cashfree.com/pg";
const PRODUCTION_BASE = "https://api.cashfree.com/pg";

/**
 * Cashfree works in MAJOR units (rupees as a decimal), unlike Razorpay and
 * Stripe. Every crossing of this boundary goes through toMajorUnits /
 * toMinorUnits so the conversion exists in exactly one place.
 */
@Injectable()
export class CashfreeProvider implements PaymentProviderAdapter {
  readonly id = "CASHFREE" as const;

  private readonly env = getApiEnv();

  constructor(private readonly health: ProviderHealthService) {}

  isConfigured(): boolean {
    return Boolean(this.env.CASHFREE_APP_ID && this.env.CASHFREE_SECRET_KEY);
  }

  supportedMethods(currency: string): PaymentMethodKind[] {
    if (currency.toUpperCase() !== "INR") return [];
    return ["UPI", "CARD", "NET_BANKING", "WALLET", "EMI", "PAY_LATER"];
  }

  upiFlows(currency: string): UpiFlow[] {
    return currency.toUpperCase() === "INR"
      ? ["CHECKOUT", "INTENT", "QR", "COLLECT"]
      : [];
  }

  supportsRecurring(currency: string): boolean {
    return currency.toUpperCase() === "INR";
  }

  /**
   * Creates a Cashfree order and returns its `payment_session_id`, which is
   * what the Cashfree JS SDK opens against. The session id is not a secret —
   * it is scoped to this one order.
   */
  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    const response = await this.call("createPayment", {
      path: "/orders",
      method: "POST",
      body: {
        // Our own payment id doubles as the Cashfree order id, so a replayed
        // create collides on their side instead of opening a second order.
        order_id: input.paymentId,
        order_amount: toMajorUnits(input.amount, input.currency),
        order_currency: input.currency.toUpperCase(),
        customer_details: {
          customer_id: input.customer.id,
          customer_name: input.customer.name,
          customer_email: input.customer.email,
          ...(input.customer.phone
            ? { customer_phone: input.customer.phone }
            : {})
        },
        order_meta: {
          return_url: `${input.returnUrl}${input.returnUrl.includes("?") ? "&" : "?"}cf_order_id={order_id}`,
          ...(input.method ? { payment_methods: cashfreeMethods(input.method) } : {})
        },
        order_note: input.description.slice(0, 200),
        order_tags: flattenTags(input.notes)
      },
      idempotencyKey: input.paymentId
    });

    const sessionId = pickString(response.body, "payment_session_id");
    const providerOrderId = pickString(response.body, "order_id");

    if (!sessionId || !providerOrderId) {
      throw new PaymentProviderError(
        this.id,
        "createPayment",
        "Cashfree did not return a payment session.",
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
        // Session-scoped, single-order token — not an account credential.
        publicKey: sessionId,
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
   * Cashfree's browser return carries no signature at all — only an order id in
   * the query string. So the client's claim is worth nothing on its own and we
   * always fetch the order's payments server-side.
   */
  async verifyPayment(
    input: VerifyPaymentInput
  ): Promise<PaymentVerificationResult> {
    const orderId = input.providerOrderId ?? input.paymentId;
    const details = await this.getPayment(
      input.providerPaymentId ?? orderId,
      orderId
    );

    return {
      verified: false,
      reason:
        "Cashfree does not sign its browser redirect; state was read from the API.",
      details
    };
  }

  async getPayment(
    providerPaymentId: string,
    providerOrderId?: string | null
  ): Promise<PaymentDetails> {
    const orderId = providerOrderId ?? providerPaymentId;

    const response = await this.call("getPayment", {
      path: `/orders/${encodeURIComponent(orderId)}/payments`,
      method: "GET"
    });

    const items = Array.isArray(response.body.value)
      ? (response.body.value as unknown[])
      : Array.isArray(response.body)
        ? (response.body as unknown[])
        : [];

    if (items.length === 0) {
      // No attempt has been made yet — the session exists, nobody paid.
      const order = await this.call("getOrder", {
        path: `/orders/${encodeURIComponent(orderId)}`,
        method: "GET"
      });
      return {
        providerPaymentId: null,
        providerOrderId: orderId,
        status: mapOrderStatus(pickString(order.body, "order_status")),
        method: null,
        methodDetail: null,
        amount: toMinorUnits(
          pickNumber(order.body, "order_amount") ?? 0,
          pickString(order.body, "order_currency") ?? "INR"
        ),
        amountRefunded: 0,
        currency: pickString(order.body, "order_currency"),
        failureCode: null,
        failureMessage: null,
        paidAt: null,
        raw: order.body
      };
    }

    const settled =
      items.find((item) => pickString(item, "payment_status") === "SUCCESS") ??
      items[items.length - 1];

    return this.toDetails(settled, orderId);
  }

  async refundPayment(input: RefundPaymentInput): Promise<RefundResult> {
    // Cashfree refunds are addressed by ORDER, not by payment.
    const response = await this.call("refundPayment", {
      path: `/orders/${encodeURIComponent(input.providerPaymentId)}/refunds`,
      method: "POST",
      body: {
        refund_id: input.refundId,
        refund_amount: toMajorUnits(input.amount, input.currency),
        refund_note: input.reason.slice(0, 200),
        refund_speed: "STANDARD"
      },
      idempotencyKey: input.refundId
    });

    return {
      providerRefundId:
        pickString(response.body, "cf_refund_id") ??
        pickString(response.body, "refund_id"),
      status: mapRefundStatus(pickString(response.body, "refund_status")),
      amount: toMinorUnits(
        pickNumber(response.body, "refund_amount") ?? 0,
        input.currency
      ),
      raw: response.body
    };
  }

  /**
   * Cashfree signs `timestamp + rawBody` with the webhook secret (HMAC-SHA256,
   * base64) in `x-webhook-signature`, with the timestamp in
   * `x-webhook-timestamp`. Both headers are required — a missing one is a
   * rejected webhook, not a warning.
   */
  async handleWebhook(input: WebhookInput): Promise<WebhookResult> {
    const secret = this.env.CASHFREE_WEBHOOK_SECRET;
    const signature = headerValue(input.headers, "x-webhook-signature");
    const timestamp = headerValue(input.headers, "x-webhook-timestamp");

    const signatureValid = Boolean(
      secret &&
        signature &&
        timestamp &&
        safeCompare(hmacBase64(secret, `${timestamp}${input.rawBody}`), signature)
    );

    const payload = parseJson(input.rawBody);
    const eventType = pickString(payload, "type") ?? "unknown";
    const data = pick(payload, "data");

    const paymentEntity = pick(data, "payment");
    const orderEntity = pick(data, "order");
    const refundEntity = pick(data, "refund");

    const subject = eventType.includes("REFUND")
      ? "REFUND"
      : eventType.includes("PAYMENT")
        ? "PAYMENT"
        : "UNKNOWN";

    const currency =
      pickString(paymentEntity, "payment_currency") ??
      pickString(orderEntity, "order_currency") ??
      "INR";

    this.health.record({
      provider: this.id,
      kind: "WEBHOOK",
      operation: `webhook:${eventType}`,
      success: signatureValid
    });

    return {
      eventId:
        pickString(payload, "event_id") ??
        pickString(paymentEntity, "cf_payment_id") ??
        hashPayload(input.rawBody),
      eventType,
      signatureValid,
      subject,
      providerPaymentId: pickString(paymentEntity, "cf_payment_id"),
      providerOrderId: pickString(orderEntity, "order_id"),
      providerRefundId:
        pickString(refundEntity, "cf_refund_id") ??
        pickString(refundEntity, "refund_id"),
      providerSubscriptionId: null,
      // Cashfree echoes our order_id, which we set to our own payment id.
      paymentId: pickString(orderEntity, "order_id"),
      paymentStatus:
        subject === "PAYMENT"
          ? mapPaymentStatus(pickString(paymentEntity, "payment_status"))
          : null,
      refundStatus:
        subject === "REFUND"
          ? mapRefundStatus(pickString(refundEntity, "refund_status"))
          : null,
      subscriptionStatus: null,
      method: methodFromGroup(paymentEntity),
      methodDetail: methodDetail(paymentEntity),
      amount: toMinorUnitsOrNull(
        pickNumber(paymentEntity, "payment_amount"),
        currency
      ),
      amountRefunded: toMinorUnitsOrNull(
        pickNumber(refundEntity, "refund_amount"),
        currency
      ),
      currency,
      failureCode: pickString(paymentEntity, "error_details", "error_code"),
      failureMessage: pickString(
        paymentEntity,
        "error_details",
        "error_description"
      ),
      paidAt: parseDate(pickString(paymentEntity, "payment_time")),
      nextBillingDate: null,
      raw: payload
    };
  }

  private toDetails(entity: unknown, orderId: string): PaymentDetails {
    const currency = pickString(entity, "payment_currency") ?? "INR";
    const status = pickString(entity, "payment_status");

    return {
      providerPaymentId: pickString(entity, "cf_payment_id"),
      providerOrderId: orderId,
      status: mapPaymentStatus(status),
      method: methodFromGroup(entity),
      methodDetail: methodDetail(entity),
      amount: toMinorUnitsOrNull(pickNumber(entity, "payment_amount"), currency),
      amountRefunded: 0,
      currency,
      failureCode: pickString(entity, "error_details", "error_code"),
      failureMessage: pickString(entity, "error_details", "error_description"),
      paidAt:
        status === "SUCCESS" ? parseDate(pickString(entity, "payment_time")) : null,
      raw: entity
    };
  }

  private get baseUrl(): string {
    return this.env.PAYMENTS_MODE === "production" ? PRODUCTION_BASE : SANDBOX_BASE;
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
        "Cashfree is not configured."
      );
    }

    const response = await providerFetch({
      url: `${this.baseUrl}${request.path}`,
      method: request.method,
      headers: {
        "x-client-id": this.env.CASHFREE_APP_ID ?? "",
        "x-client-secret": this.env.CASHFREE_SECRET_KEY ?? "",
        "x-api-version": this.env.CASHFREE_API_VERSION,
        "Content-Type": "application/json",
        ...(request.idempotencyKey
          ? { "x-idempotency-key": request.idempotencyKey }
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
        `Cashfree ${operation} failed.`
      );
    }

    return response;
  }
}

// ── Status mapping. The ONLY place Cashfree's vocabulary exists. ──

export function mapPaymentStatus(status: string | null): PaymentStatus {
  switch (status) {
    case "SUCCESS":
      return "PAID";
    case "PENDING":
      return "PROCESSING";
    case "NOT_ATTEMPTED":
      return "PENDING";
    case "USER_DROPPED":
    case "CANCELLED":
      return "CANCELLED";
    case "VOID":
    case "FAILED":
      return "FAILED";
    default:
      return "PENDING";
  }
}

export function mapOrderStatus(status: string | null): PaymentStatus {
  switch (status) {
    case "PAID":
      return "PAID";
    case "ACTIVE":
      return "PENDING";
    case "EXPIRED":
      return "EXPIRED";
    case "TERMINATED":
    case "TERMINATION_REQUESTED":
      return "CANCELLED";
    default:
      return "PENDING";
  }
}

export function mapRefundStatus(status: string | null): RefundStatus {
  switch (status) {
    case "SUCCESS":
      return "SUCCEEDED";
    case "PENDING":
      return "PROCESSING";
    case "CANCELLED":
      return "CANCELLED";
    case "ONHOLD":
      return "PROCESSING";
    case "FAILED":
      return "FAILED";
    default:
      return "PENDING";
  }
}

function methodFromGroup(entity: unknown): PaymentMethodKind | null {
  const group = pickString(entity, "payment_group");
  switch (group) {
    case "upi":
      return "UPI";
    case "credit_card":
    case "debit_card":
    case "card":
      return "CARD";
    case "net_banking":
      return "NET_BANKING";
    case "wallet":
    case "app":
      return "WALLET";
    case "cardless_emi":
    case "emi":
      return "EMI";
    case "pay_later":
      return "PAY_LATER";
    case null:
    case undefined:
      return null;
    default:
      return "OTHER";
  }
}

/** Restricts the Cashfree checkout to what the user picked on our screen. */
function cashfreeMethods(method: PaymentMethodKind): string {
  switch (method) {
    case "UPI":
      return "upi";
    case "CARD":
      return "cc,dc";
    case "NET_BANKING":
      return "nb";
    case "WALLET":
      return "app,wallet";
    case "EMI":
      return "emi,cardlessemi";
    case "PAY_LATER":
      return "paylater";
    default:
      return "";
  }
}

function methodDetail(entity: unknown): string | null {
  const group = pickString(entity, "payment_group");
  if (!group) return null;

  const method = pick(entity, "payment_method");
  const detail =
    pickString(method, "upi", "upi_id") ??
    pickString(method, "netbanking", "netbanking_bank_name") ??
    pickString(method, "app", "provider") ??
    [
      pickString(method, "card", "card_network"),
      pickString(method, "card", "card_number")
    ]
      .filter(Boolean)
      .join(" ");

  return detail ? `${group} · ${detail}` : group;
}

function toMinorUnitsOrNull(
  major: number | null,
  currency: string
): number | null {
  return major === null ? null : toMinorUnits(major, currency);
}

/** Cashfree order tags are a flat string map with short values. */
function flattenTags(notes: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(notes)
      .slice(0, 10)
      .map(([key, value]) => [key.slice(0, 40), String(value).slice(0, 250)])
  );
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

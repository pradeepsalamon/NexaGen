import type {
  CheckoutHandoff,
  PaymentMethodKind,
  PaymentProvider,
  PaymentStatus,
  RefundStatus,
  SubscriptionStatus,
  UpiFlow
} from "@nexa-chess/types";

/**
 * The gateway contract. Everything provider-specific — status strings, header
 * names, signature algorithms, amount units — lives behind this interface and
 * never leaks past it. Business logic talks to PaymentService, which talks to
 * PaymentRouter, which picks one of these.
 */

// ── createPayment ──

export type ProviderCustomer = {
  id: string;
  name: string;
  email: string;
  /** E.164 digits, no "+". Absent when the user never gave one. */
  phone?: string;
};

export type CreatePaymentInput = {
  /** Our payment row id — always passed as the provider's idempotency key. */
  paymentId: string;
  orderId: string;
  orderNumber: string;
  /** Minor units. */
  amount: number;
  currency: string;
  /** What the user picked. A hint: the gateway still decides what it shows. */
  method?: PaymentMethodKind;
  description: string;
  customer: ProviderCustomer;
  /** Absolute URL the provider returns the browser to. */
  returnUrl: string;
  notes: Record<string, string>;
};

export type PaymentResult = {
  /** Set only by providers that mint a payment id up front. */
  providerPaymentId: string | null;
  providerOrderId: string;
  status: PaymentStatus;
  /** How the browser is handed to the gateway. Carries no secret. */
  handoff: CheckoutHandoff;
};

// ── getPayment / verifyPayment ──

export type PaymentDetails = {
  providerPaymentId: string | null;
  providerOrderId: string | null;
  status: PaymentStatus;
  method: PaymentMethodKind | null;
  methodDetail: string | null;
  /** Minor units, as the provider reports them. */
  amount: number | null;
  amountRefunded: number;
  currency: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  paidAt: Date | null;
  /** Raw provider payload, stored on the payment for support and disputes. */
  raw: unknown;
};

export type VerifyPaymentInput = {
  paymentId: string;
  providerPaymentId?: string;
  providerOrderId?: string;
  /** Provider-signed handshake from the browser, where the SDK returns one. */
  signature?: string;
};

export type PaymentVerificationResult = {
  /**
   * Whether the handshake itself checked out. False does NOT mean the payment
   * failed — it means the browser's claim proves nothing, so only `details`
   * (fetched server-side) may be trusted.
   */
  verified: boolean;
  reason: string | null;
  /** Authoritative state, fetched from the provider, not from the client. */
  details: PaymentDetails | null;
};

// ── refundPayment ──

export type RefundPaymentInput = {
  refundId: string;
  providerPaymentId: string;
  /** Minor units. */
  amount: number;
  currency: string;
  reason: string;
  notes?: Record<string, string>;
};

export type RefundResult = {
  providerRefundId: string | null;
  /**
   * Never SUCCEEDED merely because the request was accepted — a provider that
   * only acknowledges maps to PENDING/PROCESSING and settles by webhook.
   */
  status: RefundStatus;
  amount: number;
  raw: unknown;
};

// ── handleWebhook ──

export type WebhookInput = {
  /** Exact bytes as received. Re-serialising breaks every signature scheme. */
  rawBody: string;
  headers: Record<string, string | string[] | undefined>;
};

/** What a webhook is about, in our vocabulary rather than the provider's. */
export type WebhookSubject =
  | "PAYMENT"
  | "REFUND"
  | "SUBSCRIPTION"
  | "UNKNOWN";

export type WebhookResult = {
  /** Stable per event. Falls back to a payload hash where none is sent. */
  eventId: string;
  eventType: string;
  signatureValid: boolean;
  subject: WebhookSubject;
  /** Handles to match against our rows. */
  providerPaymentId: string | null;
  providerOrderId: string | null;
  providerRefundId: string | null;
  providerSubscriptionId: string | null;
  /** Our payment id, when the provider echoed our notes/metadata back. */
  paymentId: string | null;
  /** Mapped state this event asserts. Null when the event carries none. */
  paymentStatus: PaymentStatus | null;
  refundStatus: RefundStatus | null;
  subscriptionStatus: SubscriptionStatus | null;
  method: PaymentMethodKind | null;
  methodDetail: string | null;
  amount: number | null;
  amountRefunded: number | null;
  currency: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  paidAt: Date | null;
  /** Subscription renewals carry the next cycle boundary. */
  nextBillingDate: Date | null;
  raw: unknown;
};

// ── Subscriptions (optional capability) ──

export type CreateSubscriptionInput = {
  subscriptionId: string;
  planName: string;
  planCode: string;
  amount: number;
  currency: string;
  intervalMonths: number;
  customer: ProviderCustomer;
  returnUrl: string;
  notes: Record<string, string>;
};

export type SubscriptionResult = {
  providerSubscriptionId: string;
  providerCustomerId: string | null;
  status: SubscriptionStatus;
  handoff: CheckoutHandoff;
  nextBillingDate: Date | null;
};

export type CancelSubscriptionInput = {
  providerSubscriptionId: string;
  atPeriodEnd: boolean;
};

/**
 * Implemented by RazorpayProvider, CashfreeProvider and StripeProvider.
 *
 * Every method makes ONE network attempt. Retries belong to the caller (a
 * reconciliation sweep or a queued job) so an HTTP request never blocks on
 * provider backoff.
 */
export interface PaymentProviderAdapter {
  readonly id: PaymentProvider;

  /** False when credentials are unset. The router skips unconfigured gateways. */
  isConfigured(): boolean;

  /** Methods this gateway can serve for the given currency. */
  supportedMethods(currency: string): PaymentMethodKind[];

  /** UPI sub-flows this gateway offers. Empty when it cannot do UPI. */
  upiFlows(currency: string): UpiFlow[];

  /** True when this gateway can mandate recurring charges in this currency. */
  supportsRecurring(currency: string): boolean;

  createPayment(input: CreatePaymentInput): Promise<PaymentResult>;

  verifyPayment(input: VerifyPaymentInput): Promise<PaymentVerificationResult>;

  getPayment(
    providerPaymentId: string,
    providerOrderId?: string | null
  ): Promise<PaymentDetails>;

  refundPayment(input: RefundPaymentInput): Promise<RefundResult>;

  handleWebhook(input: WebhookInput): Promise<WebhookResult>;

  createSubscription?(
    input: CreateSubscriptionInput
  ): Promise<SubscriptionResult>;

  cancelSubscription?(input: CancelSubscriptionInput): Promise<void>;
}

/** Thrown by an adapter. `retryable` decides whether a sweep tries again. */
export class PaymentProviderError extends Error {
  constructor(
    readonly provider: PaymentProvider,
    readonly operation: string,
    message: string,
    readonly options: {
      code?: string | null;
      statusCode?: number | null;
      retryable?: boolean;
    } = {}
  ) {
    super(message);
    this.name = "PaymentProviderError";
  }

  get code(): string | null {
    return this.options.code ?? null;
  }

  get statusCode(): number | null {
    return this.options.statusCode ?? null;
  }

  get retryable(): boolean {
    return this.options.retryable ?? false;
  }
}

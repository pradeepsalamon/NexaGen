import { z } from "zod";

// ──────────────────────────────────────────────────────────────
// Payments — shared contract
// ──────────────────────────────────────────────────────────────
// NexaChess is provider-agnostic: business logic only ever talks to
// PaymentService, which talks to a PaymentRouter, which picks one of
// Razorpay / Cashfree / Stripe. Nothing outside apps/api/src/payments/providers
// may reference a provider-specific status string.
//
// MONEY IS ALWAYS INTEGER MINOR UNITS (paise, cents). Never a float: 999.00
// rupees is 99900. `formatMoney` is the only thing that turns it into text.

// ── Providers ──

export const paymentProviderSchema = z.enum(["RAZORPAY", "CASHFREE", "STRIPE"]);
export type PaymentProvider = z.infer<typeof paymentProviderSchema>;

export const PAYMENT_PROVIDERS = paymentProviderSchema.options;

export const PAYMENT_PROVIDER_LABELS: Record<PaymentProvider, string> = {
  RAZORPAY: "Razorpay",
  CASHFREE: "Cashfree",
  STRIPE: "Stripe"
};

// ── Unified payment state model ──
//
// Provider statuses map into this and nothing else. The rank is what makes
// out-of-order webhooks safe: a webhook may only move a payment to a state of
// equal or higher rank, so a late "pending" can never un-pay a PAID payment.

export const paymentStatusSchema = z.enum([
  "CREATED",
  "PENDING",
  "PROCESSING",
  "AUTHORIZED",
  "PAID",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
  "REFUND_PENDING",
  "PARTIALLY_REFUNDED",
  "REFUNDED"
]);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const PAYMENT_STATUSES = paymentStatusSchema.options;

/**
 * Monotonic progress rank. Higher wins when two events disagree.
 *
 * FAILED / CANCELLED / EXPIRED sit *below* AUTHORIZED and PAID on purpose: a
 * provider that reports a failed attempt after a successful capture (a retried
 * attempt on the same order, a stale queued webhook) must not revoke access.
 */
export const PAYMENT_STATUS_RANK: Record<PaymentStatus, number> = {
  CREATED: 0,
  PENDING: 10,
  PROCESSING: 20,
  FAILED: 30,
  CANCELLED: 31,
  EXPIRED: 32,
  AUTHORIZED: 40,
  PAID: 50,
  REFUND_PENDING: 60,
  PARTIALLY_REFUNDED: 70,
  REFUNDED: 80
};

/** Nothing further is expected from the provider. */
export const TERMINAL_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  "FAILED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED"
];

export function isTerminalPaymentStatus(status: PaymentStatus): boolean {
  return TERMINAL_PAYMENT_STATUSES.includes(status);
}

/** Money reached us and has not been fully returned. */
export function isSettledPaymentStatus(status: PaymentStatus): boolean {
  return (
    status === "PAID" ||
    status === "REFUND_PENDING" ||
    status === "PARTIALLY_REFUNDED" ||
    status === "REFUNDED"
  );
}

/** The user should be told to wait rather than pay again. */
export function isInFlightPaymentStatus(status: PaymentStatus): boolean {
  return (
    status === "CREATED" ||
    status === "PENDING" ||
    status === "PROCESSING" ||
    status === "AUTHORIZED"
  );
}

/**
 * Whether an inbound status may overwrite the stored one. A lower rank is
 * rejected outright — that is the out-of-order webhook case.
 */
export function canTransitionPaymentStatus(
  from: PaymentStatus,
  to: PaymentStatus
): boolean {
  if (from === to) return false;
  if (from === "REFUNDED") return false;
  return PAYMENT_STATUS_RANK[to] > PAYMENT_STATUS_RANK[from];
}

// ── Order state ──

export const orderStatusSchema = z.enum([
  "CREATED",
  "PENDING",
  "PAID",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
  "CANCELLED",
  "EXPIRED",
  "FAILED"
]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

/** An order's status is derived from its payments, never set by a client. */
export function orderStatusForPayment(status: PaymentStatus): OrderStatus {
  switch (status) {
    case "PAID":
    case "REFUND_PENDING":
      return "PAID";
    case "PARTIALLY_REFUNDED":
      return "PARTIALLY_REFUNDED";
    case "REFUNDED":
      return "REFUNDED";
    case "CANCELLED":
      return "CANCELLED";
    case "EXPIRED":
      return "EXPIRED";
    case "FAILED":
      return "FAILED";
    default:
      return "PENDING";
  }
}

// ── Payment methods ──

export const paymentMethodKindSchema = z.enum([
  "UPI",
  "CARD",
  "NET_BANKING",
  "WALLET",
  "EMI",
  "PAY_LATER",
  "APPLE_PAY",
  "GOOGLE_PAY",
  "OTHER"
]);
export type PaymentMethodKind = z.infer<typeof paymentMethodKindSchema>;

export const PAYMENT_METHOD_KINDS = paymentMethodKindSchema.options;

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodKind, string> = {
  UPI: "UPI",
  CARD: "Cards",
  NET_BANKING: "Net Banking",
  WALLET: "Wallets",
  EMI: "EMI",
  PAY_LATER: "Pay Later",
  APPLE_PAY: "Apple Pay",
  GOOGLE_PAY: "Google Pay",
  OTHER: "Other"
};

/**
 * What the checkout screen says under each option. Deliberately generic — we
 * never promise a named UPI app, because which apps appear is the gateway's
 * answer, not ours.
 */
export const PAYMENT_METHOD_HINTS: Record<PaymentMethodKind, string> = {
  UPI: "Pay from any UPI app, or scan a QR code",
  CARD: "Credit or debit card",
  NET_BANKING: "Pay directly from your bank account",
  WALLET: "Pay from a supported wallet balance",
  EMI: "Split the payment, where your bank supports it",
  PAY_LATER: "Pay later, where your provider supports it",
  APPLE_PAY: "Pay with Apple Pay",
  GOOGLE_PAY: "Pay with Google Pay",
  OTHER: "Other supported payment methods"
};

/** UPI sub-flow the gateway offers. Never implemented by us directly. */
export const upiFlowSchema = z.enum(["INTENT", "QR", "COLLECT", "CHECKOUT"]);
export type UpiFlow = z.infer<typeof upiFlowSchema>;

// ── Currency & money ──

export const currencySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Expected a 3-letter ISO 4217 currency code.");

/** Currencies with no minor unit — the amount IS the major unit. */
const ZERO_DECIMAL_CURRENCIES = new Set(["JPY", "KRW", "VND", "CLP", "ISK"]);

export function currencyMinorUnitFactor(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 1 : 100;
}

/** Minor units → major units, as a number safe to hand a formatter. */
export function toMajorUnits(minor: number, currency: string): number {
  return minor / currencyMinorUnitFactor(currency);
}

/** Major units → minor units, rounded rather than truncated. */
export function toMinorUnits(major: number, currency: string): number {
  return Math.round(major * currencyMinorUnitFactor(currency));
}

/**
 * Human money. `locale` defaults to en-IN for INR and en-US otherwise, so the
 * Indian digit grouping (₹1,23,456) comes out right without the caller
 * thinking about it.
 */
export function formatMoney(
  minor: number,
  currency: string,
  locale?: string
): string {
  const code = currency.toUpperCase();
  const resolvedLocale = locale ?? (code === "INR" ? "en-IN" : "en-US");
  const factor = currencyMinorUnitFactor(code);

  return new Intl.NumberFormat(resolvedLocale, {
    style: "currency",
    currency: code,
    minimumFractionDigits: factor === 1 ? 0 : 2,
    maximumFractionDigits: factor === 1 ? 0 : 2
  }).format(minor / factor);
}

/** Percent of a minor-unit amount, rounded to the nearest minor unit. */
export function percentOf(minor: number, percent: number): number {
  return Math.round((minor * percent) / 100);
}

// ── Billing / plans ──

export const billingIntervalSchema = z.enum([
  "ONE_TIME",
  "MONTHLY",
  "QUARTERLY",
  "YEARLY"
]);
export type BillingInterval = z.infer<typeof billingIntervalSchema>;

export const BILLING_INTERVAL_LABELS: Record<BillingInterval, string> = {
  ONE_TIME: "One-time",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly"
};

/** Months per billing cycle. ONE_TIME has none — it never renews. */
export const BILLING_INTERVAL_MONTHS: Record<BillingInterval, number | null> = {
  ONE_TIME: null,
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12
};

export function isRecurringInterval(interval: BillingInterval): boolean {
  return interval !== "ONE_TIME";
}

export const subscriptionStatusSchema = z.enum([
  "CREATED",
  "PENDING_ACTIVATION",
  "ACTIVE",
  "PAST_DUE",
  "PAUSED",
  "CANCELLED",
  "EXPIRED"
]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

/** PAST_DUE still has access — the dunning window is deliberate. */
export function isActiveSubscriptionStatus(status: SubscriptionStatus): boolean {
  return status === "ACTIVE" || status === "PAST_DUE";
}

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  CREATED: "Not started",
  PENDING_ACTIVATION: "Awaiting first payment",
  ACTIVE: "Active",
  PAST_DUE: "Payment overdue",
  PAUSED: "Paused",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired"
};

// ── Refunds ──

export const refundStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED"
]);
export type RefundStatus = z.infer<typeof refundStatusSchema>;

export const REFUND_STATUS_LABELS: Record<RefundStatus, string> = {
  PENDING: "Refund requested",
  PROCESSING: "Refund processing",
  SUCCEEDED: "Refunded",
  FAILED: "Refund failed",
  CANCELLED: "Refund cancelled"
};

// ── Entitlements (the §21 access boundary) ──

export const entitlementStatusSchema = z.enum(["ACTIVE", "EXPIRED", "REVOKED"]);
export type EntitlementStatus = z.infer<typeof entitlementStatusSchema>;

// ── Webhook bookkeeping ──

export const webhookEventStatusSchema = z.enum([
  "RECEIVED",
  "PROCESSED",
  "IGNORED",
  "FAILED"
]);
export type WebhookEventStatus = z.infer<typeof webhookEventStatusSchema>;

// ──────────────────────────────────────────────────────────────
// Smart routing
// ──────────────────────────────────────────────────────────────
// The frontend never names a provider. It says "India + UPI" (implicitly, via
// currency + chosen method) and the router answers. Admins edit the rule list;
// nothing in business logic changes.

export const routingRuleSchema = z.object({
  /** Stable id so the admin UI can reorder without re-keying. */
  id: z.string().trim().min(1).max(60),
  label: z.string().trim().min(1).max(120),
  /** Empty = matches any currency. */
  currencies: z.array(currencySchema).default([]),
  /** Empty = matches any method. */
  methods: z.array(paymentMethodKindSchema).default([]),
  /** First entry is primary; the rest are fallbacks, in order. */
  providers: z.array(paymentProviderSchema).min(1),
  enabled: z.boolean().default(true)
});
export type RoutingRule = z.infer<typeof routingRuleSchema>;

/**
 * Platform-wide switch for one payment method.
 *
 * Money is deliberately NOT configurable here — a method-specific offer ("10%
 * off on UPI") is a Discount with a `methods` scope, so there is exactly one
 * mechanism that changes what someone pays, and one place it is audited.
 */
export const paymentMethodSettingSchema = z.object({
  enabled: z.boolean().default(true),
  /** Replaces the default line under the method on the checkout screen. */
  note: z.string().trim().max(160).optional()
});
export type PaymentMethodSetting = z.infer<typeof paymentMethodSettingSchema>;

export const paymentRoutingConfigSchema = z.object({
  rules: z.array(routingRuleSchema).max(40).default([]),
  /**
   * Per-method switches. A method absent from the map is enabled — so adding a
   * method to PAYMENT_METHOD_KINDS never silently disables it on an existing
   * install.
   */
  methodSettings: z
    // partialRecord, not record: a full Record would force every method to be
    // listed, which is exactly the "new method silently disabled" trap.
    .partialRecord(paymentMethodKindSchema, paymentMethodSettingSchema)
    .default({}),
  /** Used when no rule matches. */
  defaultProviders: z.array(paymentProviderSchema).min(1).default(["STRIPE"]),
  /**
   * Whether the router may hand a *new attempt* to the next provider after a
   * failure. Off by default: §17 — never re-route while it is unclear whether
   * the original attempt debited the customer.
   */
  failoverEnabled: z.boolean().default(false)
});
export type PaymentRoutingConfig = z.infer<typeof paymentRoutingConfigSchema>;

/**
 * Ships matching the documented strategy: India + UPI → Razorpay with a
 * Cashfree fallback; India + anything → Razorpay; everything else → Stripe.
 */
export const DEFAULT_PAYMENT_ROUTING: PaymentRoutingConfig = {
  // Every method ships on; an admin turns off what the academy does not want.
  methodSettings: {},
  rules: [
    {
      id: "india-upi",
      label: "India · UPI",
      currencies: ["INR"],
      methods: ["UPI"],
      providers: ["RAZORPAY", "CASHFREE"],
      enabled: true
    },
    {
      id: "india-cards",
      label: "India · Cards & EMI",
      currencies: ["INR"],
      methods: ["CARD", "EMI"],
      providers: ["RAZORPAY", "CASHFREE"],
      enabled: true
    },
    {
      id: "india-other",
      label: "India · Net banking & wallets",
      currencies: ["INR"],
      methods: ["NET_BANKING", "WALLET", "PAY_LATER"],
      providers: ["RAZORPAY", "CASHFREE"],
      enabled: true
    },
    {
      id: "india-any",
      label: "India · Anything else",
      currencies: ["INR"],
      methods: [],
      providers: ["RAZORPAY", "CASHFREE"],
      enabled: true
    },
    {
      id: "international",
      label: "International",
      currencies: [],
      methods: [],
      providers: ["STRIPE"],
      enabled: true
    }
  ],
  defaultProviders: ["STRIPE"],
  failoverEnabled: false
};

export type RoutingRequest = {
  currency: string;
  method?: PaymentMethodKind;
  /**
   * A recurring plan needs a gateway that can hold a mandate for this method.
   * The caller supplies the set that can; the router intersects with it.
   */
  recurringCapable?: PaymentProvider[];
  /** Providers that are unconfigured or unhealthy right now. */
  unavailable?: PaymentProvider[];
  /** Providers already tried for this order — never offered again. */
  exclude?: PaymentProvider[];
};

export type RoutingDecision = {
  provider: PaymentProvider;
  /** Providers to try next, in order, if this one is unusable. */
  fallbacks: PaymentProvider[];
  /** Id of the rule that matched, or null when `defaultProviders` answered. */
  ruleId: string | null;
};

/**
 * Pure routing. Shared so the admin UI previews exactly what the server would
 * pick — there is no second implementation to drift.
 *
 * Returns null when every candidate is excluded or unavailable; the caller
 * decides whether that is a 503 or a "choose another method".
 */
export function resolvePaymentProvider(
  config: PaymentRoutingConfig,
  request: RoutingRequest
): RoutingDecision | null {
  const currency = request.currency.toUpperCase();

  // An admin switching a method off takes it out everywhere at once — the
  // picker, the router and any direct call.
  if (request.method && !isMethodEnabled(config, request.method)) {
    return null;
  }

  const blocked = new Set<PaymentProvider>([
    ...(request.unavailable ?? []),
    ...(request.exclude ?? [])
  ]);

  const matched = config.rules.find((rule) => {
    if (!rule.enabled) return false;
    if (rule.currencies.length > 0 && !rule.currencies.includes(currency)) {
      return false;
    }
    if (
      rule.methods.length > 0 &&
      (!request.method || !rule.methods.includes(request.method))
    ) {
      return false;
    }
    return true;
  });

  const recurringCapable = request.recurringCapable
    ? new Set(request.recurringCapable)
    : null;

  const candidates = (matched?.providers ?? config.defaultProviders).filter(
    (provider) =>
      !blocked.has(provider) &&
      // A one-off gateway can never carry a subscription, however well it
      // matches the rule.
      (!recurringCapable || recurringCapable.has(provider))
  );

  const [provider, ...fallbacks] = candidates;
  if (!provider) return null;

  return {
    provider,
    fallbacks: config.failoverEnabled ? fallbacks : [],
    ruleId: matched?.id ?? null
  };
}

/** Absent from the map means enabled — a new method is never off by surprise. */
export function isMethodEnabled(
  config: PaymentRoutingConfig,
  method: PaymentMethodKind
): boolean {
  return config.methodSettings[method]?.enabled !== false;
}

/** The admin's override for a method's checkout line, or the built-in hint. */
export function methodNote(
  config: PaymentRoutingConfig,
  method: PaymentMethodKind
): string {
  return config.methodSettings[method]?.note?.trim() || PAYMENT_METHOD_HINTS[method];
}

// ──────────────────────────────────────────────────────────────
// Requests & responses
// ──────────────────────────────────────────────────────────────

// ── Plans ──

export const createPlanRequestSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9][a-z0-9_-]*$/, "Use lowercase letters, digits, - and _."),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  /** Minor units. 99900 = ₹999.00. */
  amount: z.number().int().nonnegative().max(100_000_000),
  currency: currencySchema.default("INR"),
  interval: billingIntervalSchema.default("ONE_TIME"),
  /** Access granted per purchase, in days. Null = for the billing interval. */
  accessDays: z.number().int().positive().max(3650).nullable().optional(),
  /** GST / VAT percent applied on top of `amount`. */
  taxPercent: z.number().min(0).max(50).default(0),
  /** Batch a successful purchase enrols the student into. */
  batchId: z.string().trim().min(1).nullable().optional(),
  /**
   * Methods this plan accepts. Empty = whatever the gateways can serve. Always
   * intersected with the platform-wide switches, so it can narrow but never
   * widen what is on offer.
   */
  allowedMethods: z.array(paymentMethodKindSchema).default([]),
  features: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(9999).default(0)
});
export type CreatePlanRequest = z.infer<typeof createPlanRequestSchema>;

export const updatePlanRequestSchema = createPlanRequestSchema
  .omit({ code: true })
  .partial();
export type UpdatePlanRequest = z.infer<typeof updatePlanRequestSchema>;

export type PlanItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  amount: number;
  currency: string;
  interval: BillingInterval;
  accessDays: number | null;
  taxPercent: number;
  batchId: string | null;
  batchName: string | null;
  allowedMethods: PaymentMethodKind[];
  features: string[];
  isActive: boolean;
  sortOrder: number;
  /** Live count, so an admin can see what archiving would strand. */
  activeSubscriptions: number;
  createdAt: string;
  updatedAt: string;
};

export type PlanListResponse = { plans: PlanItem[] };

// ── Checkout ──

export const createCheckoutRequestSchema = z.object({
  planId: z.string().trim().min(1),
  /**
   * What the user picked on the checkout screen. The router uses it to choose
   * a gateway; the gateway still decides which concrete options it shows.
   */
  method: paymentMethodKindSchema.optional(),
  /** Overrides the plan currency for international buyers. */
  currency: currencySchema.optional(),
  /**
   * Client-generated, stable for one checkout intent. A double click, a
   * refresh, or a second tab replays the same key and gets the same order back
   * instead of creating another one.
   */
  idempotencyKey: z.string().trim().min(8).max(120),
  /** Re-validated and re-priced server-side; the client's figures are ignored. */
  discountCode: z.string().trim().toUpperCase().max(40).optional(),
  /** Where the provider should send the browser back to. Path only. */
  returnPath: z
    .string()
    .trim()
    .max(300)
    .regex(/^\/[^\s]*$/, "Expected an absolute path like /student/billing.")
    .optional()
});
export type CreateCheckoutRequest = z.infer<typeof createCheckoutRequestSchema>;

/** How the browser must hand off to the gateway. */
export const checkoutHandoffKindSchema = z.enum([
  /** Load the provider's JS and open its modal (Razorpay, Cashfree). */
  "SDK",
  /** Navigate away to a provider-hosted page (Stripe Checkout, payment links). */
  "REDIRECT",
  /** Render a QR we were handed, and poll (UPI QR). */
  "QR"
]);
export type CheckoutHandoffKind = z.infer<typeof checkoutHandoffKindSchema>;

export type CheckoutHandoff = {
  kind: CheckoutHandoffKind;
  provider: PaymentProvider;
  /** Publishable/public key only. A secret key must never reach this type. */
  publicKey?: string;
  /** Razorpay order id / Cashfree payment_session_id / Stripe session id. */
  providerOrderId?: string;
  /** REDIRECT only. */
  redirectUrl?: string;
  /** QR only — an image data URL, plus the raw upi:// intent string. */
  qrImageUrl?: string;
  qrPayload?: string;
  /** Which environment the provider SDK should boot in. */
  environment?: "sandbox" | "production";
  /** Prefills the provider modal so the user retypes nothing. */
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  /** Method hint passed through to the provider modal. */
  method?: PaymentMethodKind;
  notes?: Record<string, string>;
};

export type CheckoutResponse = {
  orderId: string;
  orderNumber: string;
  paymentId: string;
  attemptId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  /** Set when this checkout opened a recurring mandate rather than one charge. */
  subscriptionId: string | null;
  /** What was actually taken off, as the server computed it. */
  discount: AppliedDiscount | null;
  /** Null when the order was already paid — the client should just refresh. */
  handoff: CheckoutHandoff | null;
  /** True when this replayed an existing order for the same idempotency key. */
  reused: boolean;
  expiresAt: string | null;
};

/** Frontend "success" callback. Advisory only — never grants anything. */
export const verifyPaymentRequestSchema = z.object({
  /** Provider-signed fields, if the SDK handed the browser any. */
  providerPaymentId: z.string().trim().max(200).optional(),
  providerOrderId: z.string().trim().max(200).optional(),
  signature: z.string().trim().max(500).optional()
});
export type VerifyPaymentRequest = z.infer<typeof verifyPaymentRequestSchema>;

export type PaymentStatusResponse = {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  status: PaymentStatus;
  orderStatus: OrderStatus;
  provider: PaymentProvider;
  method: PaymentMethodKind | null;
  amount: number;
  currency: string;
  amountRefunded: number;
  failureCode: string | null;
  failureMessage: string | null;
  paidAt: string | null;
  /** True once the entitlement exists — the only thing that unlocks access. */
  accessGranted: boolean;
  invoiceId: string | null;
  /** True while the client should keep polling rather than offering a retry. */
  pending: boolean;
  /** True when a fresh attempt on the same order is the right next step. */
  retryable: boolean;
  /** Plain-language line for the status card. */
  message: string;
};

// ── Payment history / admin table ──

export type PaymentListItem = {
  id: string;
  createdAt: string;
  paidAt: string | null;
  orderId: string;
  orderNumber: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  planName: string | null;
  amount: number;
  currency: string;
  amountRefunded: number;
  method: PaymentMethodKind | null;
  methodDetail: string | null;
  provider: PaymentProvider;
  providerPaymentId: string | null;
  status: PaymentStatus;
  failureCode: string | null;
  failureMessage: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  attempts: number;
};

export const paymentListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(25),
  search: z.string().trim().max(120).optional(),
  provider: paymentProviderSchema.optional(),
  status: paymentStatusSchema.optional(),
  method: paymentMethodKindSchema.optional(),
  userId: z.string().trim().max(60).optional(),
  orderId: z.string().trim().max(60).optional(),
  /** ISO date-only bounds (YYYY-MM-DD), read in the admin's own timezone. */
  from: z.string().trim().max(30).optional(),
  to: z.string().trim().max(30).optional(),
  /** Minor units. */
  minAmount: z.coerce.number().int().nonnegative().optional(),
  maxAmount: z.coerce.number().int().nonnegative().optional()
});
export type PaymentListQuery = z.infer<typeof paymentListQuerySchema>;

export type PaymentListResponse = {
  payments: PaymentListItem[];
  meta: { total: number; page: number; pageSize: number; totalPages: number };
};

// ── Admin overview ──

export type RevenueByKey = {
  key: string;
  label: string;
  amount: number;
  count: number;
};

export type PaymentOverviewResponse = {
  currency: string;
  totalRevenue: number;
  todayRevenue: number;
  monthRevenue: number;
  successfulPayments: number;
  failedPayments: number;
  pendingPayments: number;
  refundedAmount: number;
  refundCount: number;
  /** 0-100, over the reporting window. */
  successRate: number;
  revenueByMethod: RevenueByKey[];
  revenueByProvider: RevenueByKey[];
  /** Daily net revenue for the last 30 days, in the admin's timezone. */
  revenueTrend: { date: string; amount: number; count: number }[];
  activeSubscriptions: number;
};

// ── Refunds ──

export const createRefundRequestSchema = z.object({
  /** Minor units. Omit for a full refund of the remaining balance. */
  amount: z.number().int().positive().optional(),
  reason: z.string().trim().min(1).max(500),
  /** Whether to revoke the entitlement this payment bought. */
  revokeAccess: z.boolean().default(false)
});
export type CreateRefundRequest = z.infer<typeof createRefundRequestSchema>;

export type RefundItem = {
  id: string;
  paymentId: string;
  orderNumber: string;
  provider: PaymentProvider;
  providerRefundId: string | null;
  amount: number;
  currency: string;
  status: RefundStatus;
  reason: string | null;
  failureMessage: string | null;
  requestedByName: string | null;
  userName: string | null;
  createdAt: string;
  processedAt: string | null;
};

export type RefundListResponse = { refunds: RefundItem[] };

// ── Subscriptions ──

export type SubscriptionItem = {
  id: string;
  userId: string;
  userName: string | null;
  planId: string;
  planName: string;
  provider: PaymentProvider;
  providerSubscriptionId: string | null;
  status: SubscriptionStatus;
  interval: BillingInterval;
  amount: number;
  currency: string;
  startDate: string | null;
  currentPeriodEnd: string | null;
  nextBillingDate: string | null;
  cancelledAt: string | null;
  cancelAtPeriodEnd: boolean;
  failedRenewals: number;
  createdAt: string;
};

export type SubscriptionListResponse = { subscriptions: SubscriptionItem[] };

export const cancelSubscriptionRequestSchema = z.object({
  /** False ends it now; true lets the paid period run out. */
  atPeriodEnd: z.boolean().default(true),
  reason: z.string().trim().max(500).optional()
});
export type CancelSubscriptionRequest = z.infer<
  typeof cancelSubscriptionRequestSchema
>;

// ── Entitlements / my access ──

export type EntitlementItem = {
  id: string;
  planId: string;
  planName: string;
  status: EntitlementStatus;
  batchId: string | null;
  batchName: string | null;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
};

// ── Provider health ──

export type ProviderHealthItem = {
  provider: PaymentProvider;
  configured: boolean;
  /** False when health has taken it out of rotation. */
  available: boolean;
  /** 0-100, or null when nothing was attempted in the window. */
  successRate: number | null;
  failureRate: number | null;
  avgResponseMs: number | null;
  webhookFailures: number;
  attempts: number;
  succeeded: number;
  failed: number;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
  /** Populated when `available` is false. */
  degradedReason: string | null;
};

export type ProviderHealthResponse = {
  windowHours: number;
  providers: ProviderHealthItem[];
};

// ── Public checkout config ──

export type CheckoutMethodOption = {
  kind: PaymentMethodKind;
  label: string;
  hint: string;
  provider: PaymentProvider;
  /** UPI only — which sub-flows this provider offers. */
  upiFlows: UpiFlow[];
};

/** Everything the checkout page needs before the user picks anything. */
export type CheckoutConfigResponse = {
  plan: PlanItem;
  currency: string;
  subtotal: number;
  taxAmount: number;
  taxPercent: number;
  taxLabel: string | null;
  total: number;
  /** Only the methods a configured, healthy provider can actually serve. */
  methods: CheckoutMethodOption[];
  /** Set once the buyer has applied a code. Recomputed on every change. */
  discount: AppliedDiscount | null;
  /** Other price options on the same batch — one-time beside monthly. */
  alternatives: PlanItem[];
  /** True when buying this opens a recurring mandate. */
  recurring: boolean;
  /** A payment already in flight. Offer "check status", not "pay". */
  pendingPaymentId: string | null;
  /** An ACTIVE entitlement for this plan already exists. */
  alreadyOwned: boolean;
  /** An active subscription to this plan already exists. */
  alreadySubscribed: boolean;
};

// ──────────────────────────────────────────────────────────────
// Discounts
// ──────────────────────────────────────────────────────────────
// A discount is the ONE mechanism that changes what someone pays. Per-method
// offers ("10% off on UPI"), launch codes, and batch-specific deals are all the
// same object with a different scope — so there is a single place to audit why
// an order cost what it did.
//
// It is always computed server-side. The client renders a preview using the
// same `computeDiscount` below, but the order's `discountAmount` only ever
// comes from the server.

export const discountTypeSchema = z.enum(["PERCENTAGE", "FIXED"]);
export type DiscountType = z.infer<typeof discountTypeSchema>;

/** Why a code was turned down. The UI maps these to a sentence. */
export const discountRejectionSchema = z.enum([
  "NOT_FOUND",
  "INACTIVE",
  "NOT_STARTED",
  "EXPIRED",
  "USAGE_LIMIT_REACHED",
  "ALREADY_USED",
  "PLAN_NOT_ELIGIBLE",
  "METHOD_NOT_ELIGIBLE",
  "BELOW_MINIMUM",
  "CURRENCY_MISMATCH"
]);
export type DiscountRejection = z.infer<typeof discountRejectionSchema>;

export const DISCOUNT_REJECTION_MESSAGES: Record<DiscountRejection, string> = {
  NOT_FOUND: "That code is not recognised.",
  INACTIVE: "That code is no longer active.",
  NOT_STARTED: "That code is not valid yet.",
  EXPIRED: "That code has expired.",
  USAGE_LIMIT_REACHED: "That code has been fully claimed.",
  ALREADY_USED: "You have already used that code.",
  PLAN_NOT_ELIGIBLE: "That code does not apply to this plan.",
  METHOD_NOT_ELIGIBLE:
    "That code only applies to certain payment methods. Choose another method to use it.",
  BELOW_MINIMUM: "This order is below the minimum for that code.",
  CURRENCY_MISMATCH: "That code cannot be used in this currency."
};

export const createDiscountRequestSchema = z.object({
  /** Stored and matched uppercase, so "diwali25" and "DIWALI25" are one code. */
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(3)
    .max(40)
    .regex(/^[A-Z0-9][A-Z0-9_-]*$/, "Use letters, digits, - and _."),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  type: discountTypeSchema,
  /**
   * PERCENTAGE: whole percent, 1-100. FIXED: minor units.
   * Validated against the type in `discountValueIssue`.
   */
  value: z.number().int().positive(),
  /** FIXED only — the code is refused in any other currency. */
  currency: currencySchema.nullable().optional(),
  /** PERCENTAGE only: the most this code may ever take off. Minor units. */
  maxDiscountAmount: z.number().int().positive().nullable().optional(),
  /** Minimum order subtotal for the code to apply. Minor units. */
  minOrderAmount: z.number().int().nonnegative().nullable().optional(),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  /** Total redemptions across everyone. Null = unlimited. */
  maxRedemptions: z.number().int().positive().nullable().optional(),
  /** Redemptions per account. */
  maxPerUser: z.number().int().positive().default(1),
  /** Empty = every plan. */
  planIds: z.array(z.string().trim().min(1)).max(100).default([]),
  /** Empty = every batch. Matched through the plan's batch. */
  batchIds: z.array(z.string().trim().min(1)).max(100).default([]),
  /** Empty = every method. This is how a UPI-only offer is expressed. */
  methods: z.array(paymentMethodKindSchema).default([]),
  isActive: z.boolean().default(true)
});
export type CreateDiscountRequest = z.infer<typeof createDiscountRequestSchema>;

export const updateDiscountRequestSchema = createDiscountRequestSchema
  .omit({ code: true })
  .partial();
export type UpdateDiscountRequest = z.infer<typeof updateDiscountRequestSchema>;

export type DiscountItem = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  type: DiscountType;
  value: number;
  currency: string | null;
  maxDiscountAmount: number | null;
  minOrderAmount: number | null;
  startsAt: string | null;
  endsAt: string | null;
  maxRedemptions: number | null;
  maxPerUser: number;
  redemptionCount: number;
  planIds: string[];
  batchIds: string[];
  methods: PaymentMethodKind[];
  isActive: boolean;
  /** Resolved names, so the admin table reads without a second fetch. */
  planNames: string[];
  batchNames: string[];
  createdAt: string;
  updatedAt: string;
};

export type DiscountListResponse = { discounts: DiscountItem[] };

/**
 * A percentage code with a value over 100, or a fixed code with no currency,
 * is nonsense the form should catch. Returns null when the pair is coherent.
 */
export function discountValueIssue(input: {
  type: DiscountType;
  value: number;
  currency?: string | null;
}): string | null {
  if (input.type === "PERCENTAGE") {
    if (input.value > 100) return "A percentage discount cannot exceed 100%.";
    return null;
  }
  if (!input.currency) {
    return "A fixed-amount discount needs a currency.";
  }
  return null;
}

/**
 * What a discount takes off a subtotal. Pure, shared, and the ONLY place the
 * arithmetic lives — the checkout preview and the order the server writes come
 * from this same function, so they cannot disagree.
 *
 * Never returns more than the subtotal: a code worth more than the order makes
 * it free, not negative.
 */
export function computeDiscount(
  subtotal: number,
  discount: Pick<DiscountItem, "type" | "value" | "maxDiscountAmount">
): number {
  const raw =
    discount.type === "PERCENTAGE"
      ? percentOf(subtotal, discount.value)
      : discount.value;

  const capped =
    discount.type === "PERCENTAGE" && discount.maxDiscountAmount
      ? Math.min(raw, discount.maxDiscountAmount)
      : raw;

  return Math.max(0, Math.min(capped, subtotal));
}

/** One-line summary for a table row: "25% off, up to ₹500". */
export function describeDiscount(
  discount: Pick<
    DiscountItem,
    "type" | "value" | "currency" | "maxDiscountAmount"
  >,
  fallbackCurrency = "INR"
): string {
  if (discount.type === "FIXED") {
    return `${formatMoney(discount.value, discount.currency ?? fallbackCurrency)} off`;
  }
  const cap = discount.maxDiscountAmount
    ? `, up to ${formatMoney(discount.maxDiscountAmount, discount.currency ?? fallbackCurrency)}`
    : "";
  return `${discount.value}% off${cap}`;
}

/** Applied discount as the checkout screen and the order both see it. */
export type AppliedDiscount = {
  id: string;
  code: string;
  name: string;
  type: DiscountType;
  /** Minor units actually taken off this order. */
  amount: number;
};

export const applyDiscountRequestSchema = z.object({
  planId: z.string().trim().min(1),
  code: z.string().trim().toUpperCase().min(1).max(40),
  /** A method-scoped code only applies once the buyer has chosen that method. */
  method: paymentMethodKindSchema.optional(),
  currency: currencySchema.optional()
});
export type ApplyDiscountRequest = z.infer<typeof applyDiscountRequestSchema>;

export type ApplyDiscountResponse =
  | {
      valid: true;
      discount: AppliedDiscount;
      /** The full recomputed total, so the screen never does the maths. */
      subtotal: number;
      discountAmount: number;
      taxAmount: number;
      total: number;
      currency: string;
    }
  | { valid: false; reason: DiscountRejection; message: string };

// ──────────────────────────────────────────────────────────────
// Per-batch pricing
// ──────────────────────────────────────────────────────────────
// A batch's price options ARE Plan rows with that `batchId` — there is no
// second pricing model. The admin edits them from the batch, which is where
// they think about price, and the checkout reads them as ordinary plans.

export type BatchPricingResponse = {
  batchId: string;
  batchName: string;
  /** Ordered by sortOrder; a batch may offer one-time AND monthly side by side. */
  plans: PlanItem[];
};

export const createBatchPlanRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).optional(),
  /** Minor units. */
  amount: z.number().int().nonnegative().max(100_000_000),
  currency: currencySchema.default("INR"),
  interval: billingIntervalSchema.default("ONE_TIME"),
  accessDays: z.number().int().positive().max(3650).nullable().optional(),
  taxPercent: z.number().min(0).max(50).default(0),
  /** Empty = every method the gateways can serve. */
  allowedMethods: z.array(paymentMethodKindSchema).default([]),
  features: z.array(z.string().trim().min(1).max(160)).max(20).default([]),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(9999).default(0)
});
export type CreateBatchPlanRequest = z.infer<typeof createBatchPlanRequestSchema>;

// ── UX copy ──
//
// Kept here so the checkout page, the billing page and the admin table all say
// the same thing about the same state.

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  CREATED: "Not started",
  PENDING: "Payment pending",
  PROCESSING: "Payment processing",
  AUTHORIZED: "Authorised",
  PAID: "Paid",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  REFUND_PENDING: "Refund processing",
  PARTIALLY_REFUNDED: "Partially refunded",
  REFUNDED: "Refunded"
};

export const PAYMENT_STATUS_MESSAGES: Record<PaymentStatus, string> = {
  CREATED: "We have not received this payment yet.",
  PENDING:
    "We are waiting for your bank to confirm this payment. Do not make another payment while we verify the current transaction.",
  PROCESSING:
    "Your payment is being processed. Do not make another payment while we verify the current transaction.",
  AUTHORIZED: "Your payment is authorised and is being captured.",
  PAID: "Payment successful.",
  FAILED: "Your payment could not be completed.",
  CANCELLED: "This payment was cancelled.",
  EXPIRED: "This payment window expired. Start a new payment when you are ready.",
  REFUND_PENDING:
    "Your refund is on its way. Banks usually take 5-7 working days.",
  PARTIALLY_REFUNDED: "Part of this payment has been refunded.",
  REFUNDED: "This payment has been refunded in full."
};

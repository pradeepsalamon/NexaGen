import { z } from "zod";

/**
 * SaaS Phase 6 (docs/SAAS_MULTI_TENANCY.md §G "Two money flows").
 *
 * 1. Academy → owner: the academy's super admin pays its plan through the
 *    owner's Razorpay account; the owner issues a GST invoice.
 * 2. Student → academy: each academy connects its own gateway keys; webhooks
 *    arrive on a per-academy URL and are verified with that academy's secret.
 */

// ── Student gateways, per academy ──────────────────────────────────────────

export const TENANT_GATEWAY_PROVIDERS = ["RAZORPAY", "CASHFREE", "STRIPE"] as const;
export const tenantGatewayProviderSchema = z.enum(TENANT_GATEWAY_PROVIDERS);
export type TenantGatewayProvider = z.infer<typeof tenantGatewayProviderSchema>;

/** What each gateway calls the public key and the two secrets, for the settings form. */
export const TENANT_GATEWAY_FIELD_LABELS: Record<
  TenantGatewayProvider,
  { publicKey: string; keySecret: string; webhookSecret: string }
> = {
  CASHFREE: { keySecret: "Secret key", publicKey: "App ID", webhookSecret: "Webhook secret (optional)" },
  RAZORPAY: { keySecret: "Key secret", publicKey: "Key ID", webhookSecret: "Webhook secret" },
  STRIPE: { keySecret: "Secret key", publicKey: "Publishable key", webhookSecret: "Webhook signing secret" }
};

/**
 * Save one gateway's keys. A secret left out keeps the stored one; the first
 * save must include the key secret (the service checks, since it knows
 * whether one is stored).
 */
export const updateTenantGatewayRequestSchema = z.object({
  enabled: z.boolean(),
  keySecret: z.string().trim().min(8).max(500).optional(),
  publicKey: z.string().trim().min(4).max(200),
  webhookSecret: z.string().trim().min(8).max(500).optional()
});
export type UpdateTenantGatewayRequest = z.infer<typeof updateTenantGatewayRequestSchema>;

export type TenantGatewayView = {
  provider: TenantGatewayProvider;
  configured: boolean;
  enabled: boolean;
  publicKey: string | null;
  hasKeySecret: boolean;
  hasWebhookSecret: boolean;
  /** Path to give the gateway's dashboard, relative to the API (e.g. `/payments/webhooks/razorpay/<key>`). */
  webhookPath: string | null;
  updatedAt: string | null;
};

export type TenantGatewaysResponse = {
  /** Nexa's own academy keeps the server's gateway keys; nothing is stored here for it. */
  usesPlatformAccount: boolean;
  /** False when the server has no key to encrypt secrets with. */
  canStore: boolean;
  gateways: TenantGatewayView[];
};

// ── Platform billing (academy → owner) ─────────────────────────────────────

export const PLATFORM_BILLING_PERIODS = ["MONTHLY", "YEARLY"] as const;
export const platformBillingPeriodSchema = z.enum(PLATFORM_BILLING_PERIODS);
export type PlatformBillingPeriod = z.infer<typeof platformBillingPeriodSchema>;

export const PLATFORM_CHECKOUT_STATUSES = ["CREATED", "PAID", "FAILED", "EXPIRED", "CANCELLED"] as const;
export type PlatformCheckoutStatus = (typeof PLATFORM_CHECKOUT_STATUSES)[number];

/** A pay link stays usable this long (the Razorpay order is reused while it is open). */
export const PLATFORM_CHECKOUT_TTL_DAYS = 7;

/** The academy's super admin starts paying for a plan (its current one by default). */
export const startPlatformCheckoutRequestSchema = z.object({
  period: platformBillingPeriodSchema,
  planCode: z.string().trim().min(1).max(60).optional()
});
export type StartPlatformCheckoutRequest = z.infer<typeof startPlatformCheckoutRequestSchema>;

/** The owner sends an academy a pay link from the console. */
export const createPlatformPayLinkRequestSchema = z.object({
  /** Overrides the plan's (or the deal's) price, before GST, for this one link. */
  subtotalMinor: z.number().int().positive().max(100_000_000).optional(),
  note: z.string().trim().max(500).optional(),
  period: platformBillingPeriodSchema,
  planCode: z.string().trim().min(1).max(60).optional()
});
export type CreatePlatformPayLinkRequest = z.infer<typeof createPlatformPayLinkRequestSchema>;

/**
 * What Checkout.js needs. The browser's success callback only asks the API to
 * read the order from Razorpay; it never grants anything (§G "State machine").
 */
export type PlatformCheckoutView = {
  id: string;
  status: PlatformCheckoutStatus;
  planCode: string;
  planName: string;
  period: PlatformBillingPeriod;
  /** Plan price before GST (plan prices exclude GST). */
  subtotalMinor: number;
  /** GST from the shared engine (`computeTax`), on top of the subtotal. */
  taxMinor: number;
  /** What the academy pays: subtotal + GST. */
  amountMinor: number;
  currency: string;
  expiresAt: string;
  paidAt: string | null;
  /** Null when the owner's gateway is not configured: the page says to contact the owner. */
  gateway: { provider: "RAZORPAY"; keyId: string; orderId: string; merchantName: string } | null;
  createdByPlatform: boolean;
  note: string | null;
};

/** Razorpay Checkout's handler arguments, passed through for the order read. */
export const confirmPlatformCheckoutRequestSchema = z.object({
  razorpayOrderId: z.string().trim().min(1).max(100).optional(),
  razorpayPaymentId: z.string().trim().min(1).max(100).optional(),
  razorpaySignature: z.string().trim().min(1).max(200).optional()
});
export type ConfirmPlatformCheckoutRequest = z.infer<typeof confirmPlatformCheckoutRequestSchema>;

export type PlatformInvoiceLineView = {
  description: string;
  amountMinor: number;
};

/** A frozen GST invoice from the owner to an academy. */
export type PlatformInvoiceView = {
  id: string;
  number: string;
  issuedAt: string;
  tenantId: string;
  tenantName: string;
  seller: PlatformSellerDetails;
  buyer: { name: string; gstin: string | null; address: string | null; stateCode: string | null };
  lines: PlatformInvoiceLineView[];
  currency: string;
  subtotalMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  totalMinor: number;
  taxTreatment: string;
  paymentReference: string | null;
  /** The paid-up period this invoice covers. */
  periodStart: string;
  periodEnd: string;
};

export type PlatformInvoicesResponse = { invoices: PlatformInvoiceView[] };

export type AcademyBillingResponse = {
  /** An open checkout (a pay link from the owner, or one the admin started). */
  openCheckouts: PlatformCheckoutView[];
  invoices: PlatformInvoiceView[];
  /** False when the owner's Razorpay keys are not set on this server. */
  gatewayReady: boolean;
};

// ── The owner's seller details (console) ───────────────────────────────────

export const platformSellerDetailsSchema = z.object({
  address: z.string().trim().max(500).default(""),
  email: z.string().trim().email().max(200).or(z.literal("")).default(""),
  gstin: z.string().trim().max(15).or(z.literal("")).default(""),
  /** Prefix of the invoice number series, e.g. "NXP" → NXP/2026-27/0001. */
  invoicePrefix: z.string().trim().min(1).max(12).regex(/^[A-Z0-9-]+$/, "Capital letters, digits and hyphens only").default("NXP"),
  legalName: z.string().trim().max(200).default(""),
  /** GST rate in basis points (1800 = 18%). */
  gstRateBps: z.number().int().min(0).max(5000).default(1800),
  stateCode: z.string().trim().max(2).or(z.literal("")).default("")
});
export type PlatformSellerDetails = z.infer<typeof platformSellerDetailsSchema>;
export const updatePlatformSellerDetailsRequestSchema = platformSellerDetailsSchema.partial();
export type UpdatePlatformSellerDetailsRequest = z.infer<typeof updatePlatformSellerDetailsRequestSchema>;

/** The price for a plan and period: the deal's custom price (monthly) wins, yearly = 12× when the plan has no yearly price. */
export function platformPriceFor(
  plan: { priceMonthlyMinor: number | null; priceYearlyMinor: number | null },
  period: PlatformBillingPeriod,
  customMonthlyMinor?: number | null
): number | null {
  if (customMonthlyMinor != null) return period === "MONTHLY" ? customMonthlyMinor : customMonthlyMinor * 12;
  if (period === "MONTHLY") return plan.priceMonthlyMinor;
  return plan.priceYearlyMinor ?? (plan.priceMonthlyMinor == null ? null : plan.priceMonthlyMinor * 12);
}

/** The next paid-up date: one period after the later of now and the current period end. */
export function extendPlatformPeriod(from: Date | null, period: PlatformBillingPeriod, now = new Date()): Date {
  const start = from && from.getTime() > now.getTime() ? from : now;
  const next = new Date(start.getTime());
  if (period === "MONTHLY") next.setUTCMonth(next.getUTCMonth() + 1);
  else next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next;
}

// ── Usage counters (console) ───────────────────────────────────────────────

export type TenantUsageSnapshot = {
  tenantId: string;
  counts: Record<string, number>;
  measuredAt: string;
};

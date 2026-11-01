import { z } from "zod";
import { partialWithoutDefaults } from "./core-schemas";
import {
  paymentMethodKindSchema,
  paymentSourceSchema,
  percentOf,
  type EntitlementItem,
  type PaymentListItem,
  type PaymentMethodKind,
  type PaymentSource,
  type SubscriptionItem
} from "./payments";

// ─────────────────────────────────────────────────────────────
// Invoicing contract.
//
// Everything an invoice asserts is frozen at issue time: the buyer's billing
// address, the seller's registered details, every line, and the tax split. A
// receipt someone downloaded a year ago must render identically today, so
// nothing here is ever resolved by joining a live row.
// ─────────────────────────────────────────────────────────────

// ── Document lifecycle ──

export const invoiceDocumentStatusSchema = z.enum([
  "DRAFT",
  "ISSUED",
  "PAID",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
  "VOID"
]);
export type InvoiceDocumentStatus = z.infer<typeof invoiceDocumentStatusSchema>;

export const INVOICE_STATUS_LABELS: Record<InvoiceDocumentStatus, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  PAID: "Paid",
  PARTIALLY_REFUNDED: "Partially refunded",
  REFUNDED: "Refunded",
  VOID: "Void"
};

/**
 * The PDF artifact's own state, deliberately separate from the financial
 * status above (§20). A failed render must never make a paid invoice look
 * unpaid — the money is settled either way, and only the file needs retrying.
 */
export const invoicePdfStatusSchema = z.enum([
  "PENDING",
  "GENERATING",
  "READY",
  "FAILED"
]);
export type InvoicePdfStatus = z.infer<typeof invoicePdfStatusSchema>;

export const INVOICE_PDF_STATUS_LABELS: Record<InvoicePdfStatus, string> = {
  PENDING: "Queued",
  GENERATING: "Generating",
  READY: "Ready",
  FAILED: "Generation failed"
};

// ── Tax ──

/**
 * How a sale is taxed. Determined from the seller's and buyer's place of
 * supply, never assumed — an Indian seller billing a Karnataka customer from
 * Karnataka splits CGST+SGST, the same sale to Kerala is IGST, and a sale
 * abroad is an export with no GST at all.
 */
export const taxTreatmentSchema = z.enum([
  "NONE",
  "INTRA_STATE",
  "INTER_STATE",
  "EXPORT",
  "REVERSE_CHARGE"
]);
export type TaxTreatment = z.infer<typeof taxTreatmentSchema>;

export const TAX_TREATMENT_LABELS: Record<TaxTreatment, string> = {
  NONE: "No tax",
  INTRA_STATE: "Intra-state (CGST + SGST)",
  INTER_STATE: "Inter-state (IGST)",
  EXPORT: "Export / zero-rated",
  REVERSE_CHARGE: "Reverse charge"
};

export type TaxBreakdown = {
  treatment: TaxTreatment;
  /** Total GST percent applied to the taxable amount (18 = 18%). */
  ratePercent: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  /** Minor units. */
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  taxTotal: number;
};

export const ZERO_TAX: TaxBreakdown = {
  treatment: "NONE",
  ratePercent: 0,
  cgstRate: 0,
  sgstRate: 0,
  igstRate: 0,
  cgstAmount: 0,
  sgstAmount: 0,
  igstAmount: 0,
  taxTotal: 0
};

export type TaxContext = {
  /** Seller's GST state code ("29" for Karnataka), null when unregistered. */
  sellerStateCode: string | null;
  sellerCountry: string;
  /** Buyer's state code; null when they gave no address. */
  buyerStateCode: string | null;
  buyerCountry: string | null;
  /** Total GST percent the plan carries. */
  ratePercent: number;
  /** Set when the buyer supplied a GSTIN. */
  buyerHasGstin: boolean;
};

/**
 * Decides the treatment before any arithmetic happens. Split out from
 * {@link computeTax} so the admin settings screen can explain *why* a sale
 * will be taxed a given way without pricing anything.
 */
export function resolveTaxTreatment(context: TaxContext): TaxTreatment {
  if (context.ratePercent <= 0) return "NONE";

  const sellerCountry = context.sellerCountry.toUpperCase();
  const buyerCountry = (context.buyerCountry ?? sellerCountry).toUpperCase();

  // GST only applies to a domestic supply. Anything crossing the border is an
  // export, zero-rated, regardless of what the plan's rate says.
  if (buyerCountry !== sellerCountry) return "EXPORT";
  if (sellerCountry !== "IN") return "INTER_STATE";

  // An unregistered seller charges no GST at all.
  if (!context.sellerStateCode) return "NONE";

  // No buyer address means we cannot prove an inter-state supply, and the
  // place of supply defaults to the seller's own state.
  if (!context.buyerStateCode) return "INTRA_STATE";

  return context.buyerStateCode === context.sellerStateCode
    ? "INTRA_STATE"
    : "INTER_STATE";
}

/**
 * The single tax engine. Shared with the web preview so an admin sees exactly
 * the split that will be stamped onto the invoice.
 *
 * `taxableAmount` is always the DISCOUNTED subtotal — taxing the list price
 * would overcharge (CLAUDE.md §3.6f).
 */
export function computeTax(
  taxableAmount: number,
  context: TaxContext
): TaxBreakdown {
  const treatment = resolveTaxTreatment(context);
  if (treatment === "NONE" || treatment === "EXPORT" || treatment === "REVERSE_CHARGE") {
    return { ...ZERO_TAX, treatment, ratePercent: 0 };
  }

  const rate = context.ratePercent;

  if (treatment === "INTRA_STATE") {
    const half = rate / 2;
    // Each half is rounded independently and the total is their sum, so
    // CGST + SGST always equals the printed tax total to the paisa.
    const cgstAmount = percentOf(taxableAmount, half);
    const sgstAmount = percentOf(taxableAmount, half);
    return {
      treatment,
      ratePercent: rate,
      cgstRate: half,
      sgstRate: half,
      igstRate: 0,
      cgstAmount,
      sgstAmount,
      igstAmount: 0,
      taxTotal: cgstAmount + sgstAmount
    };
  }

  const igstAmount = percentOf(taxableAmount, rate);
  return {
    treatment,
    ratePercent: rate,
    cgstRate: 0,
    sgstRate: 0,
    igstRate: rate,
    cgstAmount: 0,
    sgstAmount: 0,
    igstAmount,
    taxTotal: igstAmount
  };
}

/** GSTIN: 2-digit state code, 10-char PAN, entity digit, 'Z', checksum. */
export const GSTIN_PATTERN =
  /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function isValidGstin(value: string): boolean {
  return GSTIN_PATTERN.test(value.trim().toUpperCase());
}

/** The first two digits of a GSTIN are the holder's state code. */
export function stateCodeFromGstin(gstin: string | null | undefined): string | null {
  if (!gstin) return null;
  const normalized = gstin.trim().toUpperCase();
  return isValidGstin(normalized) ? normalized.slice(0, 2) : null;
}

export const INDIAN_STATE_CODES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh"
};

export function stateNameFromCode(code: string | null | undefined): string | null {
  if (!code) return null;
  return INDIAN_STATE_CODES[code] ?? null;
}

// ── Billing party ──

export const billingAddressSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(255).nullable().optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  line1: z.string().trim().max(255).nullable().optional(),
  line2: z.string().trim().max(255).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  state: z.string().trim().max(120).nullable().optional(),
  /** GST state code, derived from a GSTIN when one is given. */
  stateCode: z.string().trim().max(2).nullable().optional(),
  postalCode: z.string().trim().max(24).nullable().optional(),
  country: z.string().trim().length(2).default("IN"),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value === "" || isValidGstin(value), {
      message: "Enter a valid 15-character GSTIN."
    })
    .nullable()
    .optional(),
  businessName: z.string().trim().max(200).nullable().optional()
});
export type BillingAddress = z.infer<typeof billingAddressSchema>;

/** What a buyer may edit about their own billing identity. */
export const updateBillingProfileRequestSchema = partialWithoutDefaults(billingAddressSchema, [
  "name",
  "country"
]);
export type UpdateBillingProfileRequest = z.infer<
  typeof updateBillingProfileRequestSchema
>;

// ── Line items ──

export const invoiceLineSchema = z.object({
  /** Plan id the line was priced from; null for an ad-hoc line. */
  productId: z.string().nullable().default(null),
  description: z.string().min(1),
  quantity: z.number().int().positive().default(1),
  /** Minor units, per unit, before discount and tax. */
  unitAmount: z.number().int(),
  /** Minor units taken off this line. */
  discountAmount: z.number().int().nonnegative().default(0),
  taxRate: z.number().nonnegative().default(0),
  taxAmount: z.number().int().nonnegative().default(0),
  /** Minor units: quantity × unitAmount − discountAmount. Excludes tax. */
  amount: z.number().int()
});
export type InvoiceLine = z.infer<typeof invoiceLineSchema>;

export function lineNetAmount(line: InvoiceLine): number {
  return line.quantity * line.unitAmount - line.discountAmount;
}

/** Sums lines into the figures the invoice footer prints. */
export function sumInvoiceLines(lines: InvoiceLine[]): {
  subtotal: number;
  discountTotal: number;
  taxableAmount: number;
} {
  const subtotal = lines.reduce(
    (total, line) => total + line.quantity * line.unitAmount,
    0
  );
  const discountTotal = lines.reduce(
    (total, line) => total + line.discountAmount,
    0
  );
  return { subtotal, discountTotal, taxableAmount: subtotal - discountTotal };
}

// ── The document ──

export type InvoicePaymentSummary = {
  provider: PaymentSource | null;
  method: PaymentMethodKind | null;
  /**
   * Provider-supplied, already-safe descriptor ("Visa •••• 4242", "UPI —
   * googlepay"). Never a PAN, CVV, PIN or bank credential (§10).
   */
  methodDetail: string | null;
  transactionId: string | null;
  paidAt: string | null;
};

export type InvoiceItem = {
  id: string;
  number: string;
  orderId: string;
  orderNumber: string;
  paymentId: string | null;
  userId: string;
  userName: string | null;
  userEmail: string | null;

  status: InvoiceDocumentStatus;
  pdfStatus: InvoicePdfStatus;

  /** Minor units, all frozen at issue. */
  subtotal: number;
  discountAmount: number;
  discountCode: string | null;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  taxTotal: number;
  total: number;
  amountRefunded: number;
  currency: string;

  taxTreatment: TaxTreatment;
  taxRatePercent: number;
  taxLabel: string | null;

  lines: InvoiceLine[];

  billing: BillingAddress;
  seller: InvoiceSellerDetails;
  payment: InvoicePaymentSummary;

  notes: string | null;
  terms: string | null;
  footer: string | null;

  invoiceDate: string;
  dueDate: string | null;
  paidAt: string | null;

  emailSent: boolean;
  emailSentAt: string | null;

  createdAt: string;
};

export type InvoiceListResponse = { invoices: InvoiceItem[] };

// ── Credit notes (§19) ──

export const creditNoteReasonSchema = z.enum([
  "REFUND",
  "CANCELLATION",
  "CORRECTION",
  "WRITE_OFF",
  "OTHER"
]);
export type CreditNoteReason = z.infer<typeof creditNoteReasonSchema>;

export const CREDIT_NOTE_REASON_LABELS: Record<CreditNoteReason, string> = {
  REFUND: "Refund",
  CANCELLATION: "Cancellation",
  CORRECTION: "Correction",
  WRITE_OFF: "Write-off",
  OTHER: "Other"
};

/**
 * A credit note reverses value without touching the invoice it references — an
 * issued invoice is never rewritten after the fact (§19).
 */
export type CreditNoteItem = {
  id: string;
  number: string;
  invoiceId: string;
  invoiceNumber: string;
  userId: string;
  userName: string | null;
  refundId: string | null;
  providerRefundId: string | null;

  reason: CreditNoteReason;
  note: string | null;

  /** Minor units. Reversed amounts, always positive on the document. */
  subtotal: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  taxTotal: number;
  total: number;
  currency: string;

  /** False when only part of the invoice was credited. */
  isFullCredit: boolean;

  lines: InvoiceLine[];
  billing: BillingAddress;
  seller: InvoiceSellerDetails;

  pdfStatus: InvoicePdfStatus;
  issuedAt: string;
  createdAt: string;
};

export type CreditNoteListResponse = { creditNotes: CreditNoteItem[] };

/**
 * Splits a refunded amount back across an invoice's tax components in the same
 * proportion they were charged, so a partial credit note never invents tax.
 * The largest component absorbs any rounding remainder.
 */
export function computeCreditBreakdown(
  invoice: Pick<
    InvoiceItem,
    "taxableAmount" | "cgstAmount" | "sgstAmount" | "igstAmount" | "total"
  >,
  creditTotal: number
): {
  subtotal: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  taxTotal: number;
  total: number;
} {
  if (invoice.total <= 0 || creditTotal <= 0) {
    return {
      subtotal: 0,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      taxTotal: 0,
      total: 0
    };
  }

  const capped = Math.min(creditTotal, invoice.total);
  const ratio = capped / invoice.total;
  const scale = (value: number) => Math.round(value * ratio);

  const cgstAmount = scale(invoice.cgstAmount);
  const sgstAmount = scale(invoice.sgstAmount);
  const igstAmount = scale(invoice.igstAmount);
  const taxTotal = cgstAmount + sgstAmount + igstAmount;

  // Derive the net from the total rather than scaling it too, so the parts
  // always re-add to exactly what was refunded.
  return {
    subtotal: capped - taxTotal,
    cgstAmount,
    sgstAmount,
    igstAmount,
    taxTotal,
    total: capped
  };
}

// ── Seller identity (Admin → Settings → Billing & Invoicing, §4) ──
//
// Never hard-coded in the PDF template. The settings row is the single source,
// and every invoice snapshots it at issue time so changing the address later
// does not rewrite history.

export type InvoiceSellerDetails = {
  legalName: string;
  tradeName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  stateCode: string | null;
  postalCode: string | null;
  country: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  gstin: string | null;
  pan: string | null;
  logoUrl: string | null;
};

/** GST Rule 46 allows only letters, digits, `-` and `/` in a document number; `/` is the separator. */
const documentPrefixSchema = z
  .string()
  .trim()
  .min(1)
  .max(4)
  .regex(/^[A-Za-z0-9-]+$/, { message: "Use up to 4 letters, digits or hyphens." });

export const invoiceSettingsSchema = z.object({
  legalName: z.string().trim().min(1).max(200),
  tradeName: z.string().trim().max(200).nullable().default(null),

  addressLine1: z.string().trim().max(255).nullable().default(null),
  addressLine2: z.string().trim().max(255).nullable().default(null),
  city: z.string().trim().max(120).nullable().default(null),
  state: z.string().trim().max(120).nullable().default(null),
  postalCode: z.string().trim().max(24).nullable().default(null),
  country: z.string().trim().length(2).default("IN"),

  email: z.string().trim().email().max(255).nullable().default(null),
  phone: z.string().trim().max(32).nullable().default(null),
  website: z.string().trim().max(255).nullable().default(null),

  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value === "" || isValidGstin(value), {
      message: "Enter a valid 15-character GSTIN."
    })
    .nullable()
    .default(null),
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value === "" || /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value), {
      message: "Enter a valid 10-character PAN."
    })
    .nullable()
    .default(null),

  logoUrl: z.string().trim().max(500).nullable().default(null),

  /** Series prefix. Changing it affects only invoices issued afterwards. */
  invoicePrefix: documentPrefixSchema.default("INV"),
  creditNotePrefix: documentPrefixSchema.default("CN"),

  /** Default GST percent when a plan does not set its own. */
  defaultTaxPercent: z.number().min(0).max(100).default(0),
  taxLabel: z.string().trim().min(1).max(40).default("GST"),

  footerText: z.string().trim().max(500).nullable().default(null),
  termsText: z.string().trim().max(4000).nullable().default(null),
  supportEmail: z.string().trim().email().max(255).nullable().default(null),

  /** Whether a paid invoice is emailed to the buyer automatically (§18). */
  emailOnIssue: z.boolean().default(true),
  /** Attach the PDF, versus linking to a secure download. */
  attachPdfToEmail: z.boolean().default(true)
});
export type InvoiceSettings = z.infer<typeof invoiceSettingsSchema>;

export const updateInvoiceSettingsRequestSchema = partialWithoutDefaults(invoiceSettingsSchema);
export type UpdateInvoiceSettingsRequest = z.infer<
  typeof updateInvoiceSettingsRequestSchema
>;

export type InvoiceSettingsResponse = {
  settings: InvoiceSettings;
  /** True once an admin has saved, versus still showing env-derived defaults. */
  configured: boolean;
  updatedAt: string | null;
};

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  legalName: "NexaChess",
  tradeName: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  state: null,
  postalCode: null,
  country: "IN",
  email: null,
  phone: null,
  website: null,
  gstin: null,
  pan: null,
  logoUrl: null,
  invoicePrefix: "INV",
  creditNotePrefix: "CN",
  defaultTaxPercent: 0,
  taxLabel: "GST",
  footerText: null,
  termsText: null,
  supportEmail: null,
  emailOnIssue: true,
  attachPdfToEmail: true
};

export function sellerFromSettings(
  settings: InvoiceSettings
): InvoiceSellerDetails {
  return {
    legalName: settings.legalName,
    tradeName: settings.tradeName,
    addressLine1: settings.addressLine1,
    addressLine2: settings.addressLine2,
    city: settings.city,
    state: settings.state,
    stateCode: stateCodeFromGstin(settings.gstin),
    postalCode: settings.postalCode,
    country: settings.country,
    email: settings.email,
    phone: settings.phone,
    website: settings.website,
    gstin: settings.gstin,
    pan: settings.pan,
    logoUrl: settings.logoUrl
  };
}

/** Indian financial year (April–March, IST) by its starting year: 1 Apr 2026 – 31 Mar 2027 → 2026. */
export function financialYear(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    month: "numeric",
    timeZone: "Asia/Kolkata",
    year: "numeric"
  }).formatToParts(at);
  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  return month >= 4 ? year : year - 1;
}

/**
 * INV/26-27/00001. GST Rule 46: at most 16 characters of letters, digits, `-`
 * and `/`, unique within a financial year (`fyStartYear`, see financialYear).
 * When the full form would pass 16 (a 4-character prefix from the 100,000th
 * document), the year shortens to INV/26/100000 — the sequence is never cut.
 * Gapless, allocated server-side from a row-locked sequence, never reused.
 */
export function formatDocumentNumber(
  prefix: string,
  fyStartYear: number,
  sequence: number
): string {
  const yy = (year: number) => String(year % 100).padStart(2, "0");
  const serial = String(sequence).padStart(5, "0");
  const full = `${prefix}/${yy(fyStartYear)}-${yy(fyStartYear + 1)}/${serial}`;
  const number = full.length <= 16 ? full : `${prefix}/${yy(fyStartYear)}/${serial}`;
  if (number.length > 16) {
    throw new Error(`Document number ${number} exceeds the GST 16-character limit.`);
  }
  return number;
}

// ── Domain events (§20) ──

export const invoiceEventSchema = z.enum([
  "PAYMENT_CONFIRMED",
  "INVOICE_GENERATION_REQUESTED",
  "INVOICE_GENERATED",
  "INVOICE_GENERATION_FAILED",
  "INVOICE_EMAIL_REQUESTED",
  "INVOICE_EMAIL_SENT",
  "INVOICE_EMAIL_FAILED",
  "INVOICE_DOWNLOADED",
  "INVOICE_VIEWED",
  "REFUND_COMPLETED",
  "CREDIT_NOTE_CREATED",
  "INVOICE_SETTINGS_UPDATED"
]);
export type InvoiceEvent = z.infer<typeof invoiceEventSchema>;

export const INVOICE_EVENT_LABELS: Record<InvoiceEvent, string> = {
  PAYMENT_CONFIRMED: "Payment confirmed",
  INVOICE_GENERATION_REQUESTED: "PDF generation requested",
  INVOICE_GENERATED: "PDF generated",
  INVOICE_GENERATION_FAILED: "PDF generation failed",
  INVOICE_EMAIL_REQUESTED: "Email requested",
  INVOICE_EMAIL_SENT: "Email sent",
  INVOICE_EMAIL_FAILED: "Email failed",
  INVOICE_DOWNLOADED: "Downloaded",
  INVOICE_VIEWED: "Viewed",
  REFUND_COMPLETED: "Refund completed",
  CREDIT_NOTE_CREATED: "Credit note created",
  INVOICE_SETTINGS_UPDATED: "Billing settings updated"
};

export type InvoiceAuditEntry = {
  id: string;
  invoiceId: string | null;
  creditNoteId: string | null;
  event: InvoiceEvent;
  actorId: string | null;
  actorName: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type InvoiceAuditResponse = { entries: InvoiceAuditEntry[] };

// ── Admin surfaces (§17) ──

export const ADMIN_INVOICE_SORT_FIELDS = [
  "billingName",
  "invoiceDate",
  "number",
  "status",
  "taxTotal",
  "total"
] as const;
export type AdminInvoiceSortField = (typeof ADMIN_INVOICE_SORT_FIELDS)[number];

export const adminInvoiceQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: invoiceDocumentStatusSchema.optional(),
  provider: paymentSourceSchema.optional(),
  method: paymentMethodKindSchema.optional(),
  currency: z.string().trim().length(3).toUpperCase().optional(),
  userId: z.string().trim().optional(),
  /** Inclusive ISO date-only bounds, read as India (IST) days. */
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
  /** Sorted on the server, so a column sort covers every page, not just this one. */
  sort: z.enum(ADMIN_INVOICE_SORT_FIELDS).optional(),
  order: z.enum(["asc", "desc"]).optional()
});
export type AdminInvoiceQuery = z.infer<typeof adminInvoiceQuerySchema>;

export type InvoiceStats = {
  totalInvoices: number;
  paidInvoices: number;
  refundedInvoices: number;
  failedPdfCount: number;
  /** Minor units, per currency — never summed across currencies (§9). */
  revenueByCurrency: Record<string, number>;
  taxByCurrency: Record<string, number>;
  refundedByCurrency: Record<string, number>;
};

export type AdminInvoiceListResponse = {
  invoices: InvoiceItem[];
  stats: InvoiceStats;
  total: number;
  page: number;
  pageSize: number;
};

export const retryInvoicePdfRequestSchema = z.object({
  /** Re-render even when a PDF already exists. */
  force: z.boolean().default(false)
});
export type RetryInvoicePdfRequest = z.infer<typeof retryInvoicePdfRequestSchema>;

export const createCreditNoteRequestSchema = z.object({
  invoiceId: z.string().trim().min(1),
  /** Minor units. Omit for a full credit of the invoice total. */
  amount: z.number().int().positive().optional(),
  reason: creditNoteReasonSchema.default("REFUND"),
  note: z.string().trim().max(1000).optional()
});
export type CreateCreditNoteRequest = z.infer<
  typeof createCreditNoteRequestSchema
>;

// ── The student's own billing view ──
//
// Lives here rather than in payments.ts because it carries InvoiceItem, and
// invoices.ts already depends on payments.ts — the other direction would be a
// cycle.

export type MyBillingResponse = {
  payments: PaymentListItem[];
  invoices: InvoiceItem[];
  creditNotes: CreditNoteItem[];
  subscriptions: SubscriptionItem[];
  entitlements: EntitlementItem[];
  billingProfile: BillingAddress | null;
};

import { Injectable, NotFoundException } from "@nestjs/common";
import {
  computeTax,
  formatDocumentNumber,
  formatMoney,
  INVOICE_STATUS_LABELS,
  invoiceLineSchema,
  PAYMENT_METHOD_LABELS,
  PAYMENT_PROVIDER_LABELS,
  stateCodeFromGstin,
  sellerFromSettings,
  sumInvoiceLines,
  type AdminInvoiceListResponse,
  type AdminInvoiceQuery,
  type BillingAddress,
  type InvoiceDocumentStatus,
  type InvoiceItem,
  type InvoiceLine,
  type InvoiceSellerDetails,
  type InvoiceStats,
  type TaxBreakdown
} from "@nexa-chess/types";
import {
  InvoiceStatus,
  Prisma,
  TaxTreatment,
  type Invoice,
  type User
} from "@prisma/client";
import {
  PrismaService,
  type PrismaTransactionClient
} from "../prisma/prisma.service";
import { BillingProfileService } from "./billing-profile.service";
import { InvoiceSettingsService } from "./invoice-settings.service";
import { assertOwnerOrAdmin, fullName, isAdminRole } from "./payments-auth.helper";

type InvoiceRow = Prisma.InvoiceGetPayload<{
  include: {
    order: { select: { orderNumber: true } };
    user: { select: { firstName: true; lastName: true; email: true } };
  };
}>;

const INVOICE_INCLUDE = {
  order: { select: { orderNumber: true } },
  user: { select: { firstName: true, lastName: true, email: true } }
} satisfies Prisma.InvoiceInclude;

export type IssueInvoiceInput = {
  orderId: string;
  paymentId: string;
  userId: string;
  /** One entry per thing being sold. A plan purchase has exactly one. */
  items: {
    productId?: string | null;
    description: string;
    quantity?: number;
    unitAmount: number;
  }[];
  /** Minor units taken off by a code; 0 when none applied. */
  discountAmount?: number;
  discountCode?: string | null;
  /** Total GST percent the plan carries. */
  taxPercent: number;
  currency: string;
  paidAt: Date;
  provider?: string | null;
  paymentMethod?: string | null;
  methodDetail?: string | null;
  transactionId?: string | null;
};

/**
 * Invoices (§2, §3, §6-§10).
 *
 * One official invoice per captured order, issued inside the capture
 * transaction so a paid order always has a receipt and a receipt never exists
 * for an unpaid one. Every figure, the buyer's billing identity and the
 * seller's registered details are FROZEN onto the row at issue time: an invoice
 * someone downloaded a year ago must render identically today, so nothing here
 * is resolved by joining a live plan, profile or settings row afterwards.
 */
@Injectable()
export class InvoiceService {
  constructor(
    private readonly billingProfiles: BillingProfileService,
    private readonly prisma: PrismaService,
    private readonly settings: InvoiceSettingsService
  ) {}

  // ────────────────────────────────────────────────
  // Issue
  // ────────────────────────────────────────────────

  /**
   * Issues the invoice for a captured order.
   *
   * Idempotent on the unique `orderId`: a redelivered webhook, a client verify
   * callback and the reconciliation cron all land here, and the second one
   * returns the existing invoice rather than renumbering (§22 duplicate
   * webhook). Numbering comes from InvoiceSequence incremented in this same
   * transaction, so two concurrent captures get consecutive numbers and never
   * collide.
   */
  async issue(
    tx: PrismaTransactionClient,
    input: IssueInvoiceInput
  ): Promise<Invoice> {
    const existing = await tx.invoice.findUnique({
      where: { orderId: input.orderId }
    });
    if (existing) return existing;

    const settings = await this.settings.get();
    const seller = sellerFromSettings(settings);
    const billing = await this.billingProfiles.resolve(input.userId, tx);

    const discountAmount = input.discountAmount ?? 0;

    // Build the lines first; every total below is derived from them, so the
    // printed table and the printed footer can never disagree.
    const lines = this.buildLines(input, discountAmount);
    const { subtotal, taxableAmount } = sumInvoiceLines(lines);

    const tax = computeTax(taxableAmount, {
      sellerStateCode: seller.stateCode,
      sellerCountry: seller.country,
      buyerStateCode: stateCodeFromGstin(billing.gstin) ?? billing.stateCode ?? null,
      buyerCountry: billing.country,
      ratePercent: input.taxPercent,
      buyerHasGstin: Boolean(billing.gstin)
    });

    // Tax lands on the invoice as a whole, but each line carries its share so
    // a multi-line invoice still shows a per-line rate.
    const taxedLines = this.distributeTax(lines, tax);

    const year = input.paidAt.getUTCFullYear();
    const sequence = await tx.invoiceSequence.upsert({
      where: { year },
      create: { year, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } }
    });

    return tx.invoice.create({
      data: {
        number: formatDocumentNumber(
          settings.invoicePrefix,
          year,
          sequence.lastNumber
        ),
        orderId: input.orderId,
        paymentId: input.paymentId,
        userId: input.userId,
        status: InvoiceStatus.PAID,

        subtotal,
        discountAmount,
        discountCode: input.discountCode ?? null,
        taxableAmount,
        cgstAmount: tax.cgstAmount,
        sgstAmount: tax.sgstAmount,
        igstAmount: tax.igstAmount,
        taxTotal: tax.taxTotal,
        total: taxableAmount + tax.taxTotal,
        currency: input.currency,

        taxTreatment: tax.treatment as TaxTreatment,
        taxRatePercent: tax.ratePercent,
        taxLabel: tax.taxTotal > 0 ? settings.taxLabel : null,

        lines: taxedLines as unknown as Prisma.InputJsonValue,

        billingName: billing.name,
        billingEmail: billing.email ?? null,
        billingPhone: billing.phone ?? null,
        billingLine1: billing.line1 ?? null,
        billingLine2: billing.line2 ?? null,
        billingCity: billing.city ?? null,
        billingState: billing.state ?? null,
        billingStateCode:
          stateCodeFromGstin(billing.gstin) ?? billing.stateCode ?? null,
        billingPostalCode: billing.postalCode ?? null,
        billingCountry: billing.country,
        customerGstin: billing.gstin ?? null,
        businessName: billing.businessName ?? null,

        seller: seller as unknown as Prisma.InputJsonValue,

        paymentProvider: (input.provider ?? null) as never,
        paymentMethod: (input.paymentMethod ?? null) as never,
        methodDetail: input.methodDetail ?? null,
        transactionId: input.transactionId ?? null,

        terms: settings.termsText,
        footer: settings.footerText,

        invoiceDate: input.paidAt,
        paidAt: input.paidAt
      }
    });
  }

  /**
   * One line per item sold, plus the order-level discount spread across them.
   *
   * The discount is apportioned by line value rather than dumped on the first
   * line, so a two-item order shows each item reduced in proportion. The last
   * line absorbs the rounding remainder so the parts always re-add to exactly
   * the discount the buyer was promised.
   */
  private buildLines(
    input: IssueInvoiceInput,
    discountAmount: number
  ): InvoiceLine[] {
    const items = input.items.length
      ? input.items
      : [{ description: "NexaChess purchase", unitAmount: 0, quantity: 1 }];

    const gross = items.map(
      (item) => (item.quantity ?? 1) * item.unitAmount
    );
    const grossTotal = gross.reduce((sum, value) => sum + value, 0);

    let allocated = 0;
    return items.map((item, index) => {
      const quantity = item.quantity ?? 1;
      const lineGross = gross[index];

      const isLast = index === items.length - 1;
      const share =
        discountAmount === 0 || grossTotal === 0
          ? 0
          : isLast
            ? discountAmount - allocated
            : Math.round((discountAmount * lineGross) / grossTotal);
      allocated += share;

      return invoiceLineSchema.parse({
        productId: item.productId ?? null,
        description: item.description,
        quantity,
        unitAmount: item.unitAmount,
        discountAmount: share,
        taxRate: 0,
        taxAmount: 0,
        amount: lineGross - share
      });
    });
  }

  /**
   * Spreads the invoice's tax across its lines proportionally, with the last
   * line taking the remainder so the per-line amounts sum to the tax total.
   */
  private distributeTax(lines: InvoiceLine[], tax: TaxBreakdown): InvoiceLine[] {
    if (tax.taxTotal <= 0) return lines;

    const net = lines.reduce((sum, line) => sum + line.amount, 0);
    if (net <= 0) return lines;

    let allocated = 0;
    return lines.map((line, index) => {
      const isLast = index === lines.length - 1;
      const amount = isLast
        ? tax.taxTotal - allocated
        : Math.round((tax.taxTotal * line.amount) / net);
      allocated += amount;
      return { ...line, taxRate: tax.ratePercent, taxAmount: amount };
    });
  }

  // ────────────────────────────────────────────────
  // Refunds
  // ────────────────────────────────────────────────

  /**
   * Keeps the receipt honest after money goes back out (§19).
   *
   * This only ever records how much was refunded and moves the status — it
   * never rewrites an amount, a line or a tax figure. The document that
   * accounts for the reversal is the credit note.
   */
  async recordRefund(
    tx: PrismaTransactionClient,
    orderId: string,
    amountRefunded: number,
    fullyRefunded: boolean
  ): Promise<Invoice | null> {
    const invoice = await tx.invoice.findUnique({ where: { orderId } });
    if (!invoice) return null;

    return tx.invoice.update({
      where: { id: invoice.id },
      data: {
        amountRefunded,
        status: fullyRefunded
          ? InvoiceStatus.REFUNDED
          : amountRefunded > 0
            ? InvoiceStatus.PARTIALLY_REFUNDED
            : invoice.status
      }
    });
  }

  // ────────────────────────────────────────────────
  // Reads
  // ────────────────────────────────────────────────

  /** §14: a user reaches only their own invoice; an admin reaches any. */
  async get(user: User, invoiceId: string): Promise<InvoiceItem> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: INVOICE_INCLUDE
    });
    if (!invoice) throw new NotFoundException("Invoice not found.");

    assertOwnerOrAdmin(user, invoice.userId);
    return this.toItem(invoice);
  }

  /** Internal read for the PDF worker, which has no user to authorize. */
  async getById(invoiceId: string): Promise<InvoiceItem | null> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: INVOICE_INCLUDE
    });
    return invoice ? this.toItem(invoice) : null;
  }

  async listForUser(userId: string): Promise<InvoiceItem[]> {
    const rows = await this.prisma.invoice.findMany({
      where: { userId },
      include: INVOICE_INCLUDE,
      orderBy: { invoiceDate: "desc" },
      take: 200
    });
    return rows.map((row) => this.toItem(row));
  }

  /** Flat list, for the older /admin/payments/invoices panel. */
  async listAll(limit = 200): Promise<InvoiceItem[]> {
    const rows = await this.prisma.invoice.findMany({
      include: INVOICE_INCLUDE,
      orderBy: { invoiceDate: "desc" },
      take: limit
    });
    return rows.map((row) => this.toItem(row));
  }

  /** §17: the admin finance table, with filters and per-currency roll-ups. */
  async listAdmin(
    user: User,
    query: AdminInvoiceQuery
  ): Promise<AdminInvoiceListResponse> {
    const where = this.buildAdminWhere(user, query);

    const [rows, total, stats] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        include: INVOICE_INCLUDE,
        orderBy: { invoiceDate: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      }),
      this.prisma.invoice.count({ where }),
      this.computeStats(where)
    ]);

    return {
      invoices: rows.map((row) => this.toItem(row)),
      stats,
      total,
      page: query.page,
      pageSize: query.pageSize
    };
  }

  /** Unpaginated, for CSV export. */
  async listAdminAll(
    user: User,
    query: AdminInvoiceQuery
  ): Promise<InvoiceItem[]> {
    const rows = await this.prisma.invoice.findMany({
      where: this.buildAdminWhere(user, query),
      include: INVOICE_INCLUDE,
      orderBy: { invoiceDate: "desc" },
      take: 5000
    });
    return rows.map((row) => this.toItem(row));
  }

  private buildAdminWhere(
    user: User,
    query: AdminInvoiceQuery
  ): Prisma.InvoiceWhereInput {
    // Belt and braces: the controller already asserts admin, but the row-level
    // filter means a non-admin reaching here still only sees their own.
    const scope: Prisma.InvoiceWhereInput = isAdminRole(user.role)
      ? {}
      : { userId: user.id };

    const dateFilter = buildDateFilter(query.from, query.to);

    return {
      ...scope,
      ...(query.status ? { status: query.status as InvoiceStatus } : {}),
      ...(query.provider ? { paymentProvider: query.provider as never } : {}),
      ...(query.method ? { paymentMethod: query.method as never } : {}),
      ...(query.currency ? { currency: query.currency } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(dateFilter ? { invoiceDate: dateFilter } : {}),
      ...(query.search
        ? {
            OR: [
              { number: { contains: query.search, mode: "insensitive" } },
              { billingName: { contains: query.search, mode: "insensitive" } },
              { billingEmail: { contains: query.search, mode: "insensitive" } },
              { transactionId: { contains: query.search, mode: "insensitive" } },
              {
                order: {
                  orderNumber: { contains: query.search, mode: "insensitive" }
                }
              }
            ]
          }
        : {})
    };
  }

  /**
   * Totals are grouped by currency and never summed across them (§9) — adding
   * rupees to dollars would produce a confident, meaningless number.
   */
  private async computeStats(
    where: Prisma.InvoiceWhereInput
  ): Promise<InvoiceStats> {
    const [byCurrency, totalInvoices, paidInvoices, refundedInvoices, failedPdfCount] =
      await Promise.all([
        this.prisma.invoice.groupBy({
          by: ["currency"],
          where,
          _sum: { total: true, taxTotal: true, amountRefunded: true }
        }),
        this.prisma.invoice.count({ where }),
        this.prisma.invoice.count({
          where: { ...where, status: InvoiceStatus.PAID }
        }),
        this.prisma.invoice.count({
          where: {
            ...where,
            status: {
              in: [InvoiceStatus.REFUNDED, InvoiceStatus.PARTIALLY_REFUNDED]
            }
          }
        }),
        this.prisma.invoice.count({ where: { ...where, pdfStatus: "FAILED" } })
      ]);

    const revenueByCurrency: Record<string, number> = {};
    const taxByCurrency: Record<string, number> = {};
    const refundedByCurrency: Record<string, number> = {};

    for (const group of byCurrency) {
      revenueByCurrency[group.currency] = group._sum.total ?? 0;
      taxByCurrency[group.currency] = group._sum.taxTotal ?? 0;
      refundedByCurrency[group.currency] = group._sum.amountRefunded ?? 0;
    }

    return {
      totalInvoices,
      paidInvoices,
      refundedInvoices,
      failedPdfCount,
      revenueByCurrency,
      taxByCurrency,
      refundedByCurrency
    };
  }

  // ────────────────────────────────────────────────
  // Mapping
  // ────────────────────────────────────────────────

  toItem(row: InvoiceRow): InvoiceItem {
    return {
      id: row.id,
      number: row.number,
      orderId: row.orderId,
      orderNumber: row.order.orderNumber,
      paymentId: row.paymentId,
      userId: row.userId,
      userName: fullName(row.user),
      userEmail: row.user.email,

      status: row.status as InvoiceDocumentStatus,
      pdfStatus: row.pdfStatus,

      subtotal: row.subtotal,
      discountAmount: row.discountAmount,
      discountCode: row.discountCode,
      taxableAmount: row.taxableAmount,
      cgstAmount: row.cgstAmount,
      sgstAmount: row.sgstAmount,
      igstAmount: row.igstAmount,
      taxTotal: row.taxTotal,
      total: row.total,
      amountRefunded: row.amountRefunded,
      currency: row.currency,

      taxTreatment: row.taxTreatment,
      taxRatePercent: row.taxRatePercent,
      taxLabel: row.taxLabel,

      lines: normalizeLines(row.lines),

      billing: {
        name: row.billingName,
        email: row.billingEmail,
        phone: row.billingPhone,
        line1: row.billingLine1,
        line2: row.billingLine2,
        city: row.billingCity,
        state: row.billingState,
        stateCode: row.billingStateCode,
        postalCode: row.billingPostalCode,
        country: row.billingCountry,
        gstin: row.customerGstin,
        businessName: row.businessName
      },
      seller: normalizeSeller(row.seller),
      payment: {
        provider: row.paymentProvider,
        method: row.paymentMethod,
        methodDetail: row.methodDetail,
        transactionId: row.transactionId,
        paidAt: row.paidAt?.toISOString() ?? null
      },

      notes: row.notes,
      terms: row.terms,
      footer: row.footer,

      invoiceDate: row.invoiceDate.toISOString(),
      dueDate: row.dueDate?.toISOString() ?? null,
      paidAt: row.paidAt?.toISOString() ?? null,

      emailSent: row.emailSent,
      emailSentAt: row.emailSentAt?.toISOString() ?? null,

      createdAt: row.createdAt.toISOString()
    };
  }

  // ────────────────────────────────────────────────
  // Printable HTML
  // ────────────────────────────────────────────────

  /**
   * A self-contained printable receipt, kept alongside the PDF. The PDF is the
   * archived artifact; this is for a browser that would rather print than
   * download, and for the email body.
   */
  renderHtml(invoice: InvoiceItem): string {
    const money = (minor: number) => formatMoney(minor, invoice.currency);

    const rows = invoice.lines
      .map(
        (line) => `      <tr>
        <td>${escapeHtml(line.description)}</td>
        <td class="num">${line.quantity}</td>
        <td class="num">${money(line.unitAmount)}</td>
        <td class="num">${money(line.amount)}</td>
      </tr>`
      )
      .join("\n");

    const taxRows = [
      invoice.cgstAmount > 0
        ? [`C${invoice.taxLabel ?? "GST"}`, invoice.cgstAmount]
        : null,
      invoice.sgstAmount > 0
        ? [`S${invoice.taxLabel ?? "GST"}`, invoice.sgstAmount]
        : null,
      invoice.igstAmount > 0
        ? [`I${invoice.taxLabel ?? "GST"}`, invoice.igstAmount]
        : null
    ]
      .filter((entry): entry is [string, number] => entry !== null)
      .map(
        ([label, amount]) =>
          `<tr><td colspan="3" class="num">${escapeHtml(label)}</td><td class="num">${money(amount)}</td></tr>`
      )
      .join("\n");

    const meta = [
      ["Invoice", invoice.number],
      ["Order", invoice.orderNumber],
      ["Invoice date", formatUtcDate(invoice.invoiceDate)],
      ["Status", INVOICE_STATUS_LABELS[invoice.status]],
      [
        "Payment method",
        invoice.payment.method
          ? PAYMENT_METHOD_LABELS[invoice.payment.method]
          : "—"
      ],
      [
        "Provider",
        invoice.payment.provider
          ? PAYMENT_PROVIDER_LABELS[invoice.payment.provider]
          : "—"
      ],
      ["Transaction ID", invoice.payment.transactionId ?? "—"]
    ]
      .map(
        ([label, value]) =>
          `      <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd></div>`
      )
      .join("\n");

    const billing = [
      invoice.billing.businessName,
      invoice.billing.line1,
      invoice.billing.line2,
      [invoice.billing.city, invoice.billing.state].filter(Boolean).join(", "),
      [invoice.billing.postalCode, invoice.billing.country]
        .filter(Boolean)
        .join(" "),
      invoice.billing.gstin ? `GSTIN: ${invoice.billing.gstin}` : null
    ]
      .filter((value): value is string => Boolean(value && value.trim()))
      .map((line) => `<div>${escapeHtml(line)}</div>`)
      .join("\n");

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(invoice.number)}</title>
<style>
  :root { color-scheme: light; }
  body { font: 14px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; color: #14181f; background: #fff; margin: 0; padding: 40px 24px; }
  .sheet { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; color: #4278ce; }
  .muted { color: #5d6672; }
  .parties { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 24px; margin: 24px 0 8px; }
  .label { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #5d6672; margin-bottom: 6px; }
  dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px 24px; margin: 20px 0; }
  dt { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #5d6672; margin: 0; }
  dd { margin: 2px 0 0; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #e4e8ee; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #5d6672; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  tfoot td { border-bottom: none; }
  tfoot tr:last-child td { font-size: 16px; font-weight: 700; border-top: 2px solid #14181f; }
  .notice { margin-top: 16px; padding: 10px 12px; background: #fff4e5; border-radius: 8px; }
  .terms { margin-top: 24px; font-size: 12px; color: #5d6672; white-space: pre-wrap; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="sheet">
    <h1>${escapeHtml(invoice.seller.legalName)}</h1>
    <p class="muted">${escapeHtml(
      [
        invoice.seller.addressLine1,
        invoice.seller.city,
        invoice.seller.postalCode
      ]
        .filter(Boolean)
        .join(", ")
    )}${invoice.seller.gstin ? ` · GSTIN: ${escapeHtml(invoice.seller.gstin)}` : ""}</p>

    <div class="parties">
      <div>
        <div class="label">Bill to</div>
        <div><strong>${escapeHtml(invoice.billing.name)}</strong></div>
        ${billing}
        ${invoice.billing.email ? `<div class="muted">${escapeHtml(invoice.billing.email)}</div>` : ""}
      </div>
    </div>

    <dl>
${meta}
    </dl>

    <table>
      <thead>
        <tr><th>Description</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr>
      </thead>
      <tbody>
${rows}
      </tbody>
      <tfoot>
        <tr><td colspan="3" class="num">Subtotal</td><td class="num">${money(invoice.subtotal)}</td></tr>
        ${
          invoice.discountAmount > 0
            ? `<tr><td colspan="3" class="num">Discount${
                invoice.discountCode
                  ? ` (${escapeHtml(invoice.discountCode)})`
                  : ""
              }</td><td class="num">-${money(invoice.discountAmount)}</td></tr>
        <tr><td colspan="3" class="num">Taxable amount</td><td class="num">${money(invoice.taxableAmount)}</td></tr>`
            : ""
        }
${taxRows}
        <tr><td colspan="3" class="num">Total</td><td class="num">${money(invoice.total)}</td></tr>
      </tfoot>
    </table>

    ${
      invoice.amountRefunded > 0
        ? `<p class="notice">${money(invoice.amountRefunded)} of this invoice has been refunded. See the credit note issued against it.</p>`
        : ""
    }

    ${invoice.terms ? `<div class="terms">${escapeHtml(invoice.terms)}</div>` : ""}
    ${invoice.footer ? `<p class="muted">${escapeHtml(invoice.footer)}</p>` : ""}
  </div>
</body>
</html>`;
  }
}

// ── Helpers ──

/**
 * Reads the stored line JSON back into the current shape. Invoices issued
 * before this feature carry only {description, quantity, unitAmount, amount},
 * and the schema's defaults fill in the rest rather than the reader crashing on
 * a historical receipt.
 */
export function normalizeLines(value: Prisma.JsonValue): InvoiceLine[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const parsed = invoiceLineSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

export function normalizeSeller(value: Prisma.JsonValue): InvoiceSellerDetails {
  const raw = (value ?? {}) as Partial<InvoiceSellerDetails>;
  return {
    legalName: raw.legalName ?? "NexaChess",
    tradeName: raw.tradeName ?? null,
    addressLine1: raw.addressLine1 ?? null,
    addressLine2: raw.addressLine2 ?? null,
    city: raw.city ?? null,
    state: raw.state ?? null,
    stateCode: raw.stateCode ?? null,
    postalCode: raw.postalCode ?? null,
    country: raw.country ?? "IN",
    email: raw.email ?? null,
    phone: raw.phone ?? null,
    website: raw.website ?? null,
    gstin: raw.gstin ?? null,
    pan: raw.pan ?? null,
    logoUrl: raw.logoUrl ?? null
  };
}

export function normalizeBilling(value: Prisma.JsonValue): BillingAddress {
  const raw = (value ?? {}) as Partial<BillingAddress>;
  return {
    name: raw.name ?? "Customer",
    email: raw.email ?? null,
    phone: raw.phone ?? null,
    line1: raw.line1 ?? null,
    line2: raw.line2 ?? null,
    city: raw.city ?? null,
    state: raw.state ?? null,
    stateCode: raw.stateCode ?? null,
    postalCode: raw.postalCode ?? null,
    country: raw.country ?? "IN",
    gstin: raw.gstin ?? null,
    businessName: raw.businessName ?? null
  };
}

/**
 * Date-only bounds are read as UTC days: an invoice's date is a fixed legal
 * fact, so a filter must not slide by a day depending on the admin's zone.
 */
function buildDateFilter(
  from: string | undefined,
  to: string | undefined
): Prisma.DateTimeFilter | null {
  const filter: Prisma.DateTimeFilter = {};
  if (from) filter.gte = new Date(`${from}T00:00:00.000Z`);
  if (to) filter.lte = new Date(`${to}T23:59:59.999Z`);
  return Object.keys(filter).length > 0 ? filter : null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatUtcDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(iso));
}

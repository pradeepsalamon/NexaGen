import { Injectable, NotFoundException } from "@nestjs/common";
import { getApiEnv } from "@nexa-chess/config/api";
import {
  formatMoney,
  PAYMENT_METHOD_LABELS,
  type InvoiceItem,
  type InvoiceLine
} from "@nexa-chess/types";
import { InvoiceStatus, Prisma, type Invoice } from "@prisma/client";
import {
  PrismaService,
  type PrismaTransactionClient
} from "../prisma/prisma.service";
import { assertOwnerOrAdmin, fullName } from "./payments-auth.helper";
import { formatInvoiceNumber } from "./payments.util";
import type { User } from "@prisma/client";

type InvoiceRow = Prisma.InvoiceGetPayload<{
  include: {
    order: { select: { orderNumber: true } };
    payment: {
      select: { providerPaymentId: true; paymentMethod: true; provider: true };
    };
    user: { select: { firstName: true; lastName: true; email: true } };
  };
}>;

const INVOICE_INCLUDE = {
  order: { select: { orderNumber: true } },
  payment: {
    select: { providerPaymentId: true, paymentMethod: true, provider: true }
  },
  user: { select: { firstName: true, lastName: true, email: true } }
} satisfies Prisma.InvoiceInclude;

/**
 * Invoices and receipts (§15). Issued once per order, at capture, inside the
 * capture transaction — so a paid order always has a receipt and a receipt
 * never exists for an unpaid one.
 */
@Injectable()
export class InvoiceService {
  private readonly env = getApiEnv();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Issues the invoice for a captured order. Idempotent on the unique orderId:
   * a replayed capture returns the existing invoice rather than renumbering.
   *
   * Numbering comes from InvoiceSequence, incremented in this same transaction,
   * so two concurrent captures get consecutive numbers and never collide.
   */
  async issue(
    tx: PrismaTransactionClient,
    input: {
      orderId: string;
      paymentId: string;
      userId: string;
      description: string;
      subtotal: number;
      /** Minor units taken off by a code; 0 when none applied. */
      discountAmount?: number;
      discountCode?: string | null;
      taxAmount: number;
      taxPercent: number;
      currency: string;
      paidAt: Date;
    }
  ): Promise<Invoice> {
    const existing = await tx.invoice.findUnique({
      where: { orderId: input.orderId }
    });
    if (existing) return existing;

    const year = input.paidAt.getUTCFullYear();
    const sequence = await tx.invoiceSequence.upsert({
      where: { year },
      create: { year, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } }
    });

    const discountAmount = input.discountAmount ?? 0;

    const lines: InvoiceLine[] = [
      {
        description: input.description,
        quantity: 1,
        unitAmount: input.subtotal,
        amount: input.subtotal
      }
    ];

    // A discount is its own negative line rather than a quietly reduced price,
    // so the receipt shows what the buyer was charged AND what they saved.
    if (discountAmount > 0) {
      lines.push({
        description: input.discountCode
          ? `Discount (${input.discountCode})`
          : "Discount",
        quantity: 1,
        unitAmount: -discountAmount,
        amount: -discountAmount
      });
    }

    return tx.invoice.create({
      data: {
        number: formatInvoiceNumber(
          this.env.PAYMENTS_INVOICE_PREFIX,
          year,
          sequence.lastNumber
        ),
        orderId: input.orderId,
        paymentId: input.paymentId,
        userId: input.userId,
        status: InvoiceStatus.PAID,
        subtotal: input.subtotal,
        taxAmount: input.taxAmount,
        taxPercent: input.taxPercent,
        taxLabel: input.taxAmount > 0 ? this.env.PAYMENTS_TAX_LABEL : null,
        total: input.subtotal - discountAmount + input.taxAmount,
        currency: input.currency,
        lines: lines as unknown as Prisma.InputJsonValue,
        sellerName: this.env.PAYMENTS_SELLER_NAME ?? null,
        sellerAddress: this.env.PAYMENTS_SELLER_ADDRESS ?? null,
        sellerTaxId: this.env.PAYMENTS_SELLER_TAX_ID ?? null,
        issuedAt: input.paidAt,
        paidAt: input.paidAt
      }
    });
  }

  /** Keeps the receipt honest after money goes back out. */
  async recordRefund(
    tx: PrismaTransactionClient,
    orderId: string,
    amountRefunded: number,
    fullyRefunded: boolean
  ): Promise<void> {
    const invoice = await tx.invoice.findUnique({ where: { orderId } });
    if (!invoice) return;

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        amountRefunded,
        status: fullyRefunded ? InvoiceStatus.REFUNDED : invoice.status
      }
    });
  }

  async get(user: User, invoiceId: string): Promise<InvoiceItem> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: INVOICE_INCLUDE
    });
    if (!invoice) throw new NotFoundException("Invoice not found.");

    assertOwnerOrAdmin(user, invoice.userId);
    return this.toItem(invoice);
  }

  async listForUser(userId: string): Promise<InvoiceItem[]> {
    const rows = await this.prisma.invoice.findMany({
      where: { userId },
      include: INVOICE_INCLUDE,
      orderBy: { issuedAt: "desc" },
      take: 200
    });
    return rows.map((row) => this.toItem(row));
  }

  async listAll(limit = 200): Promise<InvoiceItem[]> {
    const rows = await this.prisma.invoice.findMany({
      include: INVOICE_INCLUDE,
      orderBy: { issuedAt: "desc" },
      take: limit
    });
    return rows.map((row) => this.toItem(row));
  }

  /**
   * A self-contained printable receipt. HTML rather than a PDF binary: it
   * prints to PDF from any browser, needs no extra dependency on an ARM box,
   * and stays readable if it is ever emailed.
   */
  renderHtml(invoice: InvoiceItem): string {
    const money = (minor: number) => formatMoney(minor, invoice.currency);
    // Discount lines are stored negative; the footer shows them as a positive
    // "you saved" figure.
    const discountTotal = invoice.lines
      .filter((line) => line.amount < 0)
      .reduce((sum, line) => sum - line.amount, 0);
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

    const meta = [
      ["Invoice", invoice.number],
      ["Order", invoice.orderNumber],
      ["Issued", formatIsoDate(invoice.issuedAt)],
      ["Billed to", invoice.userName ?? invoice.userEmail ?? "—"],
      ["Payment method", invoice.method ? PAYMENT_METHOD_LABELS[invoice.method] : "—"],
      ["Transaction ID", invoice.transactionId ?? "—"]
    ]
      .map(
        ([label, value]) =>
          `      <div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(String(value))}</dd></div>`
      )
      .join("\n");

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(invoice.number)}</title>
<style>
  :root { color-scheme: light; }
  body { font: 14px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; color: #14181f; background: #fff; margin: 0; padding: 40px 24px; }
  .sheet { max-width: 720px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .muted { color: #5d6672; }
  dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 24px; margin: 28px 0; }
  dt { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #5d6672; margin: 0; }
  dd { margin: 2px 0 0; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { text-align: left; padding: 10px 8px; border-bottom: 1px solid #e4e8ee; }
  th { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #5d6672; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  tfoot td { border-bottom: none; }
  tfoot tr:last-child td { font-size: 16px; font-weight: 700; border-top: 2px solid #14181f; }
  .refunded { margin-top: 16px; padding: 10px 12px; background: #fff4e5; border-radius: 8px; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <div class="sheet">
    <h1>${escapeHtml(invoice.sellerName ?? "Nexa Chess")}</h1>
    <p class="muted">${escapeHtml(invoice.sellerAddress ?? "")}${
      invoice.sellerTaxId ? ` · ${escapeHtml(invoice.sellerTaxId)}` : ""
    }</p>

    <dl>
${meta}
    </dl>

    <table>
      <thead>
        <tr><th>Description</th><th class="num">Qty</th><th class="num">Unit</th><th class="num">Amount</th></tr>
      </thead>
      <tbody>
${rows}
      </tbody>
      <tfoot>
        <tr><td colspan="3" class="num">Subtotal</td><td class="num">${money(invoice.subtotal)}</td></tr>
        ${
          discountTotal > 0
            ? `<tr><td colspan="3" class="num">Discount</td><td class="num">-${money(discountTotal)}</td></tr>`
            : ""
        }
        ${
          invoice.taxAmount > 0
            ? `<tr><td colspan="3" class="num">${escapeHtml(
                invoice.taxLabel ?? "Tax"
              )} (${invoice.taxPercent}%)</td><td class="num">${money(invoice.taxAmount)}</td></tr>`
            : ""
        }
        <tr><td colspan="3" class="num">Total paid</td><td class="num">${money(invoice.total)}</td></tr>
      </tfoot>
    </table>

    ${
      invoice.amountRefunded > 0
        ? `<p class="refunded">${money(invoice.amountRefunded)} of this payment has been refunded.</p>`
        : ""
    }
  </div>
</body>
</html>`;
  }

  private toItem(row: InvoiceRow): InvoiceItem {
    const lines = Array.isArray(row.lines)
      ? (row.lines as unknown as InvoiceLine[])
      : [];

    return {
      id: row.id,
      number: row.number,
      orderId: row.orderId,
      orderNumber: row.order.orderNumber,
      userName: fullName(row.user),
      userEmail: row.user.email,
      status: row.status,
      subtotal: row.subtotal,
      taxAmount: row.taxAmount,
      taxPercent: row.taxPercent,
      taxLabel: row.taxLabel,
      total: row.total,
      amountRefunded: row.amountRefunded,
      currency: row.currency,
      lines,
      transactionId: row.payment?.providerPaymentId ?? null,
      method: row.payment?.paymentMethod ?? null,
      issuedAt: row.issuedAt.toISOString(),
      paidAt: row.paidAt?.toISOString() ?? null,
      sellerName: row.sellerName,
      sellerAddress: row.sellerAddress,
      sellerTaxId: row.sellerTaxId
    };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Invoices carry a fixed legal date, so this deliberately renders in UTC rather
 * than a viewer's zone — a receipt must not change date depending on who opens
 * it.
 */
function formatIsoDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(iso));
}

import { createRequire } from "node:module";
import * as path from "node:path";
import { Injectable } from "@nestjs/common";
import {
  CREDIT_NOTE_REASON_LABELS,
  formatMoney,
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_SOURCE_LABELS,
  stateNameFromCode,
  type BillingAddress,
  type CreditNoteItem,
  type InvoiceItem,
  type InvoiceLine,
  type InvoiceSellerDetails
} from "@nexa-chess/types";

const requireFromHere = createRequire(__filename);

// ── Brand ──
// Matches the web theme's --rgb-primary (66 120 206) so a printed invoice and
// the dashboard it came from look like the same product.
const BRAND = "#4278CE";
const INK = "#14181F";
const MUTED = "#5D6672";
const RULE = "#E4E8EE";
const SOFT = "#F6F8FB";
const POSITIVE = "#177245";

const PAGE_MARGIN_X = 42;

type PdfPrinterLike = {
  createPdfKitDocument(
    definition: Record<string, unknown>,
    options?: Record<string, unknown>
  ): Promise<NodeJS.ReadableStream & { end(): void }>;
};

/**
 * Invoice and credit-note PDFs (§11, §12).
 *
 * pdfmake rather than headless Chrome: this box is a 2-vCPU ARM64 VPS that
 * already runs LiveKit egress' Chromium during recordings, and a second browser
 * competing for those cores is how a class loses its recording. pdfmake is pure
 * JS, its table primitive paginates on its own (§22 "large invoice"), and the
 * Roboto it bundles carries real glyphs for ₹, €, £ and the bullet used in the
 * masked card descriptor — so no extra font has to ship in the image.
 */
@Injectable()
export class InvoicePdfService {
  private printer: PdfPrinterLike | null = null;

  async renderInvoice(invoice: InvoiceItem): Promise<Buffer> {
    return this.render(this.invoiceDefinition(invoice));
  }

  async renderCreditNote(creditNote: CreditNoteItem): Promise<Buffer> {
    return this.render(this.creditNoteDefinition(creditNote));
  }

  // ────────────────────────────────────────────────
  // Engine
  // ────────────────────────────────────────────────

  /**
   * Built lazily and cached: reading four TTFs and constructing the printer is
   * wasted work on a box that never issues an invoice.
   */
  private getPrinter(): PdfPrinterLike {
    if (this.printer) return this.printer;

    /* eslint-disable @typescript-eslint/no-var-requires */
    const PdfPrinter = requireFromHere("pdfmake/js/Printer.js").default;
    const URLResolver = requireFromHere("pdfmake/js/URLResolver.js").default;
    const virtualFsModule = requireFromHere("pdfmake/js/virtual-fs.js");
    /* eslint-enable @typescript-eslint/no-var-requires */

    const virtualFs = virtualFsModule.default ?? virtualFsModule;

    // Resolved through the package rather than a relative path, so it works
    // the same from src/, from dist/, and inside the Docker image.
    const fontDir = path.join(
      path.dirname(requireFromHere.resolve("pdfmake/package.json")),
      "fonts",
      "Roboto"
    );

    const fonts = {
      Roboto: {
        normal: path.join(fontDir, "Roboto-Regular.ttf"),
        bold: path.join(fontDir, "Roboto-Medium.ttf"),
        italics: path.join(fontDir, "Roboto-Italic.ttf"),
        bolditalics: path.join(fontDir, "Roboto-MediumItalic.ttf")
      }
    };

    this.printer = new PdfPrinter(
      fonts,
      virtualFs,
      new URLResolver(virtualFs),
      // Fonts are read from disk; nothing in a document definition we build
      // ever references a local path, so this only ever sees our own TTFs.
      () => true
    ) as PdfPrinterLike;

    return this.printer;
  }

  private async render(definition: Record<string, unknown>): Promise<Buffer> {
    const document = await this.getPrinter().createPdfKitDocument(definition);

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      document.on("data", (chunk: Buffer) => chunks.push(chunk));
      document.on("end", () => resolve(Buffer.concat(chunks)));
      document.on("error", reject);
      document.end();
    });
  }

  // ────────────────────────────────────────────────
  // Invoice document
  // ────────────────────────────────────────────────

  private invoiceDefinition(invoice: InvoiceItem): Record<string, unknown> {
    const money = (minor: number) => formatMoney(minor, invoice.currency);
    const isRefunded = invoice.amountRefunded > 0;

    return {
      pageSize: "A4",
      pageMargins: [PAGE_MARGIN_X, 44, PAGE_MARGIN_X, 68],
      info: {
        title: invoice.number,
        author: invoice.seller.legalName,
        subject: `Invoice ${invoice.number}`
      },
      defaultStyle: { font: "Roboto", fontSize: 9.5, color: INK, lineHeight: 1.25 },
      styles: PDF_STYLES,
      footer: this.footer(invoice.seller, invoice.footer),
      content: [
        this.documentHeader({
          seller: invoice.seller,
          title: "INVOICE",
          number: invoice.number,
          badge: INVOICE_STATUS_LABELS[invoice.status],
          badgePositive: invoice.status === "PAID"
        }),
        this.partiesBlock(invoice),
        this.lineItemsTable(invoice.lines, invoice.currency),
        this.totalsBlock(invoice, money),
        ...(isRefunded ? [this.refundNotice(invoice, money)] : []),
        this.paymentBlock(invoice),
        ...this.closingBlocks(invoice.seller, invoice.terms, invoice.notes)
      ]
    };
  }

  /**
   * The masthead. `unbreakable` keeps the brand line and the invoice number
   * from splitting across a page break when content reflows.
   */
  private documentHeader(input: {
    seller: InvoiceSellerDetails;
    title: string;
    number: string;
    badge: string;
    badgePositive: boolean;
    subtitle?: string;
  }): Record<string, unknown> {
    const { seller } = input;

    return {
      unbreakable: true,
      margin: [0, 0, 0, 18],
      stack: [
        {
          columns: [
            {
              width: "*",
              stack: [
                {
                  text: (seller.tradeName ?? seller.legalName).toUpperCase(),
                  style: "brand"
                },
                {
                  // The registered name still has to appear; it just is not
                  // the masthead when a shorter trading name exists.
                  text: seller.tradeName ? seller.legalName : "Chess Learning Platform",
                  style: "brandSub"
                }
              ]
            },
            {
              width: "auto",
              alignment: "right",
              stack: [
                { text: input.title, style: "docTitle" },
                { text: input.number, style: "docNumber" },
                ...(input.subtitle
                  ? [{ text: input.subtitle, style: "muted" }]
                  : []),
                {
                  text: input.badge,
                  style: input.badgePositive ? "badgePaid" : "badge",
                  margin: [0, 6, 0, 0]
                }
              ]
            }
          ]
        },
        { canvas: [rule(0, 14, 511)], margin: [0, 0, 0, 0] }
      ]
    };
  }

  /** Bill To beside Invoice Details — the §11 two-column band. */
  private partiesBlock(invoice: InvoiceItem): Record<string, unknown> {
    return {
      margin: [0, 16, 0, 18],
      columns: [
        {
          width: "52%",
          stack: [
            { text: "BILL TO", style: "sectionLabel" },
            ...this.billingLines(invoice.billing)
          ]
        },
        {
          width: "*",
          stack: [
            { text: "INVOICE DETAILS", style: "sectionLabel" },
            this.metaTable([
              ["Invoice date", formatDocumentDate(invoice.invoiceDate)],
              ...(invoice.dueDate
                ? ([["Due date", formatDocumentDate(invoice.dueDate)]] as [
                    string,
                    string
                  ][])
                : []),
              ...(invoice.payment.paidAt
                ? ([
                    ["Payment date", formatDocumentDate(invoice.payment.paidAt)]
                  ] as [string, string][])
                : []),
              ["Order", invoice.orderNumber],
              ...(invoice.payment.transactionId
                ? ([["Transaction ID", invoice.payment.transactionId]] as [
                    string,
                    string
                  ][])
                : [])
            ])
          ]
        }
      ]
    };
  }

  /**
   * The buyer's address. Every part is optional except the name — a parent
   * buying a single class never typed an address, and the block has to look
   * deliberate rather than broken when it is mostly empty.
   */
  private billingLines(billing: BillingAddress): Record<string, unknown>[] {
    const lines: Record<string, unknown>[] = [
      { text: billing.name, style: "partyName" }
    ];

    if (billing.businessName) {
      lines.push({ text: billing.businessName, style: "body" });
    }

    const address = [
      billing.line1,
      billing.line2,
      [billing.city, billing.state].filter(Boolean).join(", ") || null,
      [billing.postalCode, billing.country].filter(Boolean).join(" ") || null
    ].filter((value): value is string => Boolean(value && value.trim()));

    for (const line of address) {
      lines.push({ text: line, style: "body" });
    }

    if (billing.email) lines.push({ text: billing.email, style: "muted" });
    if (billing.phone) lines.push({ text: billing.phone, style: "muted" });

    if (billing.gstin) {
      lines.push({
        text: `GSTIN: ${billing.gstin}`,
        style: "bodyStrong",
        margin: [0, 4, 0, 0]
      });
      const stateName = stateNameFromCode(billing.stateCode);
      if (stateName) {
        lines.push({ text: `Place of supply: ${stateName}`, style: "muted" });
      }
    }

    return lines;
  }

  private metaTable(rows: [string, string][]): Record<string, unknown> {
    return {
      table: {
        widths: ["auto", "*"],
        body: rows.map(([label, value]) => [
          { text: label, style: "metaLabel" },
          { text: value, style: "metaValue", alignment: "right" }
        ])
      },
      layout: "noBorders",
      margin: [0, 2, 0, 0]
    };
  }

  // ────────────────────────────────────────────────
  // Line items
  // ────────────────────────────────────────────────

  /**
   * `headerRows: 1` plus `dontBreakRows` is what makes a long invoice paginate
   * properly (§22): the column header repeats on every page and no single line
   * is split down the middle by a page break.
   */
  private lineItemsTable(
    lines: InvoiceLine[],
    currency: string
  ): Record<string, unknown> {
    const money = (minor: number) => formatMoney(minor, currency);
    const anyTax = lines.some((line) => line.taxAmount > 0 || line.taxRate > 0);
    const anyDiscount = lines.some((line) => line.discountAmount > 0);

    const header = [
      { text: "DESCRIPTION", style: "th" },
      { text: "QTY", style: "th", alignment: "right" },
      { text: "RATE", style: "th", alignment: "right" },
      ...(anyDiscount
        ? [{ text: "DISCOUNT", style: "th", alignment: "right" }]
        : []),
      ...(anyTax ? [{ text: "TAX", style: "th", alignment: "right" }] : []),
      { text: "AMOUNT", style: "th", alignment: "right" }
    ];

    const body = lines.map((line) => [
      { text: line.description, style: "td" },
      { text: String(line.quantity), style: "td", alignment: "right" },
      { text: money(line.unitAmount), style: "tdNum", alignment: "right" },
      ...(anyDiscount
        ? [
            {
              text: line.discountAmount > 0 ? `-${money(line.discountAmount)}` : "—",
              style: "tdNum",
              alignment: "right"
            }
          ]
        : []),
      ...(anyTax
        ? [
            {
              text: line.taxRate > 0 ? `${trimPercent(line.taxRate)}%` : "—",
              style: "tdNum",
              alignment: "right"
            }
          ]
        : []),
      { text: money(line.amount), style: "tdNum", alignment: "right" }
    ]);

    const widths = [
      "*",
      28,
      64,
      ...(anyDiscount ? [64] : []),
      ...(anyTax ? [42] : []),
      70
    ];

    return {
      table: { headerRows: 1, dontBreakRows: true, widths, body: [header, ...body] },
      layout: {
        hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
          i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.5,
        vLineWidth: () => 0,
        hLineColor: (i: number) => (i <= 1 ? INK : RULE),
        paddingTop: () => 7,
        paddingBottom: () => 7,
        paddingLeft: (i: number) => (i === 0 ? 0 : 6),
        paddingRight: (i: number, node: { table: { widths: unknown[] } }) =>
          i === node.table.widths.length - 1 ? 0 : 6
      },
      margin: [0, 0, 0, 14]
    };
  }

  // ────────────────────────────────────────────────
  // Totals
  // ────────────────────────────────────────────────

  /**
   * Right-aligned summary. The tax rows are driven by which components are
   * actually non-zero, so an intra-state sale shows CGST + SGST, an inter-state
   * one shows IGST, and an export shows neither rather than a row of zeroes.
   */
  private totalsBlock(
    invoice: InvoiceItem,
    money: (minor: number) => string
  ): Record<string, unknown> {
    const rows: [string, string, boolean][] = [
      ["Subtotal", money(invoice.subtotal), false]
    ];

    if (invoice.discountAmount > 0) {
      rows.push([
        invoice.discountCode ? `Discount (${invoice.discountCode})` : "Discount",
        `-${money(invoice.discountAmount)}`,
        false
      ]);
      rows.push(["Taxable amount", money(invoice.taxableAmount), false]);
    }

    const taxLabel = invoice.taxLabel ?? "GST";
    if (invoice.cgstAmount > 0) {
      rows.push([
        `C${taxLabel} ${trimPercent(invoice.taxRatePercent / 2)}%`,
        money(invoice.cgstAmount),
        false
      ]);
    }
    if (invoice.sgstAmount > 0) {
      rows.push([
        `S${taxLabel} ${trimPercent(invoice.taxRatePercent / 2)}%`,
        money(invoice.sgstAmount),
        false
      ]);
    }
    if (invoice.igstAmount > 0) {
      rows.push([
        `I${taxLabel} ${trimPercent(invoice.taxRatePercent)}%`,
        money(invoice.igstAmount),
        false
      ]);
    }
    if (invoice.taxTotal > 0) {
      rows.push([`Total ${taxLabel}`, money(invoice.taxTotal), true]);
    }

    return {
      unbreakable: true,
      columns: [
        { width: "*", text: "" },
        {
          width: 240,
          stack: [
            {
              table: {
                widths: ["*", "auto"],
                body: rows.map(([label, value, strong]) => [
                  { text: label, style: strong ? "totalLabelStrong" : "totalLabel" },
                  {
                    text: value,
                    style: strong ? "totalValueStrong" : "totalValue",
                    alignment: "right"
                  }
                ])
              },
              layout: "noBorders"
            },
            { canvas: [rule(0, 6, 240, INK, 1.2)] },
            {
              table: {
                widths: ["*", "auto"],
                body: [
                  [
                    { text: "TOTAL", style: "grandLabel" },
                    {
                      text: money(invoice.total),
                      style: "grandValue",
                      alignment: "right"
                    }
                  ],
                  [
                    { text: "Currency", style: "muted" },
                    {
                      text: invoice.currency.toUpperCase(),
                      style: "muted",
                      alignment: "right"
                    }
                  ]
                ]
              },
              layout: "noBorders",
              margin: [0, 6, 0, 0]
            }
          ]
        }
      ],
      margin: [0, 0, 0, 16]
    };
  }

  private refundNotice(
    invoice: InvoiceItem,
    money: (minor: number) => string
  ): Record<string, unknown> {
    const full = invoice.amountRefunded >= invoice.total;
    return {
      unbreakable: true,
      table: {
        widths: ["*"],
        body: [
          [
            {
              text: full
                ? `This invoice has been fully refunded (${money(invoice.amountRefunded)}). See the credit note issued against it.`
                : `${money(invoice.amountRefunded)} of this invoice has been refunded. See the credit note issued against it.`,
              style: "notice"
            }
          ]
        ]
      },
      layout: noticeLayout("#FFF4E5"),
      margin: [0, 0, 0, 16]
    };
  }

  /**
   * Payment facts (§10). Everything here came from the provider and is already
   * safe to print — there is no branch that could reach a PAN, CVV or PIN,
   * because those values never enter this system at all.
   */
  private paymentBlock(invoice: InvoiceItem): Record<string, unknown> {
    const entries: [string, string][] = [
      ["Payment status", INVOICE_STATUS_LABELS[invoice.status].toUpperCase()]
    ];

    if (invoice.payment.provider) {
      entries.push([
        "Payment provider",
        PAYMENT_SOURCE_LABELS[invoice.payment.provider]
      ]);
    }
    if (invoice.payment.method) {
      entries.push([
        "Payment method",
        formatMethodDetail(
          PAYMENT_METHOD_LABELS[invoice.payment.method],
          invoice.payment.methodDetail
        )
      ]);
    }
    if (invoice.payment.transactionId) {
      entries.push(["Transaction ID", invoice.payment.transactionId]);
    }
    if (invoice.payment.paidAt) {
      entries.push(["Payment date", formatDocumentDate(invoice.payment.paidAt)]);
    }

    return {
      unbreakable: true,
      table: {
        widths: ["*"],
        body: [
          [
            {
              stack: [
                { text: "PAYMENT", style: "sectionLabel" },
                {
                  columns: entries.map(([label, value]) => ({
                    width: "*",
                    stack: [
                      { text: label, style: "metaLabel" },
                      { text: value, style: "metaValue" }
                    ]
                  })),
                  columnGap: 12,
                  margin: [0, 4, 0, 0]
                }
              ]
            }
          ]
        ]
      },
      layout: noticeLayout(SOFT),
      margin: [0, 0, 0, 16]
    };
  }

  private closingBlocks(
    seller: InvoiceSellerDetails,
    terms: string | null,
    notes: string | null
  ): Record<string, unknown>[] {
    const blocks: Record<string, unknown>[] = [
      {
        text: `Thank you for choosing ${seller.tradeName ?? seller.legalName}!`,
        style: "thanks",
        margin: [0, 0, 0, 10]
      }
    ];

    if (notes) {
      blocks.push({ text: "NOTES", style: "sectionLabel" });
      blocks.push({ text: notes, style: "fine", margin: [0, 2, 0, 10] });
    }

    if (terms) {
      blocks.push({ text: "TERMS & CONDITIONS", style: "sectionLabel" });
      blocks.push({ text: terms, style: "fine", margin: [0, 2, 0, 0] });
    }

    return blocks;
  }

  // ────────────────────────────────────────────────
  // Credit note document
  // ────────────────────────────────────────────────

  private creditNoteDefinition(note: CreditNoteItem): Record<string, unknown> {
    const money = (minor: number) => formatMoney(minor, note.currency);

    const taxRows: [string, string][] = [];
    if (note.cgstAmount > 0) taxRows.push(["CGST", money(note.cgstAmount)]);
    if (note.sgstAmount > 0) taxRows.push(["SGST", money(note.sgstAmount)]);
    if (note.igstAmount > 0) taxRows.push(["IGST", money(note.igstAmount)]);

    return {
      pageSize: "A4",
      pageMargins: [PAGE_MARGIN_X, 44, PAGE_MARGIN_X, 68],
      info: {
        title: note.number,
        author: note.seller.legalName,
        subject: `Credit note ${note.number}`
      },
      defaultStyle: { font: "Roboto", fontSize: 9.5, color: INK, lineHeight: 1.25 },
      styles: PDF_STYLES,
      footer: this.footer(note.seller, null),
      content: [
        this.documentHeader({
          seller: note.seller,
          title: "CREDIT NOTE",
          number: note.number,
          subtitle: `Against invoice ${note.invoiceNumber}`,
          badge: note.isFullCredit ? "FULL CREDIT" : "PARTIAL CREDIT",
          badgePositive: false
        }),
        {
          margin: [0, 16, 0, 18],
          columns: [
            {
              width: "52%",
              stack: [
                { text: "CREDIT TO", style: "sectionLabel" },
                ...this.billingLines(note.billing)
              ]
            },
            {
              width: "*",
              stack: [
                { text: "CREDIT DETAILS", style: "sectionLabel" },
                this.metaTable([
                  ["Credit note date", formatDocumentDate(note.issuedAt)],
                  ["Original invoice", note.invoiceNumber],
                  ["Reason", CREDIT_NOTE_REASON_LABELS[note.reason]],
                  ...(note.providerRefundId
                    ? ([["Refund reference", note.providerRefundId]] as [
                        string,
                        string
                      ][])
                    : [])
                ])
              ]
            }
          ]
        },
        this.lineItemsTable(note.lines, note.currency),
        {
          unbreakable: true,
          columns: [
            { width: "*", text: "" },
            {
              width: 240,
              stack: [
                {
                  table: {
                    widths: ["*", "auto"],
                    body: [
                      [
                        { text: "Credited amount", style: "totalLabel" },
                        {
                          text: money(note.subtotal),
                          style: "totalValue",
                          alignment: "right"
                        }
                      ],
                      ...taxRows.map(([label, value]) => [
                        { text: label, style: "totalLabel" },
                        { text: value, style: "totalValue", alignment: "right" }
                      ])
                    ]
                  },
                  layout: "noBorders"
                },
                { canvas: [rule(0, 6, 240, INK, 1.2)] },
                {
                  table: {
                    widths: ["*", "auto"],
                    body: [
                      [
                        { text: "TOTAL CREDITED", style: "grandLabel" },
                        {
                          text: money(note.total),
                          style: "grandValue",
                          alignment: "right"
                        }
                      ]
                    ]
                  },
                  layout: "noBorders",
                  margin: [0, 6, 0, 0]
                }
              ]
            }
          ],
          margin: [0, 0, 0, 16]
        },
        {
          unbreakable: true,
          table: {
            widths: ["*"],
            body: [
              [
                {
                  text: `This credit note reverses part or all of invoice ${note.invoiceNumber}. The original invoice remains valid and unchanged.`,
                  style: "notice"
                }
              ]
            ]
          },
          layout: noticeLayout(SOFT),
          margin: [0, 0, 0, 14]
        },
        ...(note.note
          ? [
              { text: "NOTES", style: "sectionLabel" },
              { text: note.note, style: "fine" }
            ]
          : [])
      ]
    };
  }

  // ────────────────────────────────────────────────
  // Shared chrome
  // ────────────────────────────────────────────────

  /**
   * Runs on every page, which is what gives a multi-page invoice its "Page 2 of
   * 3" and keeps the seller's contact details on whatever sheet someone files.
   */
  private footer(seller: InvoiceSellerDetails, extra: string | null) {
    const contact = [
      [seller.addressLine1, seller.addressLine2, seller.city, seller.postalCode]
        .filter(Boolean)
        .join(", "),
      seller.gstin ? `GSTIN: ${seller.gstin}` : null,
      seller.pan ? `PAN: ${seller.pan}` : null
    ]
      .filter(Boolean)
      .join("  ·  ");

    const support = [seller.email, seller.phone, seller.website]
      .filter(Boolean)
      .join("  ·  ");

    return (currentPage: number, pageCount: number) => ({
      margin: [PAGE_MARGIN_X, 10, PAGE_MARGIN_X, 0],
      stack: [
        { canvas: [rule(0, 0, 511)] },
        {
          columns: [
            {
              width: "*",
              stack: [
                ...(contact ? [{ text: contact, style: "footer" }] : []),
                ...(support ? [{ text: support, style: "footer" }] : []),
                ...(extra ? [{ text: extra, style: "footer" }] : [])
              ]
            },
            {
              width: "auto",
              text: `Page ${currentPage} of ${pageCount}`,
              style: "footer",
              alignment: "right"
            }
          ],
          margin: [0, 6, 0, 0]
        }
      ]
    });
  }
}

// ── Styles ──

const PDF_STYLES: Record<string, Record<string, unknown>> = {
  brand: { fontSize: 19, bold: true, color: BRAND, letterSpacing: 0.6 },
  brandSub: { fontSize: 8.5, color: MUTED, margin: [0, 2, 0, 0] },
  docTitle: { fontSize: 17, bold: true, color: INK, letterSpacing: 1.4 },
  docNumber: { fontSize: 10, color: MUTED, margin: [0, 2, 0, 0] },

  sectionLabel: {
    fontSize: 7.5,
    bold: true,
    color: MUTED,
    letterSpacing: 0.8,
    margin: [0, 0, 0, 5]
  },
  partyName: { fontSize: 11.5, bold: true, color: INK, margin: [0, 0, 0, 2] },
  body: { fontSize: 9.5, color: INK },
  bodyStrong: { fontSize: 9.5, bold: true, color: INK },
  muted: { fontSize: 8.5, color: MUTED },
  fine: { fontSize: 8, color: MUTED, lineHeight: 1.35 },

  metaLabel: { fontSize: 7.5, color: MUTED, letterSpacing: 0.4 },
  metaValue: { fontSize: 9.5, bold: true, color: INK },

  th: { fontSize: 7.5, bold: true, color: MUTED, letterSpacing: 0.7 },
  td: { fontSize: 9.5, color: INK },
  tdNum: { fontSize: 9.5, color: INK },

  totalLabel: { fontSize: 9, color: MUTED, margin: [0, 2, 0, 2] },
  totalValue: { fontSize: 9, color: INK, margin: [0, 2, 0, 2] },
  totalLabelStrong: { fontSize: 9, bold: true, color: INK, margin: [0, 2, 0, 2] },
  totalValueStrong: { fontSize: 9, bold: true, color: INK, margin: [0, 2, 0, 2] },
  grandLabel: { fontSize: 11, bold: true, color: INK, letterSpacing: 0.6 },
  grandValue: { fontSize: 14, bold: true, color: BRAND },

  badge: {
    fontSize: 8,
    bold: true,
    color: MUTED,
    letterSpacing: 0.8
  },
  badgePaid: { fontSize: 8, bold: true, color: POSITIVE, letterSpacing: 0.8 },

  notice: { fontSize: 8.5, color: INK, lineHeight: 1.3 },
  thanks: { fontSize: 10, bold: true, color: INK },
  footer: { fontSize: 7, color: MUTED }
};

// ── Small helpers ──

function rule(
  x: number,
  y: number,
  width: number,
  color: string = RULE,
  thickness = 0.8
) {
  return {
    type: "line",
    x1: x,
    y1: y,
    x2: x + width,
    y2: y,
    lineWidth: thickness,
    lineColor: color
  };
}

/** A padded tinted panel, used for the payment and notice blocks. */
function noticeLayout(fill: string) {
  return {
    hLineWidth: () => 0,
    vLineWidth: () => 0,
    fillColor: () => fill,
    paddingTop: () => 10,
    paddingBottom: () => 10,
    paddingLeft: () => 12,
    paddingRight: () => 12
  };
}

/** 18 not 18.0, but 2.5 stays 2.5. */
function trimPercent(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, "");
}

/**
 * An invoice carries a fixed legal date, so this renders in UTC on purpose: a
 * receipt must not appear to change date depending on who opens it or where.
 */
function formatDocumentDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(iso));
}

/**
 * "UPI", "UPI - googlepay", "Cards - Visa •••• 4242".
 *
 * Providers hand back details in their own shapes ("upi/googlepay",
 * "card/Visa 4242"), often already naming the method. Prefixing blindly
 * produced "UPI - UPI - googlepay", so a detail that already leads with the
 * method has that prefix stripped before the label is applied.
 *
 * Everything here is provider-supplied and already safe to print: a PAN, CVV or
 * PIN never enters this system, so there is no branch that could leak one.
 */
export function formatMethodDetail(
  label: string,
  detail: string | null
): string {
  if (!detail) return label;

  const cleaned = detail
    .replace(/[_/]+/g, " ")
    .trim()
    .replace(new RegExp(`^${escapeRegExp(label)}[\\s\\u2014-]*`, "i"), "")
    .trim();

  return cleaned && cleaned.toLowerCase() !== label.toLowerCase()
    ? `${label} — ${cleaned}`
    : label;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

import { createRequire } from "node:module";
import * as path from "node:path";
import { Injectable } from "@nestjs/common";
import {
  formatMoney,
  PAYOUT_STATUS_LABELS,
  PAYSLIP_DOCUMENT_KIND_LABELS,
  type PayrollLineItem,
  type PayslipDocument
} from "@nexa-chess/types";

const requireFromHere = createRequire(__filename);

// Same brand palette as invoice-pdf.service.ts, so a coach's payslip and a
// parent's invoice read as the same product.
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
 * Payslip / Coach Payment Statement PDFs (§16/§17).
 *
 * Same pdfmake approach as `invoice-pdf.service.ts` for the same reason: this
 * box's two vCPUs already run LiveKit egress' Chromium during recordings, and
 * pdfmake's bundled Roboto has real ₹/€/£ glyphs with no extra font to ship.
 * `documentKind` picks the framing ("PAYSLIP" vs "COACH PAYMENT STATEMENT")
 * over identical underlying data — the distinction lives entirely in the
 * header text and section labels, never in the numbers.
 */
@Injectable()
export class PayslipPdfService {
  private printer: PdfPrinterLike | null = null;

  async renderPayslip(payslip: PayslipDocument): Promise<Buffer> {
    return this.render(this.payslipDefinition(payslip));
  }

  private getPrinter(): PdfPrinterLike {
    if (this.printer) return this.printer;

    /* eslint-disable @typescript-eslint/no-var-requires */
    const PdfPrinter = requireFromHere("pdfmake/js/Printer.js").default;
    const URLResolver = requireFromHere("pdfmake/js/URLResolver.js").default;
    const virtualFsModule = requireFromHere("pdfmake/js/virtual-fs.js");
    /* eslint-enable @typescript-eslint/no-var-requires */

    const virtualFs = virtualFsModule.default ?? virtualFsModule;

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

  private payslipDefinition(payslip: PayslipDocument): Record<string, unknown> {
    const money = (minor: number) => formatMoney(minor, payslip.currency);
    const title = PAYSLIP_DOCUMENT_KIND_LABELS[payslip.documentKind].toUpperCase();

    return {
      pageSize: "A4",
      pageMargins: [PAGE_MARGIN_X, 44, PAGE_MARGIN_X, 56],
      info: {
        title: payslip.documentNumber,
        author: "NexaChess",
        subject: `${title} ${payslip.documentNumber}`
      },
      defaultStyle: { font: "Roboto", fontSize: 9.5, color: INK, lineHeight: 1.25 },
      styles: PDF_STYLES,
      footer: this.footer(),
      content: [
        this.documentHeader(payslip, title),
        this.metaBlock(payslip),
        this.teachingSummaryTable(payslip),
        this.earningsTable(payslip, money),
        ...this.deductionsTable(payslip, money),
        this.netPayableBlock(payslip, money),
        this.paymentBlock(payslip)
      ]
    };
  }

  private documentHeader(payslip: PayslipDocument, title: string): Record<string, unknown> {
    return {
      unbreakable: true,
      margin: [0, 0, 0, 18],
      stack: [
        {
          columns: [
            {
              width: "*",
              stack: [
                { text: "NEXACHESS", style: "brand" },
                { text: "Chess Learning Platform", style: "brandSub" }
              ]
            },
            {
              width: "auto",
              alignment: "right",
              stack: [
                { text: title, style: "docTitle" },
                { text: payslip.documentNumber, style: "docNumber" },
                { text: formatPeriodLabel(payslip.period), style: "muted", margin: [0, 4, 0, 0] }
              ]
            }
          ]
        },
        { canvas: [rule(0, 14, 511)] }
      ]
    };
  }

  private metaBlock(payslip: PayslipDocument): Record<string, unknown> {
    return {
      margin: [0, 16, 0, 18],
      columns: [
        {
          width: "52%",
          stack: [
            { text: "COACH", style: "sectionLabel" },
            { text: payslip.coach.name, style: "partyName" },
            { text: engagementLabel(payslip.coach.engagementType), style: "muted" }
          ]
        },
        {
          width: "*",
          stack: [
            { text: "PAYROLL PERIOD", style: "sectionLabel" },
            this.metaTable([
              ["Period", formatPeriodLabel(payslip.period)],
              ["Issued", formatDocumentDate(payslip.issuedAt)]
            ])
          ]
        }
      ]
    };
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

  private teachingSummaryTable(payslip: PayslipDocument): Record<string, unknown> {
    const s = payslip.teachingSummary;
    const rows: [string, string][] = [
      ["Completed classes", String(s.completedClassesCount)],
      ["Teaching hours", (s.totalTeachingSeconds / 3600).toFixed(1)],
      ["Scheduled classes", String(s.scheduledClassesCount)]
    ];
    if (s.cancelledByCoachCount + s.cancelledByStudentCount + s.cancelledByAdminCount > 0) {
      rows.push([
        "Cancelled",
        `${s.cancelledByCoachCount + s.cancelledByStudentCount + s.cancelledByAdminCount}`
      ]);
    }
    if (s.noShowCount > 0) rows.push(["No-shows", String(s.noShowCount)]);

    return {
      unbreakable: true,
      stack: [
        { text: "TEACHING SUMMARY", style: "sectionLabel", margin: [0, 0, 0, 6] },
        {
          columns: rows.map(([label, value]) => ({
            width: "*",
            stack: [
              { text: value, style: "statValue" },
              { text: label, style: "statLabel" }
            ]
          }))
        },
        { canvas: [rule(0, 14, 511)] }
      ],
      margin: [0, 0, 0, 16]
    };
  }

  private lineItemsRows(
    items: PayrollLineItem[],
    money: (minor: number) => string
  ): Record<string, unknown>[][] {
    return items.map((item) => [
      { text: item.label, style: "td" },
      {
        text: item.quantity !== undefined ? String(item.quantity) : "",
        style: "tdNum",
        alignment: "right"
      },
      { text: money(item.amountMinor), style: "tdNum", alignment: "right" }
    ]);
  }

  private earningsTable(
    payslip: PayslipDocument,
    money: (minor: number) => string
  ): Record<string, unknown> {
    // Deduction-rule lines render in their own DEDUCTIONS section below,
    // never mixed into earnings — the engine tags them with this exact label
    // (payroll-calculation.engine.ts#computeRuleLines).
    const earnings = payslip.earningsBreakdown.lineItems.filter((i) => i.label !== "Deduction");
    const rows = this.lineItemsRows(earnings, money);

    return {
      unbreakable: false,
      stack: [
        { text: "EARNINGS", style: "sectionLabel", margin: [0, 0, 0, 6] },
        {
          table: {
            headerRows: 1,
            dontBreakRows: true,
            widths: ["*", 60, 90],
            body: [
              [
                { text: "DESCRIPTION", style: "th" },
                { text: "QTY", style: "th", alignment: "right" },
                { text: "AMOUNT", style: "th", alignment: "right" }
              ],
              ...rows
            ]
          },
          layout: {
            hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
              i === 0 || i === 1 || i === node.table.body.length ? 0.8 : 0.5,
            vLineWidth: () => 0,
            hLineColor: (i: number) => (i <= 1 ? INK : RULE),
            paddingTop: () => 6,
            paddingBottom: () => 6,
            paddingLeft: (i: number) => (i === 0 ? 0 : 6),
            paddingRight: () => 0
          }
        },
        {
          columns: [
            { width: "*", text: "" },
            {
              width: 150,
              table: {
                widths: ["*", "auto"],
                body: [
                  [
                    { text: "GROSS EARNINGS", style: "totalLabelStrong" },
                    { text: money(payslip.grossEarningsMinor), style: "totalValueStrong", alignment: "right" }
                  ],
                  // A net-positive adjustment is an earning; a negative one is listed under deductions.
                  ...(payslip.totalAdjustmentsMinor > 0
                    ? [
                        [
                          { text: "Adjustments", style: "totalLabel" },
                          { text: money(payslip.totalAdjustmentsMinor), style: "totalValue", alignment: "right" }
                        ]
                      ]
                    : [])
                ]
              },
              layout: "noBorders"
            }
          ],
          margin: [0, 4, 0, 0]
        }
      ],
      margin: [0, 0, 0, 16]
    };
  }

  private deductionsTable(
    payslip: PayslipDocument,
    money: (minor: number) => string
  ): Record<string, unknown>[] {
    const deductionLines = payslip.earningsBreakdown.lineItems.filter(
      (i) => i.label === "Deduction"
    );
    const rows: [string, string][] = deductionLines.map((line) => [line.label, money(line.amountMinor)]);
    if (payslip.totalAdjustmentsMinor < 0) {
      rows.push(["Adjustments", money(-payslip.totalAdjustmentsMinor)]);
    }
    if (rows.length === 0) return [];

    const total = deductionLines.reduce((sum, l) => sum + l.amountMinor, 0) +
      Math.max(0, -payslip.totalAdjustmentsMinor);

    return [
      {
        unbreakable: true,
        stack: [
          { text: "DEDUCTIONS", style: "sectionLabel", margin: [0, 0, 0, 6] },
          {
            table: {
              widths: ["*", "auto"],
              body: [
                ...rows.map(([l, v]) => [
                  { text: l, style: "totalLabel" },
                  { text: v, style: "totalValue", alignment: "right" }
                ]),
                [
                  { text: "Total deductions", style: "totalLabelStrong" },
                  { text: money(total), style: "totalValueStrong", alignment: "right" }
                ]
              ]
            },
            layout: "noBorders"
          }
        ],
        margin: [0, 0, 0, 16]
      }
    ];
  }

  private netPayableBlock(
    payslip: PayslipDocument,
    money: (minor: number) => string
  ): Record<string, unknown> {
    return {
      unbreakable: true,
      table: {
        widths: ["*"],
        body: [
          [
            {
              columns: [
                { width: "*", text: "NET PAYABLE", style: "grandLabel" },
                { width: "auto", text: money(payslip.netPayableMinor), style: "grandValue" }
              ]
            }
          ]
        ]
      },
      layout: noticeLayout(SOFT),
      margin: [0, 0, 0, 16]
    };
  }

  private paymentBlock(payslip: PayslipDocument): Record<string, unknown> {
    const status = payslip.payoutStatus ? PAYOUT_STATUS_LABELS[payslip.payoutStatus] : "Pending";
    const entries: [string, string][] = [["Payment status", status.toUpperCase()]];
    if (payslip.paidAt) entries.push(["Payment date", formatDocumentDate(payslip.paidAt)]);

    return {
      unbreakable: true,
      table: {
        widths: ["*"],
        body: [
          [
            {
              columns: entries.map(([label, value]) => ({
                width: "*",
                stack: [
                  { text: label, style: "metaLabel" },
                  { text: value, style: "metaValue" }
                ]
              })),
              columnGap: 12
            }
          ]
        ]
      },
      layout: noticeLayout("#FFFFFF"),
      margin: [0, 0, 0, 0]
    };
  }

  private footer() {
    return (currentPage: number, pageCount: number) => ({
      margin: [PAGE_MARGIN_X, 10, PAGE_MARGIN_X, 0],
      stack: [
        { canvas: [rule(0, 0, 511)] },
        {
          columns: [
            { width: "*", text: "NexaChess", style: "footer" },
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

const PDF_STYLES: Record<string, Record<string, unknown>> = {
  brand: { fontSize: 19, bold: true, color: BRAND, letterSpacing: 0.6 },
  brandSub: { fontSize: 8.5, color: MUTED, margin: [0, 2, 0, 0] },
  docTitle: { fontSize: 15, bold: true, color: INK, letterSpacing: 1.2 },
  docNumber: { fontSize: 10, color: MUTED, margin: [0, 2, 0, 0] },
  sectionLabel: { fontSize: 7.5, bold: true, color: MUTED, letterSpacing: 0.8 },
  partyName: { fontSize: 11.5, bold: true, color: INK, margin: [0, 0, 0, 2] },
  muted: { fontSize: 8.5, color: MUTED },
  metaLabel: { fontSize: 7.5, color: MUTED, letterSpacing: 0.4 },
  metaValue: { fontSize: 9.5, bold: true, color: INK },
  statValue: { fontSize: 15, bold: true, color: INK },
  statLabel: { fontSize: 7.5, color: MUTED, letterSpacing: 0.3, margin: [0, 2, 0, 0] },
  th: { fontSize: 7.5, bold: true, color: MUTED, letterSpacing: 0.7 },
  td: { fontSize: 9.5, color: INK },
  tdNum: { fontSize: 9.5, color: INK },
  totalLabel: { fontSize: 9, color: MUTED, margin: [0, 2, 0, 2] },
  totalValue: { fontSize: 9, color: INK, margin: [0, 2, 0, 2] },
  totalLabelStrong: { fontSize: 10, bold: true, color: INK, margin: [0, 4, 0, 4] },
  totalValueStrong: { fontSize: 10, bold: true, color: INK, margin: [0, 4, 0, 4] },
  grandLabel: { fontSize: 12, bold: true, color: INK, letterSpacing: 0.6 },
  grandValue: { fontSize: 16, bold: true, color: POSITIVE, alignment: "right" },
  footer: { fontSize: 7, color: MUTED }
};

function rule(x: number, y: number, width: number, color: string = RULE, thickness = 0.8) {
  return { type: "line", x1: x, y1: y, x2: x + width, y2: y, lineWidth: thickness, lineColor: color };
}

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

function formatDocumentDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(iso));
}

function formatPeriodLabel(period: PayslipDocument["period"]): string {
  const start = formatDocumentDate(period.startDate);
  const end = formatDocumentDate(period.endDate);
  return `${start} – ${end}`;
}

function engagementLabel(engagementType: PayslipDocument["coach"]["engagementType"]): string {
  return `Engagement: ${engagementType.charAt(0)}${engagementType.slice(1).toLowerCase()}`;
}

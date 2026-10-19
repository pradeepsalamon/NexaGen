import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  adminInvoiceQuerySchema,
  API_ROUTES,
  createCreditNoteRequestSchema,
  formatMoney,
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_SOURCE_LABELS,
  retryInvoicePdfRequestSchema,
  updateInvoiceSettingsRequestSchema,
  type AdminInvoiceQuery,
  type CreateCreditNoteRequest,
  type InvoiceItem,
  type RetryInvoicePdfRequest,
  type UpdateInvoiceSettingsRequest
} from "@nexa-chess/types";
import type { Request, Response } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { CreditNoteService } from "./credit-note.service";
import { InvoiceAuditService } from "./invoice-audit.service";
import { InvoiceEmailService } from "./invoice-email.service";
import { InvoiceGenerationService } from "./invoice-generation.service";
import { InvoiceSettingsService } from "./invoice-settings.service";
import { InvoiceService } from "./invoice.service";
import { safeFilename, sendPdf } from "./invoices.controller";
import { assertAdmin, authenticateUser } from "./payments-auth.helper";
import { RequireFeature } from "../platform/require-feature.decorator";

/**
 * Admin → Finance → Invoices (§17), and Admin → Settings → Billing &
 * Invoicing (§4).
 *
 * Every route asserts an admin role before doing anything. There is no coach
 * view here by design — money is between the student and the academy.
 */
@RequireFeature("studentPayments")
@Controller()
export class InvoicesAdminController {
  constructor(
    private readonly audit: InvoiceAuditService,
    private readonly creditNotes: CreditNoteService,
    private readonly email: InvoiceEmailService,
    private readonly generation: InvoiceGenerationService,
    private readonly invoices: InvoiceService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly settings: InvoiceSettingsService
  ) {}

  // ── Listing ──

  @Get(API_ROUTES.adminInvoices.list)
  async list(
    @Query(new ZodBodyPipe(adminInvoiceQuerySchema)) query: AdminInvoiceQuery,
    @Req() request: Request
  ) {
    const admin = await this.admin(request);
    return this.invoices.listAdmin(admin, query);
  }

  @Get(API_ROUTES.adminInvoices.export)
  async export(
    @Query(new ZodBodyPipe(adminInvoiceQuerySchema)) query: AdminInvoiceQuery,
    @Req() request: Request,
    @Res() response: Response
  ) {
    const admin = await this.admin(request);
    const invoices = await this.invoices.listAdminAll(
      admin,
      query
    );

    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="invoices-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    response.setHeader("Cache-Control", "private, no-store");
    response.send(toCsv(invoices));
  }

  @Get(API_ROUTES.adminInvoices.get())
  async get(@Param("id") id: string, @Req() request: Request) {
    const admin = await this.admin(request);
    return this.invoices.get(admin, id);
  }

  @Get(API_ROUTES.adminInvoices.audit())
  async auditTrail(@Param("id") id: string, @Req() request: Request) {
    await this.admin(request);
    return { entries: await this.audit.listForInvoice(id) };
  }

  @Get(API_ROUTES.adminInvoices.pdf())
  async pdf(
    @Param("id") id: string,
    @Req() request: Request,
    @Res() response: Response
  ) {
    const admin = await this.admin(request);
    const invoice = await this.invoices.get(admin, id);
    const pdf = await this.generation.getInvoicePdf(invoice);

    this.audit.recordInBackground({
      event: "INVOICE_DOWNLOADED",
      invoiceId: invoice.id,
      actorId: admin.id,
      metadata: { format: "pdf", surface: "admin" }
    });

    sendPdf(response, `${safeFilename(invoice.number)}.pdf`, pdf);
  }

  // ── Recovery (§20) ──

  /**
   * Re-runs a failed render. Never touches the payment: an invoice whose PDF
   * failed is still a paid invoice, and this only rebuilds the artifact.
   */
  @Post(API_ROUTES.adminInvoices.retryPdf())
  async retryPdf(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(retryInvoicePdfRequestSchema))
    dto: RetryInvoicePdfRequest,
    @Req() request: Request
  ) {
    const admin = await this.admin(request);
    await this.invoices.get(admin, id);

    await this.generation.generateAndDeliver(id, {
      force: dto.force,
      actorId: admin.id,
      // The email has its own one-shot guard, so a retry cannot spam a
      // customer who already received their receipt.
      sendEmail: true
    });

    return this.invoices.get(admin, id);
  }

  @Post(API_ROUTES.adminInvoices.resendEmail())
  async resendEmail(@Param("id") id: string, @Req() request: Request) {
    const admin = await this.admin(request);
    await this.invoices.get(admin, id);

    // `force` here is the deliberate override for "the customer says it never
    // arrived" — the only path that may send a second copy.
    const sent = await this.email.sendInvoiceIssued(id, true);
    return { sent };
  }

  // ── Credit notes (§19) ──

  @Get(API_ROUTES.adminInvoices.creditNotes)
  async listCreditNotes(@Req() request: Request) {
    await this.admin(request);
    return { creditNotes: await this.creditNotes.listAll() };
  }

  @Post(API_ROUTES.adminInvoices.createCreditNote)
  async createCreditNote(
    @Body(new ZodBodyPipe(createCreditNoteRequestSchema))
    dto: CreateCreditNoteRequest,
    @Req() request: Request
  ) {
    const admin = await this.admin(request);
    const creditNote = await this.creditNotes.createForAdmin(admin, dto);

    this.generation.requestCreditNoteGeneration(creditNote.id);

    return creditNote;
  }

  @Get(API_ROUTES.adminInvoices.creditNotePdf())
  async creditNotePdf(
    @Param("id") id: string,
    @Req() request: Request,
    @Res() response: Response
  ) {
    const admin = await this.admin(request);
    const creditNote = await this.creditNotes.get(admin, id);
    const pdf = await this.generation.getCreditNotePdf(creditNote);

    sendPdf(response, `${safeFilename(creditNote.number)}.pdf`, pdf);
  }

  // ── Billing & Invoicing settings (§4) ──

  @Get(API_ROUTES.adminInvoices.settings)
  async getSettings(@Req() request: Request) {
    await this.admin(request);
    return this.settings.getResponse();
  }

  @Put(API_ROUTES.adminInvoices.settings)
  async updateSettings(
    @Body(new ZodBodyPipe(updateInvoiceSettingsRequestSchema))
    dto: UpdateInvoiceSettingsRequest,
    @Req() request: Request
  ) {
    const admin = await this.admin(request);
    const updated = await this.settings.update(admin.id, dto);

    this.audit.recordInBackground({
      event: "INVOICE_SETTINGS_UPDATED",
      actorId: admin.id,
      metadata: { fields: Object.keys(dto) }
    });

    return updated;
  }

  private async admin(request: Request) {
    return assertAdmin(
      await authenticateUser(
        this.jwtService,
        this.prisma,
        request.cookies?.[AUTH_COOKIE_NAMES.accessToken]
      )
    );
  }
}

/**
 * CSV for the finance export. Amounts are written in major units with the
 * currency in its own column, because a spreadsheet full of paise is not what
 * an accountant wants.
 */
function toCsv(invoices: InvoiceItem[]): string {
  const header = [
    "Invoice",
    "Order",
    "Date",
    "Customer",
    "Email",
    "GSTIN",
    "Status",
    "Currency",
    "Subtotal",
    "Discount",
    "Taxable",
    "CGST",
    "SGST",
    "IGST",
    "Tax total",
    "Total",
    "Refunded",
    "Provider",
    "Method",
    "Transaction ID"
  ];

  const rows = invoices.map((invoice) => [
    invoice.number,
    invoice.orderNumber,
    invoice.invoiceDate.slice(0, 10),
    invoice.billing.name,
    invoice.billing.email ?? "",
    invoice.billing.gstin ?? "",
    INVOICE_STATUS_LABELS[invoice.status],
    invoice.currency,
    money(invoice.subtotal, invoice.currency),
    money(invoice.discountAmount, invoice.currency),
    money(invoice.taxableAmount, invoice.currency),
    money(invoice.cgstAmount, invoice.currency),
    money(invoice.sgstAmount, invoice.currency),
    money(invoice.igstAmount, invoice.currency),
    money(invoice.taxTotal, invoice.currency),
    money(invoice.total, invoice.currency),
    money(invoice.amountRefunded, invoice.currency),
    invoice.payment.provider
      ? PAYMENT_SOURCE_LABELS[invoice.payment.provider]
      : "",
    invoice.payment.method ? PAYMENT_METHOD_LABELS[invoice.payment.method] : "",
    invoice.payment.transactionId ?? ""
  ]);

  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/** Plain decimal, no currency symbol — the symbol would break a numeric column. */
function money(minor: number, currency: string): string {
  return formatMoney(minor, currency)
    .replace(/[^\d.,-]/g, "")
    .replace(/,/g, "");
}

function csvCell(value: string): string {
  // A leading =, +, - or @ makes Excel evaluate the cell as a formula; prefixing
  // an apostrophe keeps an injected payload inert.
  const guarded = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}

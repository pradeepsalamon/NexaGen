import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Put,
  Req,
  Res
} from "@nestjs/common";
import { INVOICE_HTML_CSP } from "../common/security/security-headers";
import { JwtService } from "@nestjs/jwt";
import {
  API_ROUTES,
  updateBillingProfileRequestSchema,
  type UpdateBillingProfileRequest
} from "@nexa-chess/types";
import type { Request, Response } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { BillingProfileService } from "./billing-profile.service";
import { CreditNoteService } from "./credit-note.service";
import { InvoiceAuditService } from "./invoice-audit.service";
import { InvoiceGenerationService } from "./invoice-generation.service";
import { InvoiceService } from "./invoice.service";
import { authenticateUser } from "./payments-auth.helper";
import { RequireFeature } from "../platform/require-feature.decorator";

/**
 * Customer-facing invoice routes (§14, §15, §16).
 *
 * Every route authenticates, and every document read goes through a service
 * method that asserts ownership — changing the id in the URL reaches somebody
 * else's invoice only if you are an admin. Auth is the token-string pattern
 * (CLAUDE.md §3.2): the controller lifts the raw cookie, the service verifies.
 */
@RequireFeature("studentPayments")
@Controller()
export class InvoicesController {
  constructor(
    private readonly audit: InvoiceAuditService,
    private readonly billingProfiles: BillingProfileService,
    private readonly creditNotes: CreditNoteService,
    private readonly generation: InvoiceGenerationService,
    private readonly invoices: InvoiceService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  @Get(API_ROUTES.invoices.mine)
  async mine(@Req() request: Request) {
    const user = await this.user(request);
    return { invoices: await this.invoices.listForUser(user.id) };
  }

  @Get(API_ROUTES.invoices.creditNotes)
  async myCreditNotes(@Req() request: Request) {
    const user = await this.user(request);
    return { creditNotes: await this.creditNotes.listForUser(user.id) };
  }

  @Get(API_ROUTES.invoices.billingProfile)
  async getBillingProfile(@Req() request: Request) {
    const user = await this.user(request);
    return {
      // Falls back to the resolved default (a student's parent, or the account
      // itself) so the form opens pre-filled rather than blank.
      billingProfile:
        (await this.billingProfiles.get(user.id)) ??
        (await this.billingProfiles.resolve(user.id)),
      saved: (await this.billingProfiles.get(user.id)) !== null
    };
  }

  @Put(API_ROUTES.invoices.billingProfile)
  async updateBillingProfile(
    @Body(new ZodBodyPipe(updateBillingProfileRequestSchema))
    dto: UpdateBillingProfileRequest,
    @Req() request: Request
  ) {
    const user = await this.user(request);
    return { billingProfile: await this.billingProfiles.upsert(user.id, dto) };
  }

  @Get(API_ROUTES.invoices.get())
  async get(@Param("id") id: string, @Req() request: Request) {
    const user = await this.user(request);
    const invoice = await this.invoices.get(user, id);

    this.audit.recordInBackground({
      event: "INVOICE_VIEWED",
      invoiceId: invoice.id,
      actorId: user.id
    });

    return invoice;
  }

  @Get(API_ROUTES.invoices.audit())
  async auditTrail(@Param("id") id: string, @Req() request: Request) {
    const user = await this.user(request);
    // Authorizes first; a user may read the trail of their own invoice only.
    const invoice = await this.invoices.get(user, id);
    return { entries: await this.audit.listForInvoice(invoice.id) };
  }

  /**
   * The PDF (§14). Streamed through the API rather than redirected to storage,
   * so there is never a URL in the wild that grants access to a financial
   * document without passing this authorization check.
   */
  @Get(API_ROUTES.invoices.pdf())
  async pdf(
    @Param("id") id: string,
    @Req() request: Request,
    @Res() response: Response
  ) {
    const user = await this.user(request);
    const invoice = await this.invoices.get(user, id);
    const pdf = await this.generation.getInvoicePdf(invoice);

    this.audit.recordInBackground({
      event: "INVOICE_DOWNLOADED",
      invoiceId: invoice.id,
      actorId: user.id,
      metadata: { format: "pdf" }
    });

    sendPdf(response, `${safeFilename(invoice.number)}.pdf`, pdf);
  }

  /** Printable HTML, for anyone who would rather print than download. */
  @Get(API_ROUTES.invoices.html())
  @Header("Content-Type", "text/html; charset=utf-8")
  async html(
    @Param("id") id: string,
    @Req() request: Request,
    @Res() response: Response
  ) {
    const user = await this.user(request);
    const invoice = await this.invoices.get(user, id);

    response.setHeader(
      "Content-Disposition",
      `inline; filename="${safeFilename(invoice.number)}.html"`
    );
    response.setHeader("Content-Security-Policy", INVOICE_HTML_CSP);
    response.send(this.invoices.renderHtml(invoice));
  }

  @Get(API_ROUTES.invoices.creditNote())
  async creditNote(@Param("id") id: string, @Req() request: Request) {
    const user = await this.user(request);
    return this.creditNotes.get(user, id);
  }

  @Get(API_ROUTES.invoices.creditNotePdf())
  async creditNotePdf(
    @Param("id") id: string,
    @Req() request: Request,
    @Res() response: Response
  ) {
    const user = await this.user(request);
    const creditNote = await this.creditNotes.get(user, id);
    const pdf = await this.generation.getCreditNotePdf(creditNote);

    sendPdf(response, `${safeFilename(creditNote.number)}.pdf`, pdf);
  }

  private user(request: Request) {
    return authenticateUser(
      this.jwtService,
      this.prisma,
      request.cookies?.[AUTH_COOKIE_NAMES.accessToken]
    );
  }
}

/**
 * `no-store` on purpose: an invoice is per-user content behind an auth check,
 * and a shared cache holding it is exactly the leak §14 is about.
 */
export function sendPdf(
  response: Response,
  filename: string,
  pdf: Buffer
): void {
  response.setHeader("Content-Type", "application/pdf");
  response.setHeader("Content-Length", String(pdf.byteLength));
  response.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  response.setHeader("Cache-Control", "private, no-store");
  response.end(pdf);
}

export function safeFilename(value: string): string {
  return value.replace(/[^\w.-]/g, "_");
}

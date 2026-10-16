import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Req,
  Res
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  API_ROUTES,
  applyDiscountRequestSchema,
  cancelSubscriptionRequestSchema,
  createCheckoutRequestSchema,
  paymentMethodKindSchema,
  verifyPaymentRequestSchema,
  type ApplyDiscountRequest,
  type CancelSubscriptionRequest,
  type CreateCheckoutRequest,
  type VerifyPaymentRequest
} from "@nexa-chess/types";
import type { Request, Response } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { parseOrBadRequest, ZodBodyPipe } from "../common/zod-body.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { InvoiceService } from "./invoice.service";
import { PaymentService } from "./payment.service";
import { authenticateUser } from "./payments-auth.helper";
import { PlanService } from "./plan.service";
import { SubscriptionService } from "./subscription.service";

/**
 * Customer-facing payment routes. Auth is the token-string pattern (CLAUDE.md
 * §3.2): the controller lifts the raw cookie and the service verifies it.
 */
@Controller()
export class PaymentsController {
  constructor(
    private readonly invoices: InvoiceService,
    private readonly jwtService: JwtService,
    private readonly payments: PaymentService,
    private readonly plans: PlanService,
    private readonly prisma: PrismaService,
    private readonly subscriptions: SubscriptionService
  ) {}

  @Get(API_ROUTES.payments.plans)
  async listPlans(@Req() request: Request) {
    const user = await this.user(request);
    return this.plans.list(user);
  }

  @Get(API_ROUTES.payments.checkoutConfig())
  async checkoutConfig(@Param("planId") planId: string, @Req() request: Request) {
    return this.payments.getCheckoutConfig(await this.user(request), planId);
  }

  @Post(API_ROUTES.payments.checkout)
  async checkout(
    @Body(new ZodBodyPipe(createCheckoutRequestSchema)) body: CreateCheckoutRequest,
    @Req() request: Request
  ) {
    return this.payments.createCheckout(await this.user(request), body);
  }

  /**
   * Prices a discount code. A preview only — the code is re-resolved at
   * checkout, so nothing here reserves or promises anything.
   */
  @Post(API_ROUTES.payments.previewDiscount)
  async previewDiscount(
    @Body(new ZodBodyPipe(applyDiscountRequestSchema)) body: ApplyDiscountRequest,
    @Req() request: Request
  ) {
    return this.payments.previewDiscount(await this.user(request), body);
  }

  /**
   * The client's success callback. Returns the server's view of the payment,
   * which may well disagree with what the browser thinks happened.
   */
  @Post(API_ROUTES.payments.verify())
  async verify(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(verifyPaymentRequestSchema)) body: VerifyPaymentRequest,
    @Req() request: Request
  ) {
    return this.payments.verify(await this.user(request), id, body);
  }

  /** The "Check payment status" button. Reconciles, never asserts. */
  @Get(API_ROUTES.payments.status())
  async status(@Param("id") id: string, @Req() request: Request) {
    return this.payments.getStatus(await this.user(request), id);
  }

  /** A fresh attempt on the same business order (§12). */
  @Post(API_ROUTES.payments.retry())
  async retry(
    @Param("id") id: string,
    @Body() body: { method?: string },
    @Req() request: Request
  ) {
    const method = body?.method
      ? parseOrBadRequest(paymentMethodKindSchema, body.method)
      : undefined;
    return this.payments.retry(await this.user(request), id, method);
  }

  @Get(API_ROUTES.payments.mine)
  async billing(@Req() request: Request) {
    return this.payments.getBilling(await this.user(request));
  }

  @Get(API_ROUTES.payments.invoice())
  async invoice(@Param("id") id: string, @Req() request: Request) {
    return this.invoices.get(await this.user(request), id);
  }

  /**
   * A printable receipt. Served as HTML rather than a PDF binary so it prints
   * from any browser without adding a renderer to the ARM build.
   */
  @Get(API_ROUTES.payments.invoiceDownload())
  @Header("Content-Type", "text/html; charset=utf-8")
  async downloadInvoice(
    @Param("id") id: string,
    @Req() request: Request,
    @Res() response: Response
  ) {
    const invoice = await this.invoices.get(await this.user(request), id);
    response.setHeader(
      "Content-Disposition",
      `inline; filename="${invoice.number.replace(/[^\w.-]/g, "_")}.html"`
    );
    response.send(this.invoices.renderHtml(invoice));
  }

  @Get(API_ROUTES.payments.mySubscriptions)
  async mySubscriptions(@Req() request: Request) {
    const user = await this.user(request);
    return { subscriptions: await this.subscriptions.listForUser(user.id) };
  }

  @Post(API_ROUTES.payments.cancelSubscription())
  async cancelSubscription(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(cancelSubscriptionRequestSchema))
    body: CancelSubscriptionRequest,
    @Req() request: Request
  ) {
    return this.subscriptions.cancel(await this.user(request), id, body);
  }

  private async user(request: Request) {
    return authenticateUser(
      this.jwtService,
      this.prisma,
      request.cookies?.[AUTH_COOKIE_NAMES.accessToken]
    );
  }
}

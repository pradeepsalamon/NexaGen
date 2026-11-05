import { Body, Controller, Get, HttpCode, Param, Post, Put, Query, Req } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import {
  API_ROUTES,
  confirmPlatformCheckoutRequestSchema,
  createPlatformPayLinkRequestSchema,
  startPlatformCheckoutRequestSchema,
  updatePlatformSellerDetailsRequestSchema,
  type ConfirmPlatformCheckoutRequest,
  type CreatePlatformPayLinkRequest,
  type StartPlatformCheckoutRequest,
  type UpdatePlatformSellerDetailsRequest
} from "@nexa-chess/types";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { queryString } from "../common/query-params";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { PlatformBillingWebhookService } from "./platform-billing-webhook.service";
import { PlatformBillingService } from "./platform-billing.service";
import { TenantUsageService } from "./tenant-usage.service";

const accessToken = (request: Request) => request.cookies?.[AUTH_COOKIE_NAMES.accessToken];

/** The academy paying its plan (§G "Two money flows" 1). Open in every subscription state (FeatureGateGuard). */
@Controller()
export class AcademyBillingController {
  constructor(private readonly billing: PlatformBillingService) {}

  @Get(API_ROUTES.subscription.billing)
  get(@Req() request: Request) {
    return this.billing.billing(accessToken(request));
  }

  @Post(API_ROUTES.subscription.checkout)
  start(@Req() request: Request, @Body(new ZodBodyPipe(startPlatformCheckoutRequestSchema)) body: StartPlatformCheckoutRequest) {
    return this.billing.startCheckout(accessToken(request), body);
  }

  @Get(API_ROUTES.subscription.checkoutGet())
  checkout(@Req() request: Request, @Param("id") id: string) {
    return this.billing.getCheckout(accessToken(request), id);
  }

  @Post(API_ROUTES.subscription.checkoutConfirm())
  @HttpCode(200)
  confirm(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(confirmPlatformCheckoutRequestSchema)) body: ConfirmPlatformCheckoutRequest
  ) {
    return this.billing.confirm(accessToken(request), id, body);
  }

  @Get(API_ROUTES.subscription.invoice())
  invoice(@Req() request: Request, @Param("id") id: string) {
    return this.billing.invoice(accessToken(request), id);
  }
}

/** Platform console: pay links, invoices, the owner's seller details, usage counters. */
@Controller()
export class PlatformBillingConsoleController {
  constructor(
    private readonly billing: PlatformBillingService,
    private readonly usage: TenantUsageService
  ) {}

  @Post(API_ROUTES.platform.tenantPayLink())
  payLink(
    @Req() request: Request,
    @Param("tenantId") tenantId: string,
    @Body(new ZodBodyPipe(createPlatformPayLinkRequestSchema)) body: CreatePlatformPayLinkRequest
  ) {
    return this.billing.createPayLink(accessToken(request), tenantId, body);
  }

  @Get(API_ROUTES.platform.tenantInvoices())
  tenantInvoices(@Req() request: Request, @Param("tenantId") tenantId: string) {
    return this.billing.listInvoices(accessToken(request), tenantId);
  }

  @Get(API_ROUTES.platform.invoices)
  invoices(@Req() request: Request, @Query("tenantId") tenantId: unknown) {
    return this.billing.listInvoices(accessToken(request), queryString(tenantId, "tenantId"));
  }

  @Get(API_ROUTES.platform.invoice())
  invoice(@Req() request: Request, @Param("id") id: string) {
    return this.billing.getInvoice(accessToken(request), id);
  }

  @Get(API_ROUTES.platform.sellerDetails)
  seller(@Req() request: Request) {
    return this.billing.getSellerDetails(accessToken(request));
  }

  @Put(API_ROUTES.platform.sellerDetails)
  updateSeller(
    @Req() request: Request,
    @Body(new ZodBodyPipe(updatePlatformSellerDetailsRequestSchema)) body: UpdatePlatformSellerDetailsRequest
  ) {
    return this.billing.updateSellerDetails(accessToken(request), body);
  }

  @Get(API_ROUTES.platform.usage)
  usageList(@Req() request: Request) {
    return this.usage.list(accessToken(request));
  }
}

/**
 * The owner's Razorpay webhook: public, signature-verified, raw body
 * (`app.setup.ts` mounts `express.text` here and exempts it from the origin
 * check). Not throttled, like the student gateways' routes.
 */
@Controller()
@SkipThrottle()
export class PlatformBillingWebhookController {
  constructor(private readonly webhooks: PlatformBillingWebhookService) {}

  @Post(API_ROUTES.platformBilling.webhookRazorpay)
  @HttpCode(200)
  razorpay(@Req() request: Request) {
    return this.webhooks.handle(typeof request.body === "string" ? request.body : "", request.headers);
  }
}

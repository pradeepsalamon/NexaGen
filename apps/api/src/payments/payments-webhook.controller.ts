import { Controller, HttpCode, Post, Req } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { API_ROUTES, type PaymentProvider } from "@nexa-chess/types";
import type { Request } from "express";
import { PaymentWebhookService } from "./payment-webhook.service";

/**
 * Public webhook endpoints — the only unauthenticated routes in this module.
 *
 * They are not unprotected: every payload is signature-verified by the
 * provider's adapter before anything is acted on, and there is no bypass
 * header. Rate limiting is skipped because a gateway legitimately bursts during
 * a busy checkout window, and throttling it away would cost us events.
 *
 * `main.ts` mounts `express.text` on these paths so `request.body` is the exact
 * bytes received. Re-serialising JSON breaks every signature scheme in use —
 * do not add a JSON parser here.
 */
@Controller()
@SkipThrottle()
export class PaymentsWebhookController {
  constructor(private readonly webhooks: PaymentWebhookService) {}

  @Post(API_ROUTES.payments.webhookRazorpay)
  @HttpCode(200)
  razorpay(@Req() request: Request) {
    return this.handle("RAZORPAY", request);
  }

  @Post(API_ROUTES.payments.webhookCashfree)
  @HttpCode(200)
  cashfree(@Req() request: Request) {
    return this.handle("CASHFREE", request);
  }

  @Post(API_ROUTES.payments.webhookStripe)
  @HttpCode(200)
  stripe(@Req() request: Request) {
    return this.handle("STRIPE", request);
  }

  private handle(provider: PaymentProvider, request: Request) {
    const rawBody =
      typeof request.body === "string"
        ? request.body
        : // Defensive: if a parser ever claims these routes, fail loudly rather
          // than verifying a re-serialised body that can never match.
          "";

    return this.webhooks.handle(provider, rawBody, request.headers);
  }
}

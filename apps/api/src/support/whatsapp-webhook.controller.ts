import { Controller, Get, Header, HttpCode, Post, Query, Req } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { API_ROUTES } from "@nexa-chess/types";
import type { Request } from "express";
import { WhatsAppWebhookService } from "./whatsapp-webhook.service";

/**
 * Meta's WhatsApp Cloud API callbacks. Public by design, not unprotected: the
 * GET handshake needs the verify token and every POST body must carry a valid
 * `X-Hub-Signature-256` from the app secret. `app.setup.ts` mounts
 * `express.text` on this path so `request.body` is the exact signed bytes, and
 * exempts it from the origin check. Throttling is skipped because Meta bursts
 * legitimately and a dropped event is a message the customer never gets
 * answered (bounded by nginx at the IP level instead).
 */
@Controller()
@SkipThrottle()
export class WhatsAppWebhookController {
  constructor(private readonly webhooks: WhatsAppWebhookService) {}

  @Get(API_ROUTES.whatsappWebhook)
  @Header("Content-Type", "text/plain")
  verify(
    @Query("hub.mode") mode: string | undefined,
    @Query("hub.verify_token") token: string | undefined,
    @Query("hub.challenge") challenge: string | undefined
  ) {
    return this.webhooks.verifySubscription(
      typeof mode === "string" ? mode : undefined,
      typeof token === "string" ? token : undefined,
      typeof challenge === "string" ? challenge : undefined
    );
  }

  @Post(API_ROUTES.whatsappWebhook)
  @HttpCode(200)
  receive(@Req() request: Request) {
    // A parser other than express.text would hand us an object whose bytes can never verify.
    const rawBody = typeof request.body === "string" ? request.body : "";
    return this.webhooks.receive(rawBody, request.headers["x-hub-signature-256"]);
  }
}

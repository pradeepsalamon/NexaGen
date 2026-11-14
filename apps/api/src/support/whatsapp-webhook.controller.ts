import { Controller, Get, Header, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
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
    return this.webhooks.verifySubscription(text(mode), text(token), text(challenge));
  }

  @Post(API_ROUTES.whatsappWebhook)
  @HttpCode(200)
  receive(@Req() request: Request) {
    return this.webhooks.receive(rawBodyOf(request), request.headers["x-hub-signature-256"]);
  }

  // Another academy's own number (docs/WHATSAPP_SUPPORT_MODES_PLAN.md §6): the
  // last segment names the academy; its verify token and app secret decide.
  @Get(API_ROUTES.whatsappWebhookAcademy())
  @Header("Content-Type", "text/plain")
  verifyAcademy(
    @Param("webhookKey") webhookKey: string,
    @Query("hub.mode") mode: string | undefined,
    @Query("hub.verify_token") token: string | undefined,
    @Query("hub.challenge") challenge: string | undefined
  ) {
    return this.webhooks.verifySubscription(text(mode), text(token), text(challenge), webhookKey);
  }

  @Post(API_ROUTES.whatsappWebhookAcademy())
  @HttpCode(200)
  receiveAcademy(@Req() request: Request, @Param("webhookKey") webhookKey: string) {
    return this.webhooks.receive(rawBodyOf(request), request.headers["x-hub-signature-256"], webhookKey);
  }
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** A parser other than express.text would hand us an object whose bytes can never verify. */
function rawBodyOf(request: Request): string {
  return typeof request.body === "string" ? request.body : "";
}

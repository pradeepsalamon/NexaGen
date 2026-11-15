import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, Query, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  API_ROUTES,
  emailOneClickQuerySchema,
  emailUnsubscribeRequestSchema,
  updateEmailPreferencesRequestSchema,
  type EmailUnsubscribeRequest,
  type UpdateEmailPreferencesRequest
} from "@nexa-chess/types";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { parseOrBadRequest, ZodBodyPipe } from "../common/zod-body.pipe";
import { EmailPreferencesService } from "./email-preferences.service";

@Controller()
export class EmailPreferencesController {
  constructor(private readonly preferences: EmailPreferencesService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.emailPreferences.mine)
  getMine(@Req() request: Request) {
    return this.preferences.getMine(this.getAccessToken(request));
  }

  @Put(API_ROUTES.emailPreferences.mine)
  updateMine(
    @Req() request: Request,
    @Body(new ZodBodyPipe(updateEmailPreferencesRequestSchema)) body: UpdateEmailPreferencesRequest
  ) {
    return this.preferences.updateMine(this.getAccessToken(request), body);
  }

  /** Public: the link in a notification email. The random token is the credential. */
  @Post(API_ROUTES.emailPreferences.unsubscribe)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  unsubscribe(@Body(new ZodBodyPipe(emailUnsubscribeRequestSchema)) body: EmailUnsubscribeRequest) {
    return this.preferences.setByLink(body);
  }

  /**
   * Public: RFC 8058 one-click unsubscribe. A mail app POSTs `List-Unsubscribe=One-Click` to the
   * `List-Unsubscribe` link (the web's `/api` proxies it here); only the query string matters.
   */
  @Post(API_ROUTES.emailPreferences.oneClick)
  // Mail providers send everyone's clicks from a few addresses; the random token is the guard.
  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @HttpCode(HttpStatus.OK)
  oneClick(@Query() query: Record<string, unknown>) {
    return this.preferences.oneClick(parseOrBadRequest(emailOneClickQuerySchema, query, "query"));
  }
}

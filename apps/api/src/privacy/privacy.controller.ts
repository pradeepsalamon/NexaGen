import { Controller, Get, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { API_ROUTES } from "@nexa-chess/types";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { PrivacyService } from "./privacy.service";

@Controller()
export class PrivacyController {
  constructor(private readonly privacyService: PrivacyService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  // Heavy (one query per table), so held well below the global limit.
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Get(API_ROUTES.privacy.dataExport)
  exportMyData(@Req() request: Request) {
    return this.privacyService.exportMyData(this.getAccessToken(request));
  }
}

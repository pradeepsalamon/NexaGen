import { Controller, Get, HttpCode, Post, Req } from "@nestjs/common";
import { API_ROUTES } from "@nexa-chess/types";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../../auth/types";
import { TenantIntegrityService } from "./tenant-integrity.service";

/** Platform console: the nightly tenant integrity check (operators only; the service checks). */
@Controller()
export class TenantIntegrityController {
  constructor(private readonly integrity: TenantIntegrityService) {}

  @Get(API_ROUTES.platform.integrityRuns)
  runs(@Req() request: Request) {
    return this.integrity.list(this.getAccessToken(request));
  }

  @Post(API_ROUTES.platform.integrityRuns)
  @HttpCode(200)
  runNow(@Req() request: Request) {
    return this.integrity.runNow(this.getAccessToken(request));
  }

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken] as string | undefined;
  }
}

import { Body, Controller, Delete, Get, Post, Put, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  API_ROUTES,
  updateTypographyAdminRequestSchema,
  updateTypographyRequestSchema,
  type UpdateTypographyAdminRequest,
  type UpdateTypographyRequest,
} from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { TypographyService } from "./typography.service";
import { RequireFeature } from "../platform/require-feature.decorator";

@Controller()
export class TypographyController {
  constructor(private readonly typographyService: TypographyService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.typography.get)
  getResolved(@Req() request: Request) {
    return this.typographyService.getResolved(this.getAccessToken(request));
  }

  @Put(API_ROUTES.typography.me)
  updateMe(
    @Req() request: Request,
    @Body(new ZodBodyPipe(updateTypographyRequestSchema)) body: UpdateTypographyRequest,
  ) {
    return this.typographyService.updateMyPreference(this.getAccessToken(request), body);
  }

  @Delete(API_ROUTES.typography.me)
  resetMe(@Req() request: Request) {
    return this.typographyService.resetMyPreference(this.getAccessToken(request));
  }

  @RequireFeature("customBranding")
  @Get(API_ROUTES.typography.admin)
  getAdmin(@Req() request: Request) {
    return this.typographyService.getGlobalSettings(this.getAccessToken(request));
  }

  @RequireFeature("customBranding")

  @Put(API_ROUTES.typography.admin)
  updateAdmin(
    @Req() request: Request,
    @Body(new ZodBodyPipe(updateTypographyAdminRequestSchema)) body: UpdateTypographyAdminRequest,
  ) {
    return this.typographyService.updateGlobalSettings(this.getAccessToken(request), body);
  }

  @RequireFeature("customBranding")
  @Post(API_ROUTES.typography.adminReset)
  resetAdmin(@Req() request: Request) {
    return this.typographyService.resetGlobalSettings(this.getAccessToken(request));
  }
}

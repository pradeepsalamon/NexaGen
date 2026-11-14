import { Body, Controller, Get, Param, Patch, Put, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  API_ROUTES,
  updatePlatformPlanRequestSchema,
  updateTenantSubscriptionRequestSchema,
  type UpdatePlatformPlanRequest,
  type UpdateTenantSubscriptionRequest
} from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { PlatformService } from "./platform.service";

@Controller()
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.platform.plans)
  listPlans(@Req() request: Request) {
    return this.platformService.listPlans(this.getAccessToken(request));
  }

  @Patch(API_ROUTES.platform.plan())
  updatePlan(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(updatePlatformPlanRequestSchema)) body: UpdatePlatformPlanRequest
  ) {
    return this.platformService.updatePlan(this.getAccessToken(request), id, body);
  }

  @Get(API_ROUTES.platform.tenantSubscription())
  getTenantSubscription(@Req() request: Request, @Param("tenantId") tenantId: string) {
    return this.platformService.getTenantSubscription(this.getAccessToken(request), tenantId);
  }

  @Put(API_ROUTES.platform.tenantSubscription())
  updateTenantSubscription(
    @Req() request: Request,
    @Param("tenantId") tenantId: string,
    @Body(new ZodBodyPipe(updateTenantSubscriptionRequestSchema)) body: UpdateTenantSubscriptionRequest
  ) {
    return this.platformService.updateTenantSubscription(this.getAccessToken(request), tenantId, body);
  }
}

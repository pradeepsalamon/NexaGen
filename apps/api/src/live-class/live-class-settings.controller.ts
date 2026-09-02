import { Body, Controller, Get, Param, Put, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  API_ROUTES,
  updateBatchLiveClassSettingsRequestSchema,
  updateLiveClassPolicyRequestSchema,
  updateLiveClassSettingsRequestSchema,
  type UpdateBatchLiveClassSettingsRequest,
  type UpdateLiveClassPolicyRequest,
  type UpdateLiveClassSettingsRequest,
} from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { LiveClassSettingsService } from "./live-class-settings.service";

@Controller()
export class LiveClassSettingsController {
  constructor(private readonly settingsService: LiveClassSettingsService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.liveClassSettings.policy)
  getPolicy(@Req() request: Request) {
    return this.settingsService.getPolicy(this.getAccessToken(request));
  }

  @Put(API_ROUTES.liveClassSettings.policy)
  updatePolicy(
    @Req() request: Request,
    @Body(new ZodBodyPipe(updateLiveClassPolicyRequestSchema)) body: UpdateLiveClassPolicyRequest,
  ) {
    return this.settingsService.updatePolicy(this.getAccessToken(request), body);
  }

  @Get(API_ROUTES.liveClassSettings.forClass())
  getForClass(@Param("id") id: string, @Req() request: Request) {
    return this.settingsService.getSettingsForClass(this.getAccessToken(request), id);
  }

  @Put(API_ROUTES.liveClassSettings.forClass())
  updateForClass(
    @Param("id") id: string,
    @Req() request: Request,
    @Body(new ZodBodyPipe(updateLiveClassSettingsRequestSchema)) body: UpdateLiveClassSettingsRequest,
  ) {
    return this.settingsService.updateSettingsForClass(this.getAccessToken(request), id, body);
  }

  @Get(API_ROUTES.liveClassSettings.forBatch())
  getForBatch(@Param("id") id: string, @Req() request: Request) {
    return this.settingsService.getSettingsForBatch(this.getAccessToken(request), id);
  }

  @Put(API_ROUTES.liveClassSettings.forBatch())
  updateForBatch(
    @Param("id") id: string,
    @Req() request: Request,
    @Body(new ZodBodyPipe(updateBatchLiveClassSettingsRequestSchema))
    body: UpdateBatchLiveClassSettingsRequest,
  ) {
    return this.settingsService.updateSettingsForBatch(this.getAccessToken(request), id, body);
  }
}

import { Body, Controller, Delete, Get, Param, Post, Put, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  API_ROUTES,
  createLiveClassPresetRequestSchema,
  updateLiveClassPresetRequestSchema,
  type CreateLiveClassPresetRequest,
  type UpdateLiveClassPresetRequest,
} from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { LiveClassPresetService } from "./live-class-preset.service";

@Controller()
export class LiveClassPresetController {
  constructor(private readonly presetService: LiveClassPresetService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.liveClassPresets.list)
  list(@Req() request: Request) {
    return this.presetService.list(this.getAccessToken(request));
  }

  @Post(API_ROUTES.liveClassPresets.create)
  create(
    @Req() request: Request,
    @Body(new ZodBodyPipe(createLiveClassPresetRequestSchema)) body: CreateLiveClassPresetRequest,
  ) {
    return this.presetService.create(this.getAccessToken(request), body);
  }

  @Put(API_ROUTES.liveClassPresets.update())
  update(
    @Param("id") id: string,
    @Req() request: Request,
    @Body(new ZodBodyPipe(updateLiveClassPresetRequestSchema)) body: UpdateLiveClassPresetRequest,
  ) {
    return this.presetService.update(this.getAccessToken(request), id, body);
  }

  @Delete(API_ROUTES.liveClassPresets.delete())
  remove(@Param("id") id: string, @Req() request: Request) {
    return this.presetService.remove(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.liveClassPresets.duplicate())
  duplicate(@Param("id") id: string, @Req() request: Request) {
    return this.presetService.duplicate(this.getAccessToken(request), id);
  }

  @Put(API_ROUTES.liveClassPresets.setDefault())
  setDefault(@Param("id") id: string, @Req() request: Request) {
    return this.presetService.setDefault(this.getAccessToken(request), id);
  }
}

import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import {
  API_ROUTES,
  spectateLiveClassRequestSchema,
  type SpectateLiveClassRequest,
} from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { LiveClassSpectateService } from "./live-class-spectate.service";

/** Admin "Live now" monitor + spectator seats. */
@Controller()
export class LiveClassSpectateController {
  constructor(private readonly spectateService: LiveClassSpectateService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.adminLiveClasses.list)
  list(@Req() request: Request) {
    return this.spectateService.listLiveClasses(this.getAccessToken(request));
  }

  @Post(API_ROUTES.adminLiveClasses.spectate())
  spectate(
    @Param("id") id: string,
    @Req() request: Request,
    @Body(new ZodBodyPipe(spectateLiveClassRequestSchema)) body: SpectateLiveClassRequest
  ) {
    return this.spectateService.spectate(this.getAccessToken(request), id, body.clientId);
  }
}

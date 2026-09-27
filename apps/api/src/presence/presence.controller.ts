import { Controller, HttpCode, HttpStatus, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { API_ROUTES } from "@nexa-chess/types";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { PresenceService } from "./presence.service";

@Controller()
export class PresenceController {
  constructor(private readonly presenceService: PresenceService) {}

  @Post(API_ROUTES.presence.heartbeat)
  @HttpCode(HttpStatus.OK)
  heartbeat(@Req() request: Request) {
    return this.presenceService.heartbeat(this.getAccessToken(request));
  }

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }
}

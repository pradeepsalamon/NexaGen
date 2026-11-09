import { Body, Controller, Get, Put, Req } from "@nestjs/common";
import {
  API_ROUTES,
  updateTournamentSettingsRequestSchema,
  type UpdateTournamentSettingsRequest
} from "@nexa-chess/types";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { RequireFeature } from "../platform/require-feature.decorator";
import { TournamentSettingsService } from "./tournament-settings.service";

/** Academy admin tournament routes (docs/TOURNAMENTS.md). Phase 1: settings. */
@RequireFeature("tournaments")
@Controller()
export class TournamentAdminController {
  constructor(private readonly settings: TournamentSettingsService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.tournaments.adminSettings)
  getSettings(@Req() request: Request) {
    return this.settings.get(this.getAccessToken(request));
  }

  @Put(API_ROUTES.tournaments.adminSettings)
  updateSettings(
    @Req() request: Request,
    @Body(new ZodBodyPipe(updateTournamentSettingsRequestSchema)) body: UpdateTournamentSettingsRequest
  ) {
    return this.settings.update(this.getAccessToken(request), body);
  }
}

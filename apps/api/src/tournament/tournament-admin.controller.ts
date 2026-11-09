import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req } from "@nestjs/common";
import {
  API_ROUTES,
  certificateTemplateRequestSchema,
  updateTournamentSettingsRequestSchema,
  type CertificateTemplateRequest,
  type PaginatedQuery,
  type UpdateTournamentSettingsRequest
} from "@nexa-chess/types";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { RequireFeature } from "../platform/require-feature.decorator";
import { TournamentCertificateService } from "./tournament-certificate.service";
import { TournamentHistoryService } from "./tournament-history.service";
import { TournamentSettingsService } from "./tournament-settings.service";

/** Academy admin tournament routes (docs/TOURNAMENTS.md): settings, dashboard, certificate templates. */
@RequireFeature("tournaments")
@Controller()
export class TournamentAdminController {
  constructor(
    private readonly settings: TournamentSettingsService,
    private readonly history: TournamentHistoryService,
    private readonly certificates: TournamentCertificateService
  ) {}

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

  @Get(API_ROUTES.tournaments.adminOverview)
  overview(@Req() request: Request) {
    return this.history.overview(this.getAccessToken(request));
  }

  @Get(API_ROUTES.tournaments.adminRegistrations)
  registrations(@Req() request: Request, @Query() query: PaginatedQuery) {
    return this.history.registrations(this.getAccessToken(request), query);
  }

  @Get(API_ROUTES.tournaments.adminTemplates)
  templates(@Req() request: Request) {
    return this.certificates.listTemplates(this.getAccessToken(request));
  }

  @Post(API_ROUTES.tournaments.adminTemplates)
  createTemplate(@Req() request: Request, @Body(new ZodBodyPipe(certificateTemplateRequestSchema)) body: CertificateTemplateRequest) {
    return this.certificates.createTemplate(this.getAccessToken(request), body);
  }

  @Put(API_ROUTES.tournaments.adminTemplate())
  updateTemplate(@Req() request: Request, @Param("id") id: string, @Body(new ZodBodyPipe(certificateTemplateRequestSchema)) body: CertificateTemplateRequest) {
    return this.certificates.updateTemplate(this.getAccessToken(request), id, body);
  }

  @Delete(API_ROUTES.tournaments.adminTemplate())
  archiveTemplate(@Req() request: Request, @Param("id") id: string) {
    return this.certificates.archiveTemplate(this.getAccessToken(request), id);
  }
}

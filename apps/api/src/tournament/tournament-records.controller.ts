import { Body, Controller, Get, HttpCode, Param, Post, Put, Req, Res } from "@nestjs/common";
import {
  API_ROUTES,
  revokeTournamentCertificateRequestSchema,
  setTournamentCertificateRulesRequestSchema,
  type SetTournamentCertificateRulesRequest
} from "@nexa-chess/types";
import type { Request, Response } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { safeFilename, sendPdf } from "../payments/invoices.controller";
import { RequireFeature } from "../platform/require-feature.decorator";
import { TournamentCertificateService } from "./tournament-certificate.service";
import { TournamentHistoryService } from "./tournament-history.service";

/** Certificates and tournament history (docs/TOURNAMENTS.md Phase 8). */
@RequireFeature("tournaments")
@Controller()
export class TournamentRecordsController {
  constructor(
    private readonly certificates: TournamentCertificateService,
    private readonly history: TournamentHistoryService
  ) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  // Static paths before `/tournaments/:id`.
  @Get(API_ROUTES.tournaments.myHistory)
  myHistory(@Req() request: Request) {
    return this.history.mine(this.getAccessToken(request));
  }

  @Get(API_ROUTES.tournaments.studentHistory())
  studentHistory(@Req() request: Request, @Param("userId") userId: string) {
    return this.history.student(this.getAccessToken(request), userId);
  }

  @Get(API_ROUTES.tournaments.templates)
  templates(@Req() request: Request) {
    return this.certificates.listActiveTemplates(this.getAccessToken(request));
  }

  @Get(API_ROUTES.tournaments.certificatePdf())
  async certificatePdf(@Req() request: Request, @Param("certificateId") certificateId: string, @Res() response: Response) {
    const { buffer, filename } = await this.certificates.renderPdf(this.getAccessToken(request), certificateId);
    sendPdf(response, safeFilename(filename), buffer);
  }

  @Get(API_ROUTES.tournaments.certificateRules())
  rules(@Req() request: Request, @Param("id") id: string) {
    return this.certificates.getRules(this.getAccessToken(request), id);
  }

  @Put(API_ROUTES.tournaments.certificateRules())
  setRules(@Req() request: Request, @Param("id") id: string, @Body(new ZodBodyPipe(setTournamentCertificateRulesRequestSchema)) body: SetTournamentCertificateRulesRequest) {
    return this.certificates.setRules(this.getAccessToken(request), id, body);
  }

  @Get(API_ROUTES.tournaments.certificates())
  list(@Req() request: Request, @Param("id") id: string) {
    return this.certificates.list(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.tournaments.issueCertificates())
  @HttpCode(200)
  issue(@Req() request: Request, @Param("id") id: string) {
    return this.certificates.issue(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.tournaments.revokeCertificate())
  @HttpCode(200)
  revoke(@Req() request: Request, @Param("id") id: string, @Param("certificateId") certificateId: string, @Body(new ZodBodyPipe(revokeTournamentCertificateRequestSchema)) body: { reason: string }) {
    return this.certificates.revoke(this.getAccessToken(request), id, certificateId, body.reason);
  }
}

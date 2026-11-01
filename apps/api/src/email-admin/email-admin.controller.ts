import { Body, Controller, Get, Param, Post, Put, Query, Req } from "@nestjs/common";
import {
  API_ROUTES,
  sendDirectEmailRequestSchema,
  setEmailVerifiedRequestSchema,
  updateEmailVerificationPolicyRequestSchema,
  type PaginatedQuery,
  type SendDirectEmailRequest,
  type SetEmailVerifiedRequest,
  type UpdateEmailVerificationPolicyRequest
} from "@nexa-chess/types";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { EmailAdminService } from "./email-admin.service";

@Controller()
export class EmailAdminController {
  constructor(private readonly emailAdmin: EmailAdminService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.adminEmail.overview)
  overview(@Req() request: Request) {
    return this.emailAdmin.overview(this.getAccessToken(request));
  }

  @Put(API_ROUTES.adminEmail.policy)
  setPolicy(
    @Req() request: Request,
    @Body(new ZodBodyPipe(updateEmailVerificationPolicyRequestSchema)) body: UpdateEmailVerificationPolicyRequest
  ) {
    return this.emailAdmin.setPolicy(this.getAccessToken(request), body.policy);
  }

  @Get(API_ROUTES.adminEmail.unverified)
  listUnverified(@Req() request: Request, @Query() query: PaginatedQuery) {
    return this.emailAdmin.listUnverified(this.getAccessToken(request), query);
  }

  @Post(API_ROUTES.adminEmail.verifyAll)
  verifyAll(@Req() request: Request) {
    return this.emailAdmin.verifyAll(this.getAccessToken(request));
  }

  @Put(API_ROUTES.adminEmail.verification())
  setVerified(
    @Req() request: Request,
    @Param("userId") userId: string,
    @Body(new ZodBodyPipe(setEmailVerifiedRequestSchema)) body: SetEmailVerifiedRequest
  ) {
    return this.emailAdmin.setVerified(this.getAccessToken(request), userId, body.verified);
  }

  @Post(API_ROUTES.adminEmail.verificationLink())
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  sendVerificationLink(@Req() request: Request, @Param("userId") userId: string) {
    return this.emailAdmin.sendVerificationLink(this.getAccessToken(request), userId);
  }

  @Post(API_ROUTES.adminEmail.send())
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  send(
    @Req() request: Request,
    @Param("userId") userId: string,
    @Body(new ZodBodyPipe(sendDirectEmailRequestSchema)) body: SendDirectEmailRequest
  ) {
    return this.emailAdmin.sendDirectEmail(this.getAccessToken(request), userId, body);
  }

  @Get(API_ROUTES.adminEmail.sent)
  listSent(@Req() request: Request, @Query() query: PaginatedQuery & { status?: string }) {
    return this.emailAdmin.listSent(this.getAccessToken(request), query);
  }
}

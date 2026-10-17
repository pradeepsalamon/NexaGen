import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  API_ROUTES,
  createAccountDeletionRequestSchema,
  rejectAccountDeletionRequestSchema,
  resolveAccountDeletionRequestSchema,
  type CreateAccountDeletionRequest,
  type RejectAccountDeletionRequest,
  type ResolveAccountDeletionRequest
} from "@nexa-chess/types";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { AccountDeletionService } from "./account-deletion.service";
import { PrivacyService } from "./privacy.service";

@Controller()
export class PrivacyController {
  constructor(
    private readonly accountDeletion: AccountDeletionService,
    private readonly privacyService: PrivacyService
  ) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  // Heavy (one query per table), so held well below the global limit.
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Get(API_ROUTES.privacy.dataExport)
  exportMyData(@Req() request: Request) {
    return this.privacyService.exportMyData(this.getAccessToken(request));
  }

  @Get(API_ROUTES.privacy.deletionRequest)
  getMyDeletionRequest(@Req() request: Request) {
    return this.accountDeletion.getMine(this.getAccessToken(request));
  }

  // Throttled like other password-checking routes.
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post(API_ROUTES.privacy.deletionRequest)
  requestDeletion(
    @Body(new ZodBodyPipe(createAccountDeletionRequestSchema)) body: CreateAccountDeletionRequest,
    @Req() request: Request
  ) {
    return this.accountDeletion.request(this.getAccessToken(request), body);
  }

  @Post(API_ROUTES.privacy.withdrawDeletionRequest)
  @HttpCode(HttpStatus.OK)
  withdrawDeletion(@Req() request: Request) {
    return this.accountDeletion.withdraw(this.getAccessToken(request));
  }

  @Get(API_ROUTES.adminPrivacy.deletionRequests)
  listDeletionRequests(@Req() request: Request) {
    return this.accountDeletion.list(this.getAccessToken(request));
  }

  @Post(API_ROUTES.adminPrivacy.completeDeletionRequest())
  @HttpCode(HttpStatus.OK)
  completeDeletion(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(resolveAccountDeletionRequestSchema)) body: ResolveAccountDeletionRequest,
    @Req() request: Request
  ) {
    return this.accountDeletion.complete(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.adminPrivacy.rejectDeletionRequest())
  @HttpCode(HttpStatus.OK)
  rejectDeletion(
    @Param("id") id: string,
    @Body(new ZodBodyPipe(rejectAccountDeletionRequestSchema)) body: RejectAccountDeletionRequest,
    @Req() request: Request
  ) {
    return this.accountDeletion.reject(this.getAccessToken(request), id, body);
  }
}

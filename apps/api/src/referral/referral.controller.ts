import { randomUUID } from "crypto";
import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, Res } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Throttle } from "@nestjs/throttler";
import { getApiEnv, getCookieBaseOptions } from "@nexa-chess/config/api";
import {
  API_ROUTES,
  convertReferralPointsRequestSchema,
  createReferralPaymentCodeRequestSchema,
  transferReferralPointsRequestSchema,
  type ConvertReferralPointsRequest,
  type TransferReferralPointsRequest,
  referralVisitRequestSchema,
  requestReferralWithdrawalRequestSchema,
  type CreateReferralPaymentCodeRequest,
  type PaginatedQuery,
  type ReferralVisitRequest,
  type ReferralVisitResponse,
  type RequestReferralWithdrawalRequest
} from "@nexa-chess/types";
import type { Request, Response } from "express";
import { verifyAccessToken } from "../auth/authenticate";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { TRACKING_COOKIE_NAMES, TRACKING_COOKIE_PATH, VISITOR_ID_MAX_AGE } from "../lead/types/tracking-cookie.types";
import { RequireFeature } from "../platform/require-feature.decorator";
import { ReferralTrackerService } from "./referral-tracker.service";
import { ReferralService } from "./referral.service";
import { REFERRAL_COOKIE_NAME } from "./referral.util";

@RequireFeature("referralProgram")
@Controller()
export class ReferralController {
  constructor(
    private readonly referrals: ReferralService,
    private readonly tracker: ReferralTrackerService,
    private readonly jwtService: JwtService
  ) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  // ── Public ──

  /** `/r/<code>` landing: count the visit and remember the referral. */
  @Post(API_ROUTES.referrals.visit)
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async visit(
    @Body(new ZodBodyPipe(referralVisitRequestSchema)) body: ReferralVisitRequest,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<ReferralVisitResponse> {
    const existingVisitorId = request.cookies?.[TRACKING_COOKIE_NAMES.visitorId] as string | undefined;
    const visitorId = existingVisitorId ?? randomUUID();
    // Signed in? Then the owner opening their own link is not a visit.
    const viewerUserId = await verifyAccessToken(this.jwtService, this.getAccessToken(request))
      .then((payload) => payload.sub)
      .catch(() => undefined);

    const result = await this.tracker.recordVisit({
      code: body.code,
      referrer: body.referrer,
      url: body.url,
      userAgent: request.headers["user-agent"],
      viewerUserId,
      visitorId
    });

    const base = getCookieBaseOptions(getApiEnv());
    if (!existingVisitorId) {
      response.cookie(TRACKING_COOKIE_NAMES.visitorId, visitorId, {
        ...base,
        httpOnly: true,
        maxAge: VISITOR_ID_MAX_AGE,
        path: TRACKING_COOKIE_PATH
      });
    }
    if (result.referralId) {
      // Last click wins: a newer referral link replaces the remembered one.
      response.cookie(REFERRAL_COOKIE_NAME, result.referralId, {
        ...base,
        httpOnly: true,
        maxAge: result.attributionDays * 24 * 60 * 60 * 1000,
        path: TRACKING_COOKIE_PATH
      });
    }
    return { benefits: result.benefits, referrerFirstName: result.referrerFirstName, valid: result.valid };
  }

  // ── Referrer board (students, coaches, sales) ──

  @Get(API_ROUTES.referrals.me)
  summary(@Req() request: Request) {
    return this.referrals.getSummary(this.getAccessToken(request));
  }

  @Get(API_ROUTES.referrals.myReferrals)
  listReferrals(@Req() request: Request, @Query() query: PaginatedQuery & { stageId?: unknown }) {
    return this.referrals.listReferrals(this.getAccessToken(request), query);
  }

  @Get(API_ROUTES.referrals.myRewards)
  listRewards(@Req() request: Request) {
    return this.referrals.listRewards(this.getAccessToken(request));
  }

  @Get(API_ROUTES.referrals.myCredits)
  listCredits(@Req() request: Request) {
    return this.referrals.listCredits(this.getAccessToken(request));
  }

  @Get(API_ROUTES.referrals.myWithdrawals)
  listWithdrawals(@Req() request: Request) {
    return this.referrals.listWithdrawals(this.getAccessToken(request));
  }

  @Post(API_ROUTES.referrals.myWithdrawals)
  requestWithdrawal(
    @Req() request: Request,
    @Body(new ZodBodyPipe(requestReferralWithdrawalRequestSchema)) body: RequestReferralWithdrawalRequest
  ) {
    return this.referrals.requestWithdrawal(this.getAccessToken(request), body);
  }

  @Post(API_ROUTES.referrals.cancelWithdrawal())
  @HttpCode(200)
  cancelWithdrawal(@Req() request: Request, @Param("id") id: string) {
    return this.referrals.cancelWithdrawal(this.getAccessToken(request), id);
  }

  @Get(API_ROUTES.referrals.myPaymentCodes)
  listPaymentCodes(@Req() request: Request) {
    return this.referrals.listPaymentCodes(this.getAccessToken(request));
  }

  @Post(API_ROUTES.referrals.myPaymentCodes)
  createPaymentCode(
    @Req() request: Request,
    @Body(new ZodBodyPipe(createReferralPaymentCodeRequestSchema)) body: CreateReferralPaymentCodeRequest
  ) {
    return this.referrals.createPaymentCode(this.getAccessToken(request), body);
  }

  @Post(API_ROUTES.referrals.cancelPaymentCode())
  @HttpCode(200)
  cancelPaymentCode(@Req() request: Request, @Param("id") id: string) {
    return this.referrals.cancelPaymentCode(this.getAccessToken(request), id);
  }

  // ── Points ──

  @Post(API_ROUTES.referrals.transferPoints)
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  transferPoints(
    @Req() request: Request,
    @Body(new ZodBodyPipe(transferReferralPointsRequestSchema)) body: TransferReferralPointsRequest
  ) {
    return this.referrals.transferPoints(this.getAccessToken(request), body);
  }

  @Post(API_ROUTES.referrals.convertPoints)
  @HttpCode(200)
  convertPoints(
    @Req() request: Request,
    @Body(new ZodBodyPipe(convertReferralPointsRequestSchema)) body: ConvertReferralPointsRequest
  ) {
    return this.referrals.convertPoints(this.getAccessToken(request), body);
  }
}

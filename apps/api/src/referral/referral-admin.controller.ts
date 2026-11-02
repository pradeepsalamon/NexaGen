import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import {
  API_ROUTES,
  adjustReferralCreditsRequestSchema,
  cancelReferralRewardRequestSchema,
  createReferralRewardRuleRequestSchema,
  createReferralStageRequestSchema,
  moveReferralStageRequestSchema,
  payReferralWithdrawalRequestSchema,
  rejectReferralWithdrawalRequestSchema,
  reorderReferralStagesRequestSchema,
  updateReferralRewardRuleRequestSchema,
  updateReferralSettingsRequestSchema,
  updateReferralStageRequestSchema,
  updateReferrerCodeRequestSchema,
  type AdjustReferralCreditsRequest,
  type CancelReferralRewardRequest,
  type CreateReferralRewardRuleRequest,
  type CreateReferralStageRequest,
  type MoveReferralStageRequest,
  type PaginatedQuery,
  type PayReferralWithdrawalRequest,
  type RejectReferralWithdrawalRequest,
  type ReorderReferralStagesRequest,
  type UpdateReferralRewardRuleRequest,
  type UpdateReferralSettingsRequest,
  type UpdateReferralStageRequest,
  type UpdateReferrerCodeRequest
} from "@nexa-chess/types";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { RequireFeature } from "../platform/require-feature.decorator";
import { ReferralAdminService } from "./referral-admin.service";

type ListQuery = PaginatedQuery & { stageId?: unknown; role?: unknown; referrerId?: unknown; status?: unknown };

@RequireFeature("referralProgram")
@Controller()
export class ReferralAdminController {
  constructor(private readonly admin: ReferralAdminService) {}

  private getAccessToken(request: Request) {
    return request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
  }

  @Get(API_ROUTES.adminReferrals.overview)
  overview(@Req() request: Request) {
    return this.admin.overview(this.getAccessToken(request));
  }

  @Get(API_ROUTES.adminReferrals.list)
  list(@Req() request: Request, @Query() query: ListQuery) {
    return this.admin.list(this.getAccessToken(request), query);
  }

  // Static paths before `/admin/referrals/:id`.
  @Get(API_ROUTES.adminReferrals.referrers)
  referrers(@Req() request: Request, @Query() query: ListQuery) {
    return this.admin.referrers(this.getAccessToken(request), query);
  }

  @Patch(API_ROUTES.adminReferrals.referrerCode())
  updateReferrerCode(
    @Req() request: Request,
    @Param("userId") userId: string,
    @Body(new ZodBodyPipe(updateReferrerCodeRequestSchema)) body: UpdateReferrerCodeRequest
  ) {
    return this.admin.updateReferrerCode(this.getAccessToken(request), userId, body);
  }

  @Get(API_ROUTES.adminReferrals.stages)
  listStages(@Req() request: Request) {
    return this.admin.listStages(this.getAccessToken(request));
  }

  @Post(API_ROUTES.adminReferrals.stages)
  createStage(@Req() request: Request, @Body(new ZodBodyPipe(createReferralStageRequestSchema)) body: CreateReferralStageRequest) {
    return this.admin.createStage(this.getAccessToken(request), body);
  }

  @Post(API_ROUTES.adminReferrals.reorderStages)
  reorderStages(@Req() request: Request, @Body(new ZodBodyPipe(reorderReferralStagesRequestSchema)) body: ReorderReferralStagesRequest) {
    return this.admin.reorderStages(this.getAccessToken(request), body);
  }

  @Patch(API_ROUTES.adminReferrals.stage())
  updateStage(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(updateReferralStageRequestSchema)) body: UpdateReferralStageRequest
  ) {
    return this.admin.updateStage(this.getAccessToken(request), id, body);
  }

  @Delete(API_ROUTES.adminReferrals.stage())
  deleteStage(@Req() request: Request, @Param("id") id: string) {
    return this.admin.deleteStage(this.getAccessToken(request), id);
  }

  @Get(API_ROUTES.adminReferrals.rewardRules)
  listRules(@Req() request: Request) {
    return this.admin.listRules(this.getAccessToken(request));
  }

  @Post(API_ROUTES.adminReferrals.rewardRules)
  createRule(
    @Req() request: Request,
    @Body(new ZodBodyPipe(createReferralRewardRuleRequestSchema)) body: CreateReferralRewardRuleRequest
  ) {
    return this.admin.createRule(this.getAccessToken(request), body);
  }

  @Patch(API_ROUTES.adminReferrals.rewardRule())
  updateRule(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(updateReferralRewardRuleRequestSchema)) body: UpdateReferralRewardRuleRequest
  ) {
    return this.admin.updateRule(this.getAccessToken(request), id, body);
  }

  @Delete(API_ROUTES.adminReferrals.rewardRule())
  deleteRule(@Req() request: Request, @Param("id") id: string) {
    return this.admin.deleteRule(this.getAccessToken(request), id);
  }

  @Get(API_ROUTES.adminReferrals.rewards)
  listRewards(@Req() request: Request, @Query() query: ListQuery) {
    return this.admin.listRewards(this.getAccessToken(request), query);
  }

  @Post(API_ROUTES.adminReferrals.approveReward())
  approveReward(@Req() request: Request, @Param("id") id: string) {
    return this.admin.approveReward(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.adminReferrals.cancelReward())
  cancelReward(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(cancelReferralRewardRequestSchema)) body: CancelReferralRewardRequest
  ) {
    return this.admin.cancelReward(this.getAccessToken(request), id, body);
  }

  @Get(API_ROUTES.adminReferrals.withdrawals)
  listWithdrawals(@Req() request: Request, @Query() query: ListQuery) {
    return this.admin.listWithdrawals(this.getAccessToken(request), query);
  }

  @Post(API_ROUTES.adminReferrals.payWithdrawal())
  payWithdrawal(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(payReferralWithdrawalRequestSchema)) body: PayReferralWithdrawalRequest
  ) {
    return this.admin.payWithdrawal(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.adminReferrals.rejectWithdrawal())
  rejectWithdrawal(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(rejectReferralWithdrawalRequestSchema)) body: RejectReferralWithdrawalRequest
  ) {
    return this.admin.rejectWithdrawal(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.adminReferrals.adjustCredits)
  adjustCredits(@Req() request: Request, @Body(new ZodBodyPipe(adjustReferralCreditsRequestSchema)) body: AdjustReferralCreditsRequest) {
    return this.admin.adjustCredits(this.getAccessToken(request), body);
  }

  @Get(API_ROUTES.adminReferrals.settings)
  getSettings(@Req() request: Request) {
    return this.admin.getSettings(this.getAccessToken(request));
  }

  @Put(API_ROUTES.adminReferrals.settings)
  updateSettings(@Req() request: Request, @Body(new ZodBodyPipe(updateReferralSettingsRequestSchema)) body: UpdateReferralSettingsRequest) {
    return this.admin.updateSettings(this.getAccessToken(request), body);
  }

  @Get(API_ROUTES.adminReferrals.get())
  get(@Req() request: Request, @Param("id") id: string) {
    return this.admin.get(this.getAccessToken(request), id);
  }

  @Patch(API_ROUTES.adminReferrals.moveStage())
  moveStage(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(moveReferralStageRequestSchema)) body: MoveReferralStageRequest
  ) {
    return this.admin.moveStage(this.getAccessToken(request), id, body);
  }
}

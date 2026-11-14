import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import {
  API_ROUTES,
  adjustReferralCreditsRequestSchema,
  cancelReferralRewardRequestSchema,
  createReferralBonusRuleRequestSchema,
  createReferralVoucherRequestSchema,
  createReferralStageRequestSchema,
  linkReferredUserRequestSchema,
  moveReferralStageRequestSchema,
  payReferralWithdrawalRequestSchema,
  rejectReferralRedemptionRequestSchema,
  rejectReferralWithdrawalRequestSchema,
  sendReferrerAccessLinkRequestSchema,
  reorderReferralStagesRequestSchema,
  updateReferralBonusRuleRequestSchema,
  updateReferralSettingsRequestSchema,
  updateReferralVoucherRequestSchema,
  updateReferralStageRequestSchema,
  updateReferrerCodeRequestSchema,
  type AdjustReferralCreditsRequest,
  type CancelReferralRewardRequest,
  type CreateReferralBonusRuleRequest,
  type CreateReferralVoucherRequest,
  type CreateReferralStageRequest,
  type LinkReferredUserRequest,
  type MoveReferralStageRequest,
  type PaginatedQuery,
  type PayReferralWithdrawalRequest,
  type RejectReferralRedemptionRequest,
  type RejectReferralWithdrawalRequest,
  type SendReferrerAccessLinkRequest,
  type ReorderReferralStagesRequest,
  type UpdateReferralBonusRuleRequest,
  type UpdateReferralSettingsRequest,
  type UpdateReferralVoucherRequest,
  type UpdateReferralStageRequest,
  type UpdateReferrerCodeRequest
} from "@nexa-chess/types";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { ZodBodyPipe } from "../common/zod-body.pipe";
import { RequireFeature } from "../platform/require-feature.decorator";
import { ReferralAdminService } from "./referral-admin.service";

type ListQuery = PaginatedQuery & {
  stageId?: unknown;
  role?: unknown;
  referrerId?: unknown;
  status?: unknown;
  beneficiary?: unknown;
};

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

  @Post(API_ROUTES.adminReferrals.referrerAccessLink())
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  sendAccessLink(
    @Req() request: Request,
    @Param("userId") userId: string,
    @Body(new ZodBodyPipe(sendReferrerAccessLinkRequestSchema)) body: SendReferrerAccessLinkRequest
  ) {
    return this.admin.sendAccessLink(this.getAccessToken(request), userId, body);
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
  @HttpCode(200)
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

  @Get(API_ROUTES.adminReferrals.bonusRules)
  listBonusRules(@Req() request: Request) {
    return this.admin.listBonusRules(this.getAccessToken(request));
  }

  @Post(API_ROUTES.adminReferrals.bonusRules)
  createBonusRule(
    @Req() request: Request,
    @Body(new ZodBodyPipe(createReferralBonusRuleRequestSchema)) body: CreateReferralBonusRuleRequest
  ) {
    return this.admin.createBonusRule(this.getAccessToken(request), body);
  }

  @Patch(API_ROUTES.adminReferrals.bonusRule())
  updateBonusRule(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(updateReferralBonusRuleRequestSchema)) body: UpdateReferralBonusRuleRequest
  ) {
    return this.admin.updateBonusRule(this.getAccessToken(request), id, body);
  }

  @Delete(API_ROUTES.adminReferrals.bonusRule())
  deleteBonusRule(@Req() request: Request, @Param("id") id: string) {
    return this.admin.deleteBonusRule(this.getAccessToken(request), id);
  }

  @Get(API_ROUTES.adminReferrals.vouchers)
  listVouchers(@Req() request: Request) {
    return this.admin.listVouchers(this.getAccessToken(request));
  }

  @Post(API_ROUTES.adminReferrals.vouchers)
  createVoucher(@Req() request: Request, @Body(new ZodBodyPipe(createReferralVoucherRequestSchema)) body: CreateReferralVoucherRequest) {
    return this.admin.createVoucher(this.getAccessToken(request), body);
  }

  @Patch(API_ROUTES.adminReferrals.voucher())
  updateVoucher(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(updateReferralVoucherRequestSchema)) body: UpdateReferralVoucherRequest
  ) {
    return this.admin.updateVoucher(this.getAccessToken(request), id, body);
  }

  @Delete(API_ROUTES.adminReferrals.voucher())
  deleteVoucher(@Req() request: Request, @Param("id") id: string) {
    return this.admin.deleteVoucher(this.getAccessToken(request), id);
  }

  @Get(API_ROUTES.adminReferrals.redemptions)
  listRedemptions(@Req() request: Request, @Query() query: ListQuery & { voucherId?: unknown; userId?: unknown }) {
    return this.admin.listRedemptions(this.getAccessToken(request), query);
  }

  @Post(API_ROUTES.adminReferrals.approveRedemption())
  @HttpCode(200)
  approveRedemption(@Req() request: Request, @Param("id") id: string) {
    return this.admin.approveRedemption(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.adminReferrals.rejectRedemption())
  @HttpCode(200)
  rejectRedemption(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(rejectReferralRedemptionRequestSchema)) body: RejectReferralRedemptionRequest
  ) {
    return this.admin.rejectRedemption(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.adminReferrals.revokeRedemption())
  @HttpCode(200)
  revokeRedemption(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(rejectReferralRedemptionRequestSchema)) body: RejectReferralRedemptionRequest
  ) {
    return this.admin.revokeRedemption(this.getAccessToken(request), id, body);
  }

  @Get(API_ROUTES.adminReferrals.rewards)
  listRewards(@Req() request: Request, @Query() query: ListQuery) {
    return this.admin.listRewards(this.getAccessToken(request), query);
  }

  @Post(API_ROUTES.adminReferrals.approveReward())
  @HttpCode(200)
  approveReward(@Req() request: Request, @Param("id") id: string) {
    return this.admin.approveReward(this.getAccessToken(request), id);
  }

  @Post(API_ROUTES.adminReferrals.cancelReward())
  @HttpCode(200)
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

  @Get(API_ROUTES.adminReferrals.withdrawalsExport)
  @Header("Content-Type", "text/csv; charset=utf-8")
  @Header("Content-Disposition", 'attachment; filename="referral-withdrawals.csv"')
  exportWithdrawals(@Req() request: Request, @Query() query: ListQuery) {
    return this.admin.exportWithdrawalsCsv(this.getAccessToken(request), query);
  }

  @Post(API_ROUTES.adminReferrals.payWithdrawal())
  @HttpCode(200)
  payWithdrawal(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(payReferralWithdrawalRequestSchema)) body: PayReferralWithdrawalRequest
  ) {
    return this.admin.payWithdrawal(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.adminReferrals.rejectWithdrawal())
  @HttpCode(200)
  rejectWithdrawal(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(rejectReferralWithdrawalRequestSchema)) body: RejectReferralWithdrawalRequest
  ) {
    return this.admin.rejectWithdrawal(this.getAccessToken(request), id, body);
  }

  @Post(API_ROUTES.adminReferrals.adjustCredits)
  @HttpCode(200)
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

  @Get(API_ROUTES.adminReferrals.ledger)
  ledger(@Req() request: Request, @Query() query: ListQuery & { wallet?: unknown; type?: unknown; userId?: unknown }) {
    return this.admin.ledger(this.getAccessToken(request), query);
  }

  @Get(API_ROUTES.adminReferrals.get())
  get(@Req() request: Request, @Param("id") id: string) {
    return this.admin.get(this.getAccessToken(request), id);
  }

  @Delete(API_ROUTES.adminReferrals.delete())
  deleteReferral(@Req() request: Request, @Param("id") id: string) {
    return this.admin.deleteReferral(this.getAccessToken(request), id);
  }

  @Patch(API_ROUTES.adminReferrals.moveStage())
  moveStage(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(moveReferralStageRequestSchema)) body: MoveReferralStageRequest
  ) {
    return this.admin.moveStage(this.getAccessToken(request), id, body);
  }

  @Put(API_ROUTES.adminReferrals.linkUser())
  linkReferredUser(
    @Req() request: Request,
    @Param("id") id: string,
    @Body(new ZodBodyPipe(linkReferredUserRequestSchema)) body: LinkReferredUserRequest
  ) {
    return this.admin.linkReferredUser(this.getAccessToken(request), id, body);
  }
}

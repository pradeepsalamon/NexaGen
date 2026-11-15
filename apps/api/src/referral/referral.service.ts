import { ForbiddenException, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  referralBonusAudienceOf,
  referralWalletForRole,
  referrerStageReward,
  type MyReferralSummary,
  type MyReferralVoucherCatalogue,
  type PaginatedQuery,
  type RedeemReferralVoucherRequest,
  type ReferralCreditEntryItem,
  type ReferralItem,
  type ReferralPage,
  type ReferralRedemptionItem,
  type ReferralRewardItem,
  type ReferralWithdrawalItem,
  type RequestReferralWithdrawalRequest
} from "@nexa-chess/types";
import { type Prisma, UserRole } from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { paginationMeta, resolveOrderBy, resolvePagination } from "../common/pagination";
import { queryString } from "../common/query-params";
import { PrismaService } from "../prisma/prisma.service";
import { ReferralCreditsService } from "./referral-credits.service";
import { ReferralPipelineService } from "./referral-pipeline.service";
import { ReferralSettingsService } from "./referral-settings.service";
import { ReferralVouchersService } from "./referral-vouchers.service";
import {
  BONUS_RULE_WHERE,
  REFERRAL_ITEM_INCLUDE,
  REWARD_ITEM_INCLUDE,
  toCreditEntryItem,
  toReferralItem,
  toRewardItem,
  toStageItem,
  toWithdrawalItem,
  WITHDRAWAL_ITEM_INCLUDE
} from "./referral.mappers";
import { isReferrerRole } from "./referral.util";

/**
 * The referrer's own board (students, coaches, SALES). Every query is scoped
 * to the signed-in user; nothing takes another user's id.
 */
@Injectable()
export class ReferralService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly settings: ReferralSettingsService,
    private readonly pipeline: ReferralPipelineService,
    private readonly credits: ReferralCreditsService,
    private readonly vouchers: ReferralVouchersService
  ) {}

  private async getReferrer(accessToken: string | undefined) {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken, { allowSales: true });
    if (!isReferrerRole(user.role)) throw new ForbiddenException("Referrals are for students, coaches and sales staff.");
    return user;
  }

  async getSummary(accessToken: string | undefined): Promise<MyReferralSummary> {
    const user = await this.getReferrer(accessToken);
    const settings = await this.settings.get();
    const eligible = this.settings.isEligible(user, settings);
    const code = eligible
      ? await this.settings.ensureCode(user)
      : await this.prisma.referralCode.findUnique({ where: { userId: user.id } });

    const byReferrer = { referrerId: user.id };
    const [stages, reachGroups, currentGroups, referrals, visits, converted, balances, rewardGroups, rules, redeemed, expiringSoon] =
      await Promise.all([
        this.pipeline.listStages(),
        this.prisma.referralStageReach.groupBy({ _count: true, by: ["stageId"], where: { referral: byReferrer } }),
        this.prisma.referral.groupBy({ _count: true, by: ["stageId"], where: byReferrer }),
        this.prisma.referral.count({ where: byReferrer }),
        code ? this.prisma.referralVisit.count({ where: { codeId: code.id } }) : 0,
        this.prisma.referral.count({ where: { ...byReferrer, convertedAt: { not: null } } }),
        this.credits.balances(user.id),
        // Rewards this user received (as referrer, or as a referred new member).
        this.prisma.referralReward.groupBy({
          _sum: { amountMinor: true },
          by: ["unit", "status"],
          where: { ...byReferrer, status: { in: ["PENDING", "CREDITED"] }, unit: { in: ["CASH", "POINTS"] } }
        }),
        this.prisma.referralRewardRule.findMany({
          include: { stage: { select: { name: true } } },
          orderBy: { createdAt: "asc" },
          where: { ...BONUS_RULE_WHERE, isActive: true, roles: { has: user.role } }
        }),
        this.prisma.referralRedemption.aggregate({
          _sum: { pointsCost: true },
          where: { status: { in: ["PENDING", "FULFILLED"] }, userId: user.id }
        }),
        this.credits.pointsExpiringSoon(user.id, settings)
      ]);
    const rewardSum = (unit: "CASH" | "POINTS", status: "PENDING" | "CREDITED") =>
      rewardGroups.find((group) => group.unit === unit && group.status === status)?._sum.amountMinor ?? 0;

    const reached = new Map(reachGroups.map((group) => [group.stageId, group._count]));
    const current = new Map(currentGroups.map((group) => [group.stageId, group._count]));
    const wallet = referralWalletForRole(user.role);
    const isStudent = user.role === UserRole.STUDENT;

    return {
      bonuses: rules.flatMap((rule) =>
        referralBonusAudienceOf(rule.roles, rule.unit) && rule.unit === wallet && rule.milestoneCount
          ? [
              {
                amount: rule.amountMinor,
                description: rule.description,
                everyCount: rule.milestoneCount,
                id: rule.id,
                name: rule.name,
                stageName: rule.stage.name
              }
            ]
          : []
      ),
      canRedeem: this.vouchers.canRedeem(user, settings),
      canWithdraw: settings.enabled && !isStudent && settings.withdrawalRoles.includes(user.role),
      code: code?.code ?? null,
      codeActive: Boolean(code?.isActive),
      currency: settings.currency,
      earnings: stages
        .map((stage) => ({
          friendPoints: stage.newMemberPoints,
          referrer: referrerStageReward(stage, user.role)?.amount ?? 0,
          stageId: stage.id,
          stageName: stage.name
        }))
        .filter((row) => row.referrer > 0 || row.friendPoints > 0),
      eligible,
      minWithdrawalMinor: settings.minWithdrawalMinor,
      money: isStudent
        ? null
        : {
            balanceMinor: balances.cash,
            earnedMinor: rewardSum("CASH", "CREDITED"),
            pendingMinor: rewardSum("CASH", "PENDING")
          },
      points: {
        balance: balances.points,
        earned: rewardSum("POINTS", "CREDITED"),
        expiringSoon,
        expiryDays: settings.pointsExpiryDays,
        pending: rewardSum("POINTS", "PENDING"),
        redeemed: redeemed._sum.pointsCost ?? 0
      },
      programTerms: settings.programTerms,
      stages: stages.map((stage) => ({
        ...toStageItem(stage, current.get(stage.id) ?? 0),
        reached: reached.get(stage.id) ?? 0
      })),
      totals: { converted, referrals, visits },
      wallet
    };
  }

  async listReferrals(
    accessToken: string | undefined,
    query: PaginatedQuery & { stageId?: unknown }
  ): Promise<ReferralPage<ReferralItem>> {
    const user = await this.getReferrer(accessToken);
    const { page, pageSize, skip, take, search } = resolvePagination(query);
    const stageId = queryString(query.stageId, "stageId");
    const where: Prisma.ReferralWhereInput = {
      referrerId: user.id,
      ...(stageId ? { stageId } : {}),
      ...(search ? { prospectName: { contains: search, mode: "insensitive" } } : {})
    };
    const orderBy = resolveOrderBy(query, ["createdAt", "stageChangedAt"] as const, {
      createdAt: "desc"
    }) as Prisma.ReferralOrderByWithRelationInput;

    const [rows, total] = await Promise.all([
      this.prisma.referral.findMany({ include: REFERRAL_ITEM_INCLUDE, orderBy, skip, take, where }),
      this.prisma.referral.count({ where })
    ]);
    // SALES follows up their own prospects, so they see name and contact.
    const fullView = user.role === UserRole.SALES;
    return { items: rows.map((row) => toReferralItem(row, fullView)), pagination: paginationMeta(total, page, pageSize) };
  }

  async listRewards(accessToken: string | undefined): Promise<ReferralRewardItem[]> {
    const user = await this.getReferrer(accessToken);
    const rows = await this.prisma.referralReward.findMany({
      include: REWARD_ITEM_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: 200,
      where: { referrerId: user.id }
    });
    return rows.map((row) => toRewardItem(row, user.role === UserRole.SALES));
  }

  /** The user's points and money history (every ledger movement), newest first. */
  async listCredits(accessToken: string | undefined): Promise<ReferralCreditEntryItem[]> {
    const user = await this.getReferrer(accessToken);
    const rows = await this.prisma.referralCreditEntry.findMany({
      orderBy: { createdAt: "desc" },
      take: 300,
      where: { userId: user.id }
    });
    return rows.map(toCreditEntryItem);
  }

  // ── Withdrawals (coaches and SALES) ──

  async listWithdrawals(accessToken: string | undefined): Promise<ReferralWithdrawalItem[]> {
    const user = await this.getReferrer(accessToken);
    const rows = await this.prisma.referralWithdrawal.findMany({
      include: WITHDRAWAL_ITEM_INCLUDE,
      orderBy: { createdAt: "desc" },
      take: 100,
      where: { userId: user.id }
    });
    return rows.map(toWithdrawalItem);
  }

  async requestWithdrawal(accessToken: string | undefined, body: RequestReferralWithdrawalRequest): Promise<ReferralWithdrawalItem> {
    const user = await this.getReferrer(accessToken);
    const withdrawal = await this.credits.requestWithdrawal(user, await this.settings.get(), body);
    return toWithdrawalItem({ ...withdrawal, user });
  }

  async cancelWithdrawal(accessToken: string | undefined, id: string) {
    const user = await this.getReferrer(accessToken);
    await this.credits.cancelWithdrawal(user.id, id);
    return { ok: true };
  }

  // ── Rewards store (students) ──

  async listVouchers(accessToken: string | undefined): Promise<MyReferralVoucherCatalogue> {
    const user = await this.getReferrer(accessToken);
    const [settings, points] = await Promise.all([this.settings.get(), this.credits.balance(user.id, "POINTS")]);
    return this.vouchers.catalogue(user, settings, points);
  }

  async redeemVoucher(accessToken: string | undefined, voucherId: string, body: RedeemReferralVoucherRequest): Promise<ReferralRedemptionItem> {
    const user = await this.getReferrer(accessToken);
    return this.vouchers.redeem(user, await this.settings.get(), voucherId, body);
  }

  async listRedemptions(accessToken: string | undefined): Promise<ReferralRedemptionItem[]> {
    const user = await this.getReferrer(accessToken);
    return this.vouchers.listMine(user.id);
  }

  async cancelRedemption(accessToken: string | undefined, id: string) {
    const user = await this.getReferrer(accessToken);
    await this.vouchers.cancel(user.id, id);
    return { ok: true };
  }
}

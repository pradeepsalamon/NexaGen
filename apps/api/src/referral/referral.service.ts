import { ForbiddenException, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  type CreateReferralPaymentCodeRequest,
  type MyReferralSummary,
  type PaginatedQuery,
  type ReferralCreditEntryItem,
  type ReferralItem,
  type ReferralPage,
  type ReferralPaymentCodeItem,
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
import {
  REFERRAL_ITEM_INCLUDE,
  REWARD_ITEM_INCLUDE,
  RULE_ITEM_INCLUDE,
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
    private readonly credits: ReferralCreditsService
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
    const [stages, reachGroups, currentGroups, referrals, visits, converted, balance, pending, earned, rules] =
      await Promise.all([
        this.pipeline.listStages(),
        this.prisma.referralStageReach.groupBy({ _count: true, by: ["stageId"], where: { referral: byReferrer } }),
        this.prisma.referral.groupBy({ _count: true, by: ["stageId"], where: byReferrer }),
        this.prisma.referral.count({ where: byReferrer }),
        code ? this.prisma.referralVisit.count({ where: { codeId: code.id } }) : 0,
        this.prisma.referral.count({ where: { ...byReferrer, convertedAt: { not: null } } }),
        this.credits.balance(user.id),
        this.prisma.referralReward.aggregate({ _sum: { amountMinor: true }, where: { ...byReferrer, status: "PENDING" } }),
        this.prisma.referralReward.aggregate({ _sum: { amountMinor: true }, where: { ...byReferrer, status: "CREDITED" } }),
        this.prisma.referralRewardRule.findMany({
          include: RULE_ITEM_INCLUDE,
          orderBy: { createdAt: "asc" },
          where: { isActive: true, OR: [{ roles: { isEmpty: true } }, { roles: { has: user.role } }] }
        })
      ]);

    const reached = new Map(reachGroups.map((group) => [group.stageId, group._count]));
    const current = new Map(currentGroups.map((group) => [group.stageId, group._count]));

    return {
      canPayFees: settings.enabled && settings.paymentUseRoles.includes(user.role),
      canWithdraw: settings.enabled && settings.withdrawalRoles.includes(user.role),
      code: code?.code ?? null,
      codeActive: Boolean(code?.isActive),
      credits: {
        balanceMinor: balance,
        currency: settings.currency,
        earnedMinor: earned._sum.amountMinor ?? 0,
        pendingRewardsMinor: pending._sum.amountMinor ?? 0
      },
      eligible,
      minWithdrawalMinor: settings.minWithdrawalMinor,
      programTerms: settings.programTerms,
      rules: rules.map((rule) => ({
        amountMinor: rule.amountMinor,
        currency: rule.currency,
        description: rule.description,
        id: rule.id,
        kind: rule.kind,
        milestoneCount: rule.milestoneCount,
        name: rule.name,
        stageName: rule.stage.name
      })),
      stages: stages.map((stage) => ({
        ...toStageItem(stage, current.get(stage.id) ?? 0),
        reached: reached.get(stage.id) ?? 0
      })),
      totals: { converted, referrals, visits }
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

  async listCredits(accessToken: string | undefined): Promise<ReferralCreditEntryItem[]> {
    const user = await this.getReferrer(accessToken);
    const rows = await this.prisma.referralCreditEntry.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      where: { userId: user.id }
    });
    return rows.map((row) => ({
      amountMinor: row.amountMinor,
      createdAt: row.createdAt.toISOString(),
      currency: row.currency,
      id: row.id,
      note: row.note,
      type: row.type
    }));
  }

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

  async listPaymentCodes(accessToken: string | undefined): Promise<ReferralPaymentCodeItem[]> {
    const user = await this.getReferrer(accessToken);
    const entries = await this.prisma.referralCreditEntry.findMany({
      include: { discount: { select: { code: true, id: true, isActive: true, redemptionCount: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
      where: { discountId: { not: null }, type: "PAYMENT_CODE", userId: user.id }
    });
    return entries.flatMap((entry) =>
      entry.discount
        ? [
            {
              amountMinor: -entry.amountMinor,
              code: entry.discount.code,
              createdAt: entry.createdAt.toISOString(),
              currency: entry.currency,
              id: entry.discount.id,
              status:
                entry.discount.redemptionCount > 0 ? "USED" : entry.discount.isActive ? "ACTIVE" : "CANCELLED"
            } satisfies ReferralPaymentCodeItem
          ]
        : []
    );
  }

  async createPaymentCode(accessToken: string | undefined, body: CreateReferralPaymentCodeRequest): Promise<ReferralPaymentCodeItem> {
    const user = await this.getReferrer(accessToken);
    const settings = await this.settings.get();
    const discount = await this.credits.createPaymentCode(user, settings, body);
    return {
      amountMinor: discount.value,
      code: discount.code,
      createdAt: discount.createdAt.toISOString(),
      currency: discount.currency ?? settings.currency,
      id: discount.id,
      status: "ACTIVE"
    };
  }

  async cancelPaymentCode(accessToken: string | undefined, id: string) {
    const user = await this.getReferrer(accessToken);
    await this.credits.cancelPaymentCode(user.id, id);
    return { ok: true };
  }
}

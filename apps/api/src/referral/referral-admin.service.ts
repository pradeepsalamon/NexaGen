import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  REFERRER_ROLES,
  referralBeneficiarySchema,
  referralBonusAudienceTarget,
  referralCreditEntryTypeSchema,
  referralRedemptionStatusSchema,
  referralRewardStatusSchema,
  referralWalletSchema,
  referralWithdrawalStatusSchema,
  referrerRoleSchema,
  type AdjustReferralCreditsRequest,
  type AdminReferralDetail,
  type AdminReferralItem,
  type AdminReferralLedgerItem,
  type AdminReferralOverview,
  type CancelReferralRewardRequest,
  type CreateReferralBonusRuleRequest,
  type CreateReferralStageRequest,
  type CreateReferralVoucherRequest,
  type LinkReferredUserRequest,
  type MoveReferralStageRequest,
  type PaginatedQuery,
  type PayReferralWithdrawalRequest,
  type ReferralBonusRuleItem,
  type ReferralPage,
  type ReferralRedemptionItem,
  type ReferralRewardItem,
  type ReferralSettingsItem,
  type ReferralStageItem,
  type ReferralVoucherItem,
  type ReferralWithdrawalItem,
  type ReferrerStatsItem,
  type RejectReferralRedemptionRequest,
  type RejectReferralWithdrawalRequest,
  type ReorderReferralStagesRequest,
  type SendReferrerAccessLinkRequest,
  type UpdateReferralBonusRuleRequest,
  type UpdateReferralSettingsRequest,
  type UpdateReferralStageRequest,
  type UpdateReferralVoucherRequest,
  type UpdateReferrerCodeRequest
} from "@nexa-chess/types";
import { type Prisma, UserRole } from "@prisma/client";
import { authenticateUser, isAdminRole } from "../auth/authenticate";
import { paginationMeta, resolveOrderBy, resolvePagination } from "../common/pagination";
import { queryEnum, queryString } from "../common/query-params";
import { rowsToCsv } from "../analytics/analytics-csv";
import { MessagingDispatchService } from "../messaging/messaging-dispatch.service";
import { isUniqueViolation } from "../payments/payments.util";
import { PrismaService } from "../prisma/prisma.service";
import { ReferralAccessService } from "./referral-access.service";
import { ReferralCreditsService } from "./referral-credits.service";
import { ReferralPipelineService } from "./referral-pipeline.service";
import { ReferralSettingsService } from "./referral-settings.service";
import { REDEMPTION_ITEM_INCLUDE, ReferralVouchersService, toRedemptionItem } from "./referral-vouchers.service";
import {
  BONUS_RULE_INCLUDE,
  BONUS_RULE_WHERE,
  REFERRAL_ITEM_INCLUDE,
  REWARD_ITEM_INCLUDE,
  toAdminReferralItem,
  toBonusRuleItem,
  toCreditEntryItem,
  toRewardItem,
  toStageItem,
  toWithdrawalItem,
  WITHDRAWAL_ITEM_INCLUDE
} from "./referral.mappers";
import { displayName, toReferrerRole } from "./referral.util";

const WITHDRAWAL_EXPORT_MAX_ROWS = 10_000;

/** Admin referral board: pipeline, stages and their values, bonuses, rewards, vouchers, payouts, settings. */
@Injectable()
export class ReferralAdminService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly settings: ReferralSettingsService,
    private readonly pipeline: ReferralPipelineService,
    private readonly credits: ReferralCreditsService,
    private readonly access: ReferralAccessService,
    private readonly vouchers: ReferralVouchersService,
    private readonly messaging: MessagingDispatchService
  ) {}

  private async getAdmin(accessToken: string | undefined) {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    this.assertCanManageReferrals(user);
    return user;
  }

  private assertCanManageReferrals(user: { role: UserRole }) {
    if (!isAdminRole(user.role)) throw new ForbiddenException("You cannot manage referrals.");
  }

  // ── Board ──

  async overview(accessToken: string | undefined): Promise<AdminReferralOverview> {
    await this.getAdmin(accessToken);
    const [stages, groups, referrals, visits, converted, referrers, pending, open, settings, points, joined, pendingRedemptions] = await Promise.all([
      this.pipeline.listStages(),
      this.prisma.referral.groupBy({ _count: true, by: ["stageId"] }),
      this.prisma.referral.count(),
      this.prisma.referralVisit.count(),
      this.prisma.referral.count({ where: { convertedAt: { not: null } } }),
      this.prisma.referralCode.count(),
      // The count covers every pending reward; the money total only CASH ones.
      Promise.all([
        this.prisma.referralReward.count({ where: { status: "PENDING" } }),
        this.prisma.referralReward.aggregate({ _sum: { amountMinor: true }, where: { status: "PENDING", unit: "CASH" } })
      ]).then(([count, cash]) => ({ _count: count, _sum: cash._sum })),
      this.prisma.referralWithdrawal.aggregate({ _count: true, _sum: { amountMinor: true }, where: { status: "REQUESTED" } }),
      this.settings.get(),
      this.prisma.referralCreditEntry.aggregate({ _sum: { amountMinor: true }, where: { wallet: "POINTS" } }),
      this.prisma.referral.count({ where: { referredUserId: { not: null } } }),
      this.prisma.referralRedemption.count({ where: { status: "PENDING" } })
    ]);
    const counts = new Map(groups.map((group) => [group.stageId, group._count]));
    return {
      currency: settings.currency,
      stages: stages.map((stage) => toStageItem(stage, counts.get(stage.id) ?? 0)),
      totals: {
        converted,
        joined,
        openWithdrawals: open._count,
        openWithdrawalsMinor: open._sum.amountMinor ?? 0,
        pendingRewards: pending._count,
        pendingRedemptions,
        pendingRewardsMinor: pending._sum.amountMinor ?? 0,
        pointsOutstanding: points._sum.amountMinor ?? 0,
        referrals,
        referrers,
        visits
      }
    };
  }

  async list(
    accessToken: string | undefined,
    query: PaginatedQuery & { stageId?: unknown; role?: unknown; referrerId?: unknown }
  ): Promise<ReferralPage<AdminReferralItem>> {
    await this.getAdmin(accessToken);
    const { page, pageSize, skip, take, search } = resolvePagination(query);
    const stageId = queryString(query.stageId, "stageId");
    const referrerId = queryString(query.referrerId, "referrerId");
    const role = queryEnum(query.role, REFERRER_ROLES, "role");
    const where: Prisma.ReferralWhereInput = {
      ...(stageId ? { stageId } : {}),
      ...(referrerId ? { referrerId } : {}),
      ...(role ? { referrer: { role } } : {}),
      ...(search
        ? {
            OR: [
              { prospectName: { contains: search, mode: "insensitive" } },
              { code: { code: { contains: search.toUpperCase() } } },
              { referrer: { firstName: { contains: search, mode: "insensitive" } } },
              { referrer: { lastName: { contains: search, mode: "insensitive" } } },
              { referrer: { email: { contains: search, mode: "insensitive" } } },
              { lead: { phone: { contains: search } } }
            ]
          }
        : {})
    };
    const orderBy = resolveOrderBy(query, ["createdAt", "stageChangedAt"] as const, {
      createdAt: "desc"
    }) as Prisma.ReferralOrderByWithRelationInput;
    const [rows, total] = await Promise.all([
      this.prisma.referral.findMany({ include: REFERRAL_ITEM_INCLUDE, orderBy, skip, take, where }),
      this.prisma.referral.count({ where })
    ]);
    return { items: rows.map(toAdminReferralItem), pagination: paginationMeta(total, page, pageSize) };
  }

  async get(accessToken: string | undefined, id: string): Promise<AdminReferralDetail> {
    await this.getAdmin(accessToken);
    const referral = await this.prisma.referral.findUnique({
      include: {
        ...REFERRAL_ITEM_INCLUDE,
        events: {
          include: {
            actor: { select: { firstName: true, lastName: true } },
            fromStage: { select: { name: true } },
            toStage: { select: { name: true } }
          },
          orderBy: { createdAt: "desc" }
        },
        rewards: { include: REWARD_ITEM_INCLUDE, orderBy: { createdAt: "desc" } }
      },
      where: { id }
    });
    if (!referral) throw new NotFoundException("Referral not found.");
    return {
      ...toAdminReferralItem(referral),
      events: referral.events.map((event) => ({
        actorName: event.actor ? displayName(event.actor) : null,
        createdAt: event.createdAt.toISOString(),
        fromStageName: event.fromStage?.name ?? null,
        id: event.id,
        note: event.note,
        toStageName: event.toStage?.name ?? null
      })),
      rewards: referral.rewards.map((reward) => toRewardItem(reward, true))
    };
  }

  async moveStage(accessToken: string | undefined, id: string, body: MoveReferralStageRequest): Promise<AdminReferralDetail> {
    const admin = await this.getAdmin(accessToken);
    await this.pipeline.moveByAdmin(admin.id, id, body.stageId, body.note);
    return this.get(accessToken, id);
  }

  /**
   * Removes a referral (spam, a duplicate, a test). One that earned rewards is
   * kept: cancel those first, so the money trail stays readable.
   */
  async deleteReferral(accessToken: string | undefined, id: string) {
    await this.getAdmin(accessToken);
    const referral = await this.prisma.referral.findUnique({
      include: { _count: { select: { rewards: { where: { status: { not: "CANCELLED" } } } } } },
      where: { id }
    });
    if (!referral) throw new NotFoundException("Referral not found.");
    if (referral._count.rewards > 0) {
      throw new ConflictException("This referral has earned rewards. Cancel them in the Rewards tab first.");
    }
    await this.prisma.referral.delete({ where: { id } });
    return { ok: true };
  }

  /** Link the new member's account by email (or unlink with null); links give their benefits. */
  async linkReferredUser(accessToken: string | undefined, id: string, body: LinkReferredUserRequest): Promise<AdminReferralDetail> {
    const admin = await this.getAdmin(accessToken);
    let userId: string | null = null;
    if (body.email) {
      const user = await this.prisma.user.findFirst({
        select: { id: true },
        where: { email: { equals: body.email, mode: "insensitive" } }
      });
      if (!user) throw new NotFoundException("No account uses that email.");
      userId = user.id;
    }
    await this.pipeline.linkReferredUser(id, userId, admin.id);
    return this.get(accessToken, id);
  }

  // ── Ledger ──

  /** Every points and money movement of every user, newest first. */
  async ledger(
    accessToken: string | undefined,
    query: PaginatedQuery & { wallet?: unknown; type?: unknown; userId?: unknown }
  ): Promise<ReferralPage<AdminReferralLedgerItem>> {
    await this.getAdmin(accessToken);
    const { page, pageSize, skip, take, search } = resolvePagination(query);
    const wallet = queryEnum(query.wallet, referralWalletSchema.options, "wallet");
    const type = queryEnum(query.type, referralCreditEntryTypeSchema.options, "type");
    const userId = queryString(query.userId, "userId");
    const where: Prisma.ReferralCreditEntryWhereInput = {
      ...(wallet ? { wallet } : {}),
      ...(type ? { type } : {}),
      ...(userId ? { userId } : {}),
      ...(search
        ? {
            OR: [
              { user: { firstName: { contains: search, mode: "insensitive" } } },
              { user: { lastName: { contains: search, mode: "insensitive" } } },
              { user: { email: { contains: search, mode: "insensitive" } } },
              { note: { contains: search, mode: "insensitive" } }
            ]
          }
        : {})
    };
    const [rows, total] = await Promise.all([
      this.prisma.referralCreditEntry.findMany({
        include: {
          createdBy: { select: { firstName: true, lastName: true } },
          user: { select: { email: true, firstName: true, lastName: true, role: true } }
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
        where
      }),
      this.prisma.referralCreditEntry.count({ where })
    ]);
    return {
      items: rows.map((row) => ({
        ...toCreditEntryItem(row),
        createdByName: row.createdBy ? displayName(row.createdBy) : null,
        userEmail: row.user.email,
        userId: row.userId,
        userName: displayName(row.user),
        userRole: row.user.role
      })),
      pagination: paginationMeta(total, page, pageSize)
    };
  }

  // ── Referrers ──

  async sendAccessLink(accessToken: string | undefined, userId: string, body: SendReferrerAccessLinkRequest) {
    await this.getAdmin(accessToken);
    return this.access.sendAccessLink(userId, body);
  }

  async referrers(accessToken: string | undefined, query: PaginatedQuery & { role?: unknown }): Promise<ReferralPage<ReferrerStatsItem>> {
    await this.getAdmin(accessToken);
    const { page, pageSize, skip, take, search } = resolvePagination(query);
    const role = queryEnum(query.role, REFERRER_ROLES, "role");
    // Anyone who has a code, plus every SALES account (they exist for this).
    const where: Prisma.UserWhereInput = {
      AND: [
        { OR: [{ referralCode: { isNot: null } }, { role: UserRole.SALES }] },
        role ? { role } : { role: { in: [...REFERRER_ROLES] } },
        search
          ? {
              OR: [
                { firstName: { contains: search, mode: "insensitive" } },
                { lastName: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { referralCode: { code: { contains: search.toUpperCase() } } }
              ]
            }
          : {}
      ]
    };
    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        include: { referralCode: true },
        orderBy: { createdAt: "desc" },
        skip,
        take,
        where
      }),
      this.prisma.user.count({ where })
    ]);
    const ids = users.map((user) => user.id);
    const codeIds = users.flatMap((user) => (user.referralCode ? [user.referralCode.id] : []));
    const [visits, referrals, converted, balances, earned] = await Promise.all([
      this.prisma.referralVisit.groupBy({ _count: true, by: ["codeId"], where: { codeId: { in: codeIds } } }),
      this.prisma.referral.groupBy({ _count: true, by: ["referrerId"], where: { referrerId: { in: ids } } }),
      this.prisma.referral.groupBy({
        _count: true,
        by: ["referrerId"],
        where: { convertedAt: { not: null }, referrerId: { in: ids } }
      }),
      this.prisma.referralCreditEntry.groupBy({
        _sum: { amountMinor: true },
        by: ["userId", "wallet"],
        where: { userId: { in: ids } }
      }),
      this.prisma.referralReward.groupBy({
        _sum: { amountMinor: true },
        by: ["referrerId", "unit"],
        where: { referrerId: { in: ids }, status: "CREDITED", unit: { in: ["CASH", "POINTS"] } }
      })
    ]);
    const visitMap = new Map(visits.map((row) => [row.codeId, row._count]));
    const referralMap = new Map(referrals.map((row) => [row.referrerId, row._count]));
    const convertedMap = new Map(converted.map((row) => [row.referrerId, row._count]));
    const balanceMap = new Map(
      balances.filter((row) => row.wallet === "CASH").map((row) => [row.userId, row._sum.amountMinor ?? 0])
    );
    const pointsMap = new Map(
      balances.filter((row) => row.wallet === "POINTS").map((row) => [row.userId, row._sum.amountMinor ?? 0])
    );
    const earnedMap = new Map(earned.filter((row) => row.unit === "CASH").map((row) => [row.referrerId, row._sum.amountMinor ?? 0]));
    const pointsEarnedMap = new Map(
      earned.filter((row) => row.unit === "POINTS").map((row) => [row.referrerId, row._sum.amountMinor ?? 0])
    );

    return {
      items: users.map((user) => ({
        balanceMinor: balanceMap.get(user.id) ?? 0,
        code: user.referralCode?.code ?? null,
        codeActive: Boolean(user.referralCode?.isActive),
        converted: convertedMap.get(user.id) ?? 0,
        earnedMinor: earnedMap.get(user.id) ?? 0,
        email: user.email,
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        name: displayName(user),
        phoneNumber: user.phoneNumber,
        pointsBalance: pointsMap.get(user.id) ?? 0,
        pointsEarned: pointsEarnedMap.get(user.id) ?? 0,
        referrals: referralMap.get(user.id) ?? 0,
        role: toReferrerRole(user.role),
        userId: user.id,
        visits: user.referralCode ? (visitMap.get(user.referralCode.id) ?? 0) : 0
      })),
      pagination: paginationMeta(total, page, pageSize)
    };
  }

  /** Switch a referrer's link off/on, or give them a new code (issuing one if they have none). */
  async updateReferrerCode(accessToken: string | undefined, userId: string, body: UpdateReferrerCodeRequest) {
    await this.getAdmin(accessToken);
    const user = await this.prisma.user.findUnique({ select: { firstName: true, id: true, role: true }, where: { id: userId } });
    if (!user || !referrerRoleSchema.safeParse(user.role).success) throw new NotFoundException("Referrer not found.");
    const current = await this.settings.ensureCode(user);
    try {
      const updated = await this.prisma.referralCode.update({
        data: {
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          ...(body.code ? { code: body.code } : {})
        },
        where: { id: current.id }
      });
      return { code: updated.code, isActive: updated.isActive };
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException("That code is taken. Pick another.");
      throw error;
    }
  }

  // ── Stages ──

  async listStages(accessToken: string | undefined): Promise<ReferralStageItem[]> {
    await this.getAdmin(accessToken);
    const [stages, groups] = await Promise.all([
      this.pipeline.listStages(),
      this.prisma.referral.groupBy({ _count: true, by: ["stageId"] })
    ]);
    const counts = new Map(groups.map((group) => [group.stageId, group._count]));
    return stages.map((stage) => toStageItem(stage, counts.get(stage.id) ?? 0));
  }

  async createStage(accessToken: string | undefined, body: CreateReferralStageRequest): Promise<ReferralStageItem> {
    await this.getAdmin(accessToken);
    const last = await this.prisma.referralStage.aggregate({ _max: { position: true } });
    const stage = await this.prisma.referralStage.create({
      data: {
        coachCashMinor: body.coachCashMinor ?? 0,
        description: body.description || null,
        name: body.name,
        newMemberPoints: body.newMemberPoints ?? 0,
        position: (last._max.position ?? 0) + 10,
        salesCashMinor: body.salesCashMinor ?? 0,
        studentPoints: body.studentPoints ?? 0,
        tone: body.tone,
        trigger: "MANUAL"
      }
    });
    return toStageItem(stage);
  }

  async updateStage(accessToken: string | undefined, id: string, body: UpdateReferralStageRequest): Promise<ReferralStageItem> {
    await this.getAdmin(accessToken);
    const existing = await this.prisma.referralStage.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Stage not found.");
    const stage = await this.prisma.referralStage.update({
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description || null } : {}),
        ...(body.tone !== undefined ? { tone: body.tone } : {}),
        // Values apply to referrals reaching the stage from now on; earned rewards keep theirs.
        ...(body.studentPoints !== undefined ? { studentPoints: body.studentPoints } : {}),
        ...(body.coachCashMinor !== undefined ? { coachCashMinor: body.coachCashMinor } : {}),
        ...(body.salesCashMinor !== undefined ? { salesCashMinor: body.salesCashMinor } : {}),
        ...(body.newMemberPoints !== undefined ? { newMemberPoints: body.newMemberPoints } : {})
      },
      where: { id }
    });
    return toStageItem(stage);
  }

  /**
   * Deletes a MANUAL stage. Its referrals move to the stage before it; the
   * automatic stages (visit, booking, attendance, onboarded, lost) stay.
   */
  async deleteStage(accessToken: string | undefined, id: string) {
    const admin = await this.getAdmin(accessToken);
    await this.prisma.$transaction(async (tx) => {
      const stages = await this.pipeline.listStages(tx);
      const index = stages.findIndex((stage) => stage.id === id);
      const stage = stages[index];
      if (!stage) throw new NotFoundException("Stage not found.");
      if (stage.trigger !== "MANUAL") {
        throw new BadRequestException("Automatic stages cannot be deleted. Rename them instead.");
      }
      if (await tx.referralRewardRule.count({ where: { stageId: id } })) {
        throw new ConflictException("A bonus uses this stage. Change or delete the bonus first.");
      }
      const fallback = stages[index - 1] ?? stages[index + 1];
      if (!fallback) throw new ConflictException("The pipeline needs at least one stage.");

      const moving = await tx.referral.findMany({ select: { id: true }, where: { stageId: id } });
      if (moving.length > 0) {
        await tx.referral.updateMany({ data: { stageChangedAt: new Date(), stageId: fallback.id }, where: { stageId: id } });
        await tx.referralStageEvent.createMany({
          data: moving.map((referral) => ({
            actorId: admin.id,
            fromStageId: id,
            note: `Stage "${stage.name}" was deleted.`,
            referralId: referral.id,
            toStageId: fallback.id
          }))
        });
      }
      await tx.referralStage.delete({ where: { id } });
    });
    return { ok: true };
  }

  async reorderStages(accessToken: string | undefined, body: ReorderReferralStagesRequest): Promise<ReferralStageItem[]> {
    await this.getAdmin(accessToken);
    const stages = await this.pipeline.listStages();
    const ids = new Set(stages.map((stage) => stage.id));
    if (body.stageIds.length !== ids.size || new Set(body.stageIds).size !== ids.size || body.stageIds.some((id) => !ids.has(id))) {
      throw new BadRequestException("Send every stage exactly once.");
    }
    await this.prisma.$transaction(
      body.stageIds.map((id, index) => this.prisma.referralStage.update({ data: { position: (index + 1) * 10 }, where: { id } }))
    );
    return this.listStages(accessToken);
  }

  // ── Milestone bonuses ──

  async listBonusRules(accessToken: string | undefined): Promise<ReferralBonusRuleItem[]> {
    await this.getAdmin(accessToken);
    const rules = await this.prisma.referralRewardRule.findMany({
      include: BONUS_RULE_INCLUDE,
      orderBy: { createdAt: "asc" },
      where: BONUS_RULE_WHERE
    });
    return rules.flatMap((rule) => toBonusRuleItem(rule) ?? []);
  }

  async createBonusRule(accessToken: string | undefined, body: CreateReferralBonusRuleRequest): Promise<ReferralBonusRuleItem> {
    const admin = await this.getAdmin(accessToken);
    await this.assertStageExists(body.stageId);
    const settings = await this.settings.get();
    const target = referralBonusAudienceTarget(body.audience);
    const rule = await this.prisma.referralRewardRule.create({
      data: {
        amountMinor: body.amount,
        autoApprove: body.autoApprove,
        beneficiary: "REFERRER",
        createdById: admin.id,
        currency: settings.currency,
        description: body.description || null,
        isActive: body.isActive,
        kind: "MILESTONE",
        milestoneCount: body.everyCount,
        name: body.name,
        roles: target.roles,
        stageId: body.stageId,
        unit: target.wallet
      },
      include: BONUS_RULE_INCLUDE
    });
    return toBonusRuleItem(rule)!;
  }

  /** Edits apply to bonuses earned from now on; earned rewards keep their amount. */
  async updateBonusRule(accessToken: string | undefined, id: string, body: UpdateReferralBonusRuleRequest): Promise<ReferralBonusRuleItem> {
    await this.getAdmin(accessToken);
    const existing = await this.prisma.referralRewardRule.findFirst({ include: BONUS_RULE_INCLUDE, where: { ...BONUS_RULE_WHERE, id } });
    if (!existing || !toBonusRuleItem(existing)) throw new NotFoundException("Bonus not found.");
    if (body.stageId) await this.assertStageExists(body.stageId);
    const target = body.audience ? referralBonusAudienceTarget(body.audience) : null;
    const rule = await this.prisma.referralRewardRule.update({
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description || null } : {}),
        ...(body.stageId !== undefined ? { stageId: body.stageId } : {}),
        ...(body.everyCount !== undefined ? { milestoneCount: body.everyCount } : {}),
        ...(body.amount !== undefined ? { amountMinor: body.amount } : {}),
        ...(target ? { roles: target.roles, unit: target.wallet } : {}),
        ...(body.autoApprove !== undefined ? { autoApprove: body.autoApprove } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {})
      },
      include: BONUS_RULE_INCLUDE,
      where: { id }
    });
    return toBonusRuleItem(rule)!;
  }

  /** A bonus that has paid out is switched off instead: its rewards point at it. */
  async deleteBonusRule(accessToken: string | undefined, id: string) {
    await this.getAdmin(accessToken);
    const rule = await this.prisma.referralRewardRule.findFirst({
      include: { _count: { select: { rewards: true } } },
      where: { ...BONUS_RULE_WHERE, id }
    });
    if (!rule) throw new NotFoundException("Bonus not found.");
    if (rule._count.rewards > 0) {
      await this.prisma.referralRewardRule.update({ data: { isActive: false }, where: { id } });
      return { deleted: false };
    }
    await this.prisma.referralRewardRule.delete({ where: { id } });
    return { deleted: true };
  }

  private async assertStageExists(stageId: string) {
    const stages = await this.pipeline.listStages();
    if (!stages.some((stage) => stage.id === stageId)) throw new BadRequestException("Pick a stage that exists.");
  }

  // ── Rewards ──

  async listRewards(
    accessToken: string | undefined,
    query: PaginatedQuery & { status?: unknown; beneficiary?: unknown }
  ): Promise<ReferralPage<ReferralRewardItem>> {
    await this.getAdmin(accessToken);
    const { page, pageSize, skip, take, search } = resolvePagination(query);
    const status = queryEnum(query.status, referralRewardStatusSchema.options, "status");
    const beneficiary = queryEnum(query.beneficiary, referralBeneficiarySchema.options, "beneficiary");
    const where: Prisma.ReferralRewardWhereInput = {
      ...(status ? { status } : {}),
      ...(beneficiary ? { beneficiary } : {}),
      ...(search
        ? {
            OR: [
              { referrer: { firstName: { contains: search, mode: "insensitive" } } },
              { referrer: { email: { contains: search, mode: "insensitive" } } },
              { rule: { name: { contains: search, mode: "insensitive" } } },
              { stage: { name: { contains: search, mode: "insensitive" } } }
            ]
          }
        : {})
    };
    const [rows, total] = await Promise.all([
      this.prisma.referralReward.findMany({ include: REWARD_ITEM_INCLUDE, orderBy: { createdAt: "desc" }, skip, take, where }),
      this.prisma.referralReward.count({ where })
    ]);
    return { items: rows.map((row) => toRewardItem(row, true)), pagination: paginationMeta(total, page, pageSize) };
  }

  async approveReward(accessToken: string | undefined, id: string) {
    const admin = await this.getAdmin(accessToken);
    await this.credits.approveReward(admin.id, id);
    this.messaging.dispatchInBackground({ event: "REFERRAL_REWARD", rewardId: id });
    return { ok: true };
  }

  async cancelReward(accessToken: string | undefined, id: string, body: CancelReferralRewardRequest) {
    const admin = await this.getAdmin(accessToken);
    await this.credits.cancelReward(admin.id, id, body);
    return { ok: true };
  }

  // ── Withdrawals & credits ──

  async listWithdrawals(
    accessToken: string | undefined,
    query: PaginatedQuery & { status?: unknown }
  ): Promise<ReferralPage<ReferralWithdrawalItem>> {
    await this.getAdmin(accessToken);
    const { page, pageSize, skip, take, search } = resolvePagination(query);
    const where = this.withdrawalWhere(query.status, search);
    const [rows, total] = await Promise.all([
      this.prisma.referralWithdrawal.findMany({ include: WITHDRAWAL_ITEM_INCLUDE, orderBy: { createdAt: "desc" }, skip, take, where }),
      this.prisma.referralWithdrawal.count({ where })
    ]);
    return { items: rows.map(toWithdrawalItem), pagination: paginationMeta(total, page, pageSize) };
  }

  /**
   * The withdrawals in the same filter as the list, oldest first, as a CSV an admin can pay
   * from in one go (bank upload, UPI batch). Marking each one paid stays a separate step.
   */
  async exportWithdrawalsCsv(accessToken: string | undefined, query: PaginatedQuery & { status?: unknown }): Promise<string> {
    await this.getAdmin(accessToken);
    const rows = await this.prisma.referralWithdrawal.findMany({
      include: { user: { select: { email: true, firstName: true, lastName: true, role: true } } },
      orderBy: { createdAt: "asc" },
      take: WITHDRAWAL_EXPORT_MAX_ROWS,
      where: this.withdrawalWhere(query.status, resolvePagination(query).search)
    });
    return rowsToCsv(
      ["Requested at (UTC)", "Name", "Email", "Role", "Amount", "Currency", "Payout details", "Status", "Payout reference", "Withdrawal ID"],
      rows.map((row) => [
        row.createdAt,
        displayName(row.user),
        row.user.email,
        row.user.role,
        // Major units as text ("500.00"): what a bank sheet expects, and exact for any amount.
        (row.amountMinor / 100).toFixed(2),
        row.currency,
        row.payoutDetails,
        row.status,
        row.payoutReference,
        row.id
      ])
    );
  }

  private withdrawalWhere(statusParam: unknown, search: string | undefined): Prisma.ReferralWithdrawalWhereInput {
    const status = queryEnum(statusParam, referralWithdrawalStatusSchema.options, "status");
    return {
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { user: { firstName: { contains: search, mode: "insensitive" } } },
              { user: { lastName: { contains: search, mode: "insensitive" } } },
              { user: { email: { contains: search, mode: "insensitive" } } }
            ]
          }
        : {})
    };
  }

  private announceDecision(kind: "REDEMPTION" | "WITHDRAWAL", id: string) {
    this.messaging.dispatchInBackground({ event: "REFERRAL_REQUEST_DECIDED", id, kind });
  }

  async payWithdrawal(accessToken: string | undefined, id: string, body: PayReferralWithdrawalRequest) {
    const admin = await this.getAdmin(accessToken);
    await this.credits.payWithdrawal(admin.id, id, body);
    this.announceDecision("WITHDRAWAL", id);
    return { ok: true };
  }

  async rejectWithdrawal(accessToken: string | undefined, id: string, body: RejectReferralWithdrawalRequest) {
    const admin = await this.getAdmin(accessToken);
    await this.credits.rejectWithdrawal(admin.id, id, body);
    this.announceDecision("WITHDRAWAL", id);
    return { ok: true };
  }

  async adjustCredits(accessToken: string | undefined, body: AdjustReferralCreditsRequest) {
    const admin = await this.getAdmin(accessToken);
    const settings = await this.settings.get();
    await this.credits.adjust(admin.id, body, settings.currency);
    return { ok: true };
  }

  // ── Vouchers ──

  async listVouchers(accessToken: string | undefined): Promise<ReferralVoucherItem[]> {
    await this.getAdmin(accessToken);
    return this.vouchers.list((await this.settings.get()).currency);
  }

  async createVoucher(accessToken: string | undefined, body: CreateReferralVoucherRequest): Promise<ReferralVoucherItem> {
    const admin = await this.getAdmin(accessToken);
    return this.vouchers.create(admin.id, body, (await this.settings.get()).currency);
  }

  async updateVoucher(accessToken: string | undefined, id: string, body: UpdateReferralVoucherRequest): Promise<ReferralVoucherItem> {
    await this.getAdmin(accessToken);
    return this.vouchers.update(id, body, (await this.settings.get()).currency);
  }

  async deleteVoucher(accessToken: string | undefined, id: string) {
    await this.getAdmin(accessToken);
    return this.vouchers.remove(id);
  }

  // ── Redemptions ──

  async listRedemptions(
    accessToken: string | undefined,
    query: PaginatedQuery & { status?: unknown; voucherId?: unknown; userId?: unknown }
  ): Promise<ReferralPage<ReferralRedemptionItem>> {
    await this.getAdmin(accessToken);
    const { page, pageSize, skip, take, search } = resolvePagination(query);
    const status = queryEnum(query.status, referralRedemptionStatusSchema.options, "status");
    const voucherId = queryString(query.voucherId, "voucherId");
    const userId = queryString(query.userId, "userId");
    const where: Prisma.ReferralRedemptionWhereInput = {
      ...(status ? { status } : {}),
      ...(voucherId ? { voucherId } : {}),
      ...(userId ? { userId } : {}),
      ...(search
        ? {
            OR: [
              { user: { firstName: { contains: search, mode: "insensitive" } } },
              { user: { lastName: { contains: search, mode: "insensitive" } } },
              { user: { email: { contains: search, mode: "insensitive" } } },
              { voucherName: { contains: search, mode: "insensitive" } }
            ]
          }
        : {})
    };
    const [rows, total] = await Promise.all([
      this.prisma.referralRedemption.findMany({ include: REDEMPTION_ITEM_INCLUDE, orderBy: { createdAt: "desc" }, skip, take, where }),
      this.prisma.referralRedemption.count({ where })
    ]);
    return { items: rows.map(toRedemptionItem), pagination: paginationMeta(total, page, pageSize) };
  }

  async approveRedemption(accessToken: string | undefined, id: string) {
    const admin = await this.getAdmin(accessToken);
    await this.vouchers.approve(admin.id, id);
    this.announceDecision("REDEMPTION", id);
    return { ok: true };
  }

  async rejectRedemption(accessToken: string | undefined, id: string, body: RejectReferralRedemptionRequest) {
    const admin = await this.getAdmin(accessToken);
    await this.vouchers.reject(admin.id, id, body.adminNote);
    this.announceDecision("REDEMPTION", id);
    return { ok: true };
  }

  async revokeRedemption(accessToken: string | undefined, id: string, body: RejectReferralRedemptionRequest) {
    const admin = await this.getAdmin(accessToken);
    await this.vouchers.revoke(admin.id, id, body.adminNote);
    return { ok: true };
  }

  // ── Settings ──

  async getSettings(accessToken: string | undefined): Promise<ReferralSettingsItem> {
    await this.getAdmin(accessToken);
    return this.settings.getItem();
  }

  async updateSettings(accessToken: string | undefined, body: UpdateReferralSettingsRequest): Promise<ReferralSettingsItem> {
    const admin = await this.getAdmin(accessToken);
    return this.settings.update(admin.id, body);
  }
}

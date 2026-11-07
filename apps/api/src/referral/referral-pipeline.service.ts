import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  canAutoAdvanceReferral,
  DEFAULT_REFERRAL_STAGES,
  DEFAULT_TENANT_ID,
  referralMilestonesReached,
  referralStagesReached,
  referralWalletForRole,
  referrerStageReward
} from "@nexa-chess/types";
import type { ReferralBeneficiary, ReferralStage, ReferralStageTrigger, UserRole } from "@prisma/client";
import { PrismaService, type PrismaTransactionClient } from "../prisma/prisma.service";
import { requireTenantId } from "../tenancy/tenant-sql";
import { ReferralCreditsService } from "./referral-credits.service";
import { ReferralSettingsService } from "./referral-settings.service";

export type ReferralForMove = {
  id: string;
  referrerId: string;
  referredUserId: string | null;
  stageId: string;
  convertedAt: Date | null;
  referrer: { role: UserRole; firstName: string };
};

export const REFERRAL_FOR_MOVE = {
  convertedAt: true,
  id: true,
  referredUserId: true,
  referrer: { select: { firstName: true, role: true } },
  referrerId: true,
  stageId: true
} as const;

/**
 * The one place a referral changes stage. Automatic events (visit, booking,
 * attendance, lead status) only move forward (`canAutoAdvanceReferral`);
 * admins move anywhere. Every move records history, the stages reached, and
 * the rewards those stages earn.
 */
@Injectable()
export class ReferralPipelineService {
  private readonly logger = new Logger(ReferralPipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credits: ReferralCreditsService,
    private readonly settings: ReferralSettingsService
  ) {}

  async listStages(client: PrismaTransactionClient | PrismaService = this.prisma): Promise<ReferralStage[]> {
    const read = () => client.referralStage.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
    const stages = await read();
    if (stages.length > 0) return stages;
    // The migration seeds Nexa's; another academy (or a wiped table) gets the
    // defaults here. Stage ids are a global primary key, so another academy's
    // are derived from its id: still deterministic (skipDuplicates keeps two
    // concurrent first reads from making two sets), never Nexa's.
    const tenantId = requireTenantId("referralStage");
    await client.referralStage.createMany({
      data: DEFAULT_REFERRAL_STAGES.map((stage) =>
        tenantId === DEFAULT_TENANT_ID ? { ...stage } : { ...stage, id: `${stage.id}_${tenantId}` }
      ),
      skipDuplicates: true
    });
    return read();
  }

  /** The entry stage: the LINK_VISITED stage, else the first one. */
  entryStage(stages: ReferralStage[]): ReferralStage {
    const stage = stages.find((s) => s.trigger === "LINK_VISITED") ?? stages[0];
    if (!stage) throw new ConflictException("The referral pipeline has no stages.");
    return stage;
  }

  /** Records the first stage of a brand-new referral (no event "from"). */
  async recordEntry(tx: PrismaTransactionClient, referral: ReferralForMove, stages: ReferralStage[]) {
    const stage = stages.find((s) => s.id === referral.stageId);
    if (!stage) return;
    await tx.referralStageEvent.create({ data: { referralId: referral.id, toStageId: stage.id } });
    await this.recordReachAndRewards(tx, referral, stage, stages);
  }

  /**
   * Moves a referral forward on an automatic event. Never throws: tracking
   * must not fail the lead form, the demo join or a lead status change.
   */
  async advance(referralId: string, trigger: ReferralStageTrigger, options: { actorId?: string | null; note?: string } = {}) {
    try {
      await this.prisma.$transaction(async (tx) => {
        const referral = await tx.referral.findUnique({
          select: { ...REFERRAL_FOR_MOVE, stage: true },
          where: { id: referralId }
        });
        if (!referral) return;
        const stages = await this.listStages(tx);
        const target = stages.find((stage) => stage.trigger === trigger);
        if (!target || !canAutoAdvanceReferral(referral.stage, target)) return;
        await this.enterStage(tx, referral, target, stages, { actorId: options.actorId ?? null, note: options.note });
      });
    } catch (error) {
      this.logger.warn(`Referral ${referralId} could not advance to ${trigger}: ${(error as Error).message}`);
    }
  }

  /** Admin move to any stage (forward or back). */
  async moveByAdmin(adminId: string, referralId: string, stageId: string, note?: string) {
    await this.prisma.$transaction(async (tx) => {
      const referral = await tx.referral.findUnique({ select: REFERRAL_FOR_MOVE, where: { id: referralId } });
      if (!referral) throw new NotFoundException("Referral not found.");
      const stages = await this.listStages(tx);
      const target = stages.find((stage) => stage.id === stageId);
      if (!target) throw new NotFoundException("Stage not found.");
      if (referral.stageId === target.id) return;
      const moved = await this.enterStage(tx, referral, target, stages, { actorId: adminId, note });
      if (!moved) throw new ConflictException("This referral just changed. Refresh and try again.");
    });
  }

  private async enterStage(
    tx: PrismaTransactionClient,
    referral: ReferralForMove,
    target: ReferralStage,
    stages: ReferralStage[],
    options: { actorId: string | null; note?: string }
  ): Promise<boolean> {
    const now = new Date();
    // Status-filtered claim: two events racing the same referral move it once.
    const { count } = await tx.referral.updateMany({
      data: {
        convertedAt: target.trigger === "CONVERTED" ? (referral.convertedAt ?? now) : null,
        stageChangedAt: now,
        stageId: target.id
      },
      where: { id: referral.id, stageId: referral.stageId }
    });
    if (count === 0) return false;

    await tx.referralStageEvent.create({
      data: {
        actorId: options.actorId,
        fromStageId: referral.stageId,
        note: options.note ?? null,
        referralId: referral.id,
        toStageId: target.id
      }
    });
    await this.recordReachAndRewards(tx, referral, target, stages);
    return true;
  }

  private async recordReachAndRewards(
    tx: PrismaTransactionClient,
    referral: ReferralForMove,
    target: ReferralStage,
    stages: ReferralStage[]
  ) {
    const reached = referralStagesReached(stages, target);
    await tx.referralStageReach.createMany({
      data: reached.map((stage) => ({ referralId: referral.id, stageId: stage.id })),
      skipDuplicates: true
    });
    await this.grantRewards(tx, referral, reached.map((stage) => stage.id));
  }

  /**
   * Links (or, with null, unlinks) the account the referred person joined
   * with, then grants their benefits for the stages already reached. One
   * referral per account; never the referrer's own account. Unlinking is
   * refused once benefits were given — cancel them first.
   */
  async linkReferredUser(referralId: string, userId: string | null, actorId: string | null) {
    await this.prisma.$transaction(async (tx) => {
      const referral = await tx.referral.findUnique({
        select: {
          id: true,
          referredUserId: true,
          referrerId: true,
          rewards: { select: { id: true }, where: { beneficiary: "REFERRED", status: { not: "CANCELLED" } } }
        },
        where: { id: referralId }
      });
      if (!referral) throw new NotFoundException("Referral not found.");
      if (referral.referredUserId === userId) return;
      if (userId === referral.referrerId) throw new BadRequestException("A referrer cannot be their own referral.");
      if (referral.referredUserId && referral.rewards.length > 0) {
        throw new ConflictException("The new member already received benefits. Cancel them in the Rewards tab first.");
      }
      if (userId) {
        const taken = await tx.referral.findUnique({ select: { id: true }, where: { referredUserId: userId } });
        if (taken) throw new ConflictException("That account is already linked to another referral.");
      }
      const { count } = await tx.referral.updateMany({
        data: { referredUserId: userId },
        where: { id: referral.id, referredUserId: referral.referredUserId }
      });
      if (count === 0) throw new ConflictException("This referral just changed. Refresh and try again.");
      if (userId) {
        // A referral that never reached the lead form gets a name from the account.
        const user = await tx.user.findUniqueOrThrow({ select: { firstName: true, lastName: true }, where: { id: userId } });
        await tx.referral.updateMany({
          data: { prospectName: `${user.firstName} ${user.lastName ?? ""}`.trim().slice(0, 120) },
          where: { id: referral.id, prospectName: null }
        });
      }
      await tx.referralStageEvent.create({
        data: {
          actorId,
          note: userId ? "New member's account linked." : "New member's account unlinked.",
          referralId: referral.id
        }
      });
      if (userId) await this.grantReferredBenefits(tx, referral.id);
    });
  }

  /**
   * The new member's account was just linked: give them the points of every
   * stage the referral has already reached (the referrer's rewards were
   * settled when the stages were reached).
   */
  async grantReferredBenefits(tx: PrismaTransactionClient, referralId: string) {
    const referral = await tx.referral.findUnique({
      select: { ...REFERRAL_FOR_MOVE, reaches: { select: { stageId: true } } },
      where: { id: referralId }
    });
    if (!referral?.referredUserId) return;
    await this.grantRewards(
      tx,
      referral,
      referral.reaches.map((reach) => reach.stageId),
      "REFERRED"
    );
  }

  /**
   * Creates the rewards the reached stages earn (docs/REFERRALS.md § Earning):
   *
   * - each stage's own values — points to a student referrer, money to a coach
   *   or SALES referrer, points to the new member once their account is linked;
   * - milestone bonuses — every N of the referrer's referrals reaching a stage.
   *
   * Each reward has a dedupe key (`stage:…:ref:…:referrer|referred` /
   * `rule:…:user:…:n:…`), inserted with skipDuplicates, so moving back and
   * forth — or two racing events — never pays twice.
   */
  private async grantRewards(
    tx: PrismaTransactionClient,
    referral: ReferralForMove,
    stageIds: string[],
    only?: ReferralBeneficiary
  ) {
    if (stageIds.length === 0) return;
    const [stages, settings] = await Promise.all([
      tx.referralStage.findMany({ where: { id: { in: stageIds } } }),
      this.settings.get()
    ]);
    const role = referral.referrer.role;
    const grants: Grant[] = [];

    for (const stage of stages) {
      if (only !== "REFERRED") {
        const earned = referrerStageReward(stage, role);
        if (earned) {
          grants.push({
            amount: earned.amount,
            autoApprove: earned.wallet === "POINTS" ? settings.autoApprovePoints : settings.autoApproveCash,
            beneficiary: "REFERRER",
            dedupeKey: `stage:${stage.id}:ref:${referral.id}:referrer`,
            description: `A referral reached ${stage.name}`,
            recipientId: referral.referrerId,
            referralId: referral.id,
            ruleId: null,
            stageId: stage.id,
            unit: earned.wallet
          });
        }
      }
      // The new member: points once their account is linked (never the referrer's own).
      if (only !== "REFERRER" && stage.newMemberPoints > 0 && referral.referredUserId && referral.referredUserId !== referral.referrerId) {
        grants.push({
          amount: stage.newMemberPoints,
          autoApprove: settings.autoApprovePoints,
          beneficiary: "REFERRED",
          dedupeKey: `stage:${stage.id}:ref:${referral.id}:referred`,
          description: `Welcome points: joined through ${referral.referrer.firstName}'s link (${stage.name})`,
          recipientId: referral.referredUserId,
          referralId: referral.id,
          ruleId: null,
          stageId: stage.id,
          unit: "POINTS"
        });
      }
    }

    if (only !== "REFERRED") {
      const rules = await tx.referralRewardRule.findMany({
        include: { stage: { select: { name: true } } },
        where: { beneficiary: "REFERRER", isActive: true, kind: "MILESTONE", roles: { has: role }, stageId: { in: stageIds } }
      });
      for (const rule of rules) {
        // Students earn points and staff earn money — a rule paying the wrong one is skipped.
        if (!rule.milestoneCount || rule.unit !== referralWalletForRole(role)) continue;
        const count = await tx.referralStageReach.count({
          where: { referral: { referrerId: referral.referrerId }, stageId: rule.stageId }
        });
        for (const n of referralMilestonesReached(count, rule.milestoneCount)) {
          grants.push({
            amount: rule.amountMinor,
            autoApprove: rule.autoApprove,
            beneficiary: "REFERRER",
            dedupeKey: `rule:${rule.id}:user:${referral.referrerId}:n:${n}`,
            description: `${rule.name}: ${n} referrals reached ${rule.stage.name}`,
            recipientId: referral.referrerId,
            // The referral that completed the milestone, when it is this one.
            referralId: n === count ? referral.id : null,
            ruleId: rule.id,
            stageId: null,
            unit: rule.unit === "POINTS" ? "POINTS" : "CASH"
          });
        }
      }
    }

    for (const grant of grants) {
      const { count: created } = await tx.referralReward.createMany({
        data: [
          {
            amountMinor: grant.amount,
            beneficiary: grant.beneficiary,
            currency: settings.currency,
            dedupeKey: grant.dedupeKey,
            description: grant.description,
            referralId: grant.referralId,
            referrerId: grant.recipientId,
            ruleId: grant.ruleId,
            stageId: grant.stageId,
            unit: grant.unit
          }
        ],
        skipDuplicates: true
      });
      if (created === 1 && grant.autoApprove) {
        const reward = await tx.referralReward.findUniqueOrThrow({ where: { dedupeKey: grant.dedupeKey } });
        await this.credits.creditReward(tx, reward.id, null);
      }
    }
  }
}

type Grant = {
  amount: number;
  autoApprove: boolean;
  beneficiary: ReferralBeneficiary;
  dedupeKey: string;
  description: string;
  recipientId: string;
  referralId: string | null;
  ruleId: string | null;
  stageId: string | null;
  unit: "CASH" | "POINTS";
};

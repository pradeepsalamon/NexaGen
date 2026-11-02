import { ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  canAutoAdvanceReferral,
  DEFAULT_REFERRAL_STAGES,
  referralMilestonesReached,
  referralStagesReached
} from "@nexa-chess/types";
import type { ReferralStage, ReferralStageTrigger, UserRole } from "@prisma/client";
import { PrismaService, type PrismaTransactionClient } from "../prisma/prisma.service";
import { ReferralCreditsService } from "./referral-credits.service";

type ReferralForMove = {
  id: string;
  referrerId: string;
  stageId: string;
  convertedAt: Date | null;
  referrer: { role: UserRole };
};

const REFERRAL_FOR_MOVE = {
  convertedAt: true,
  id: true,
  referrer: { select: { role: true } },
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
    private readonly credits: ReferralCreditsService
  ) {}

  async listStages(client: PrismaTransactionClient | PrismaService = this.prisma): Promise<ReferralStage[]> {
    const read = () => client.referralStage.findMany({ orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
    const stages = await read();
    if (stages.length > 0) return stages;
    // The migration seeds these; a wiped table (a test reset, a hand-cleaned
    // dev database) gets them back rather than a pipeline with no stages.
    await client.referralStage.createMany({ data: [...DEFAULT_REFERRAL_STAGES], skipDuplicates: true });
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
   * Creates the rewards the reached stages earn. Each reward has a dedupe key
   * (`rule:…:ref:…` / `rule:…:user:…:n:…`), inserted with skipDuplicates, so
   * moving back and forth — or two racing events — never pays twice.
   */
  private async grantRewards(tx: PrismaTransactionClient, referral: ReferralForMove, stageIds: string[]) {
    if (stageIds.length === 0) return;
    const rules = await tx.referralRewardRule.findMany({
      include: { stage: { select: { name: true } } },
      where: { isActive: true, stageId: { in: stageIds } }
    });

    for (const rule of rules) {
      if (rule.roles.length > 0 && !rule.roles.includes(referral.referrer.role)) continue;

      const grants: { dedupeKey: string; description: string; referralId: string | null }[] = [];
      if (rule.kind === "PER_REFERRAL") {
        grants.push({
          dedupeKey: `rule:${rule.id}:ref:${referral.id}`,
          description: `${rule.name}: a referral reached ${rule.stage.name}`,
          referralId: referral.id
        });
      } else if (rule.milestoneCount) {
        const count = await tx.referralStageReach.count({
          where: { referral: { referrerId: referral.referrerId }, stageId: rule.stageId }
        });
        for (const n of referralMilestonesReached(count, rule.milestoneCount)) {
          grants.push({
            dedupeKey: `rule:${rule.id}:user:${referral.referrerId}:n:${n}`,
            description: `${rule.name}: ${n} referrals reached ${rule.stage.name}`,
            // The referral that completed the milestone, when it is this one.
            referralId: n === count ? referral.id : null
          });
        }
      }

      for (const grant of grants) {
        const { count: created } = await tx.referralReward.createMany({
          data: [
            {
              amountMinor: rule.amountMinor,
              currency: rule.currency,
              dedupeKey: grant.dedupeKey,
              description: grant.description,
              referralId: grant.referralId,
              referrerId: referral.referrerId,
              ruleId: rule.id
            }
          ],
          skipDuplicates: true
        });
        if (created === 1 && rule.autoApprove) {
          const reward = await tx.referralReward.findUniqueOrThrow({ where: { dedupeKey: grant.dedupeKey } });
          await this.credits.creditReward(tx, reward.id, null);
        }
      }
    }
  }
}

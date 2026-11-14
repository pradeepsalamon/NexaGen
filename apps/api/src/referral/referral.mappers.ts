import {
  maskProspectName,
  referralBonusAudienceOf,
  referralStageToneSchema,
  type AdminReferralItem,
  type ReferralBonusRuleItem,
  type ReferralCreditEntryItem,
  type ReferralItem,
  type ReferralRewardItem,
  type ReferralStageItem,
  type ReferralStageTone,
  type ReferralWithdrawalItem
} from "@nexa-chess/types";
import type { Prisma, ReferralCreditEntry, ReferralStage } from "@prisma/client";
import { displayName, toReferrerRole } from "./referral.util";

export function toTone(tone: string): ReferralStageTone {
  const parsed = referralStageToneSchema.safeParse(tone);
  return parsed.success ? parsed.data : "secondary";
}

export function toStageItem(stage: ReferralStage, referralCount = 0): ReferralStageItem {
  return {
    description: stage.description,
    id: stage.id,
    name: stage.name,
    position: stage.position,
    coachCashMinor: stage.coachCashMinor,
    newMemberPoints: stage.newMemberPoints,
    referralCount,
    salesCashMinor: stage.salesCashMinor,
    studentPoints: stage.studentPoints,
    tone: toTone(stage.tone),
    trigger: stage.trigger
  };
}

export const REFERRAL_ITEM_INCLUDE = {
  _count: { select: { visits: true } },
  code: { select: { code: true } },
  lead: { select: { email: true, parentName: true, phone: true } },
  referredUser: { select: { email: true, firstName: true, id: true, lastName: true } },
  referrer: { select: { firstName: true, id: true, lastName: true, role: true } },
  stage: true
} satisfies Prisma.ReferralInclude;

export type ReferralWithItemInclude = Prisma.ReferralGetPayload<{ include: typeof REFERRAL_ITEM_INCLUDE }>;

/**
 * `fullView` (SALES on their own referrals, admins) shows the whole prospect
 * name and contact; students and coaches see "Priya S." and no contact.
 */
export function toReferralItem(referral: ReferralWithItemInclude, fullView: boolean): ReferralItem {
  return {
    contact:
      fullView && referral.lead
        ? { email: referral.lead.email, parentName: referral.lead.parentName, phone: referral.lead.phone }
        : null,
    convertedAt: referral.convertedAt?.toISOString() ?? null,
    createdAt: referral.createdAt.toISOString(),
    id: referral.id,
    joined: referral.referredUserId !== null,
    prospectName: fullView ? referral.prospectName : maskProspectName(referral.prospectName),
    stageChangedAt: referral.stageChangedAt.toISOString(),
    stageId: referral.stageId,
    stageName: referral.stage.name,
    stageTone: toTone(referral.stage.tone),
    stageTrigger: referral.stage.trigger,
    visits: referral._count.visits
  };
}

export function toAdminReferralItem(referral: ReferralWithItemInclude): AdminReferralItem {
  return {
    ...toReferralItem(referral, true),
    code: referral.code.code,
    leadId: referral.leadId,
    referredUser: referral.referredUser
      ? { email: referral.referredUser.email, id: referral.referredUser.id, name: displayName(referral.referredUser) }
      : null,
    referrerId: referral.referrerId,
    referrerName: displayName(referral.referrer),
    referrerRole: toReferrerRole(referral.referrer.role)
  };
}

export const REWARD_ITEM_INCLUDE = {
  referral: { select: { prospectName: true } },
  referrer: { select: { firstName: true, lastName: true, role: true } },
  rule: { select: { name: true } },
  stage: { select: { name: true } }
} satisfies Prisma.ReferralRewardInclude;

export function toRewardItem(
  reward: Prisma.ReferralRewardGetPayload<{ include: typeof REWARD_ITEM_INCLUDE }>,
  fullView: boolean
): ReferralRewardItem {
  const name = reward.referral?.prospectName ?? null;
  return {
    amountMinor: reward.amountMinor,
    beneficiary: reward.beneficiary,
    createdAt: reward.createdAt.toISOString(),
    creditedAt: reward.creditedAt?.toISOString() ?? null,
    currency: reward.currency,
    description: reward.description,
    id: reward.id,
    prospectName: fullView ? name : maskProspectName(name),
    referralId: reward.referralId,
    referrerId: reward.referrerId,
    referrerName: displayName(reward.referrer),
    referrerRole: toReferrerRole(reward.referrer.role),
    sourceName: reward.rule?.name ?? (reward.stage ? `Stage: ${reward.stage.name}` : "Stage reward"),
    status: reward.status,
    unit: reward.unit
  };
}

export const BONUS_RULE_INCLUDE = {
  _count: { select: { rewards: true } },
  stage: { select: { name: true } }
} satisfies Prisma.ReferralRewardRuleInclude;

/** Only milestone bonuses in today's shape are bonus rules; anything else is pre-rebuild history. */
export const BONUS_RULE_WHERE = { beneficiary: "REFERRER", kind: "MILESTONE" } satisfies Prisma.ReferralRewardRuleWhereInput;

export function toBonusRuleItem(
  rule: Prisma.ReferralRewardRuleGetPayload<{ include: typeof BONUS_RULE_INCLUDE }>
): ReferralBonusRuleItem | null {
  const audience = referralBonusAudienceOf(rule.roles, rule.unit);
  if (!audience || !rule.milestoneCount) return null;
  return {
    amount: rule.amountMinor,
    audience,
    autoApprove: rule.autoApprove,
    createdAt: rule.createdAt.toISOString(),
    currency: rule.currency,
    description: rule.description,
    everyCount: rule.milestoneCount,
    id: rule.id,
    isActive: rule.isActive,
    name: rule.name,
    rewardCount: rule._count.rewards,
    stageId: rule.stageId,
    stageName: rule.stage.name
  };
}

export const WITHDRAWAL_ITEM_INCLUDE = {
  user: { select: { firstName: true, lastName: true, role: true } }
} satisfies Prisma.ReferralWithdrawalInclude;

export function toWithdrawalItem(
  withdrawal: Prisma.ReferralWithdrawalGetPayload<{ include: typeof WITHDRAWAL_ITEM_INCLUDE }>
): ReferralWithdrawalItem {
  return {
    adminNote: withdrawal.adminNote,
    amountMinor: withdrawal.amountMinor,
    createdAt: withdrawal.createdAt.toISOString(),
    currency: withdrawal.currency,
    id: withdrawal.id,
    payoutDetails: withdrawal.payoutDetails,
    payoutReference: withdrawal.payoutReference,
    reviewedAt: withdrawal.reviewedAt?.toISOString() ?? null,
    status: withdrawal.status,
    userId: withdrawal.userId,
    userName: displayName(withdrawal.user),
    userRole: toReferrerRole(withdrawal.user.role)
  };
}

export function toCreditEntryItem(entry: ReferralCreditEntry): ReferralCreditEntryItem {
  return {
    amountMinor: entry.amountMinor,
    createdAt: entry.createdAt.toISOString(),
    currency: entry.currency,
    id: entry.id,
    note: entry.note,
    type: entry.type,
    wallet: entry.wallet
  };
}

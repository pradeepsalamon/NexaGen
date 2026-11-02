import {
  maskProspectName,
  referralStageToneSchema,
  type AdminReferralItem,
  type ReferralCreditEntryItem,
  type ReferralItem,
  type ReferralRewardItem,
  type ReferralRewardRuleItem,
  type ReferralStageItem,
  type ReferralStageTone,
  type ReferralWithdrawalItem,
  type ReferrerRole
} from "@nexa-chess/types";
import type { Prisma, ReferralStage } from "@prisma/client";
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
    referralCount,
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
  discount: { select: { code: true, endsAt: true, isActive: true, redemptionCount: true } },
  referral: { select: { prospectName: true } },
  referrer: { select: { firstName: true, lastName: true, role: true } },
  rule: { select: { name: true } }
} satisfies Prisma.ReferralRewardInclude;

export function toRewardItem(
  reward: Prisma.ReferralRewardGetPayload<{ include: typeof REWARD_ITEM_INCLUDE }>,
  fullView: boolean
): ReferralRewardItem {
  const name = reward.referral?.prospectName ?? null;
  const discount = reward.discount;
  return {
    amountMinor: reward.amountMinor,
    beneficiary: reward.beneficiary,
    discountCode: discount?.code ?? null,
    discountStatus: discount
      ? discount.redemptionCount > 0
        ? "USED"
        : !discount.isActive
          ? "CANCELLED"
          : discount.endsAt && discount.endsAt <= new Date()
            ? "EXPIRED"
            : "ACTIVE"
      : null,
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
    ruleId: reward.ruleId,
    ruleName: reward.rule.name,
    status: reward.status,
    unit: reward.unit
  };
}

export const RULE_ITEM_INCLUDE = {
  _count: { select: { rewards: true } },
  stage: { select: { name: true } }
} satisfies Prisma.ReferralRewardRuleInclude;

export function toRuleItem(rule: Prisma.ReferralRewardRuleGetPayload<{ include: typeof RULE_ITEM_INCLUDE }>): ReferralRewardRuleItem {
  return {
    amountMinor: rule.amountMinor,
    autoApprove: rule.autoApprove,
    beneficiary: rule.beneficiary,
    discountValidDays: rule.discountValidDays,
    maxDiscountMinor: rule.maxDiscountMinor,
    unit: rule.unit,
    createdAt: rule.createdAt.toISOString(),
    currency: rule.currency,
    description: rule.description,
    id: rule.id,
    isActive: rule.isActive,
    kind: rule.kind,
    milestoneCount: rule.milestoneCount,
    name: rule.name,
    rewardCount: rule._count.rewards,
    roles: rule.roles.map(toReferrerRole) as ReferrerRole[],
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

export const CREDIT_ENTRY_INCLUDE = {
  transfer: {
    select: {
      fromUser: { select: { firstName: true, lastName: true } },
      fromUserId: true,
      toUser: { select: { firstName: true, lastName: true } }
    }
  }
} satisfies Prisma.ReferralCreditEntryInclude;

export function toCreditEntryItem(
  entry: Prisma.ReferralCreditEntryGetPayload<{ include: typeof CREDIT_ENTRY_INCLUDE }>
): ReferralCreditEntryItem {
  const transfer = entry.transfer;
  return {
    amountMinor: entry.amountMinor,
    counterpartyName: transfer
      ? displayName(transfer.fromUserId === entry.userId ? transfer.toUser : transfer.fromUser)
      : null,
    createdAt: entry.createdAt.toISOString(),
    currency: entry.currency,
    id: entry.id,
    note: entry.note,
    type: entry.type,
    wallet: entry.wallet
  };
}

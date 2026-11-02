import { z } from "zod";
import { formatMoney } from "./payments";

// Referral program (docs/REFERRALS.md). Students, coaches and SALES accounts
// share a link (`/r/<code>`); every person who opens it is tracked through an
// admin-editable pipeline, and admin-defined rules turn progress into rewards
// for the referrer and for the new person who joined. Rewards land in two
// wallets: CASH (money — withdraw or pay fees, never transferable) and POINTS
// (send to other users, pay fees, or convert one way into CASH at the admin
// rate).

// ── Roles ──

/** Roles that can hold a referral link. SALES exists only for this. */
export const REFERRER_ROLES = ["STUDENT", "COACH", "SALES"] as const;
export const referrerRoleSchema = z.enum(REFERRER_ROLES);
export type ReferrerRole = z.infer<typeof referrerRoleSchema>;

export const REFERRER_ROLE_LABELS: Record<ReferrerRole, string> = {
  COACH: "Coach",
  SALES: "Sales",
  STUDENT: "Student"
};

// ── Codes ──

/** Codes are matched uppercase: letters and digits, 4 to 16 long. */
export const referralCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4,16}$/, "Use 4 to 16 letters or digits.");

/** Alphabet without look-alikes (0/O, 1/I/L) for the random suffix. */
export const REFERRAL_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** The readable prefix of a new code: up to 6 letters of the first name. */
export function referralCodePrefix(firstName: string): string {
  const letters = firstName
    .normalize("NFKD")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase()
    .slice(0, 6);
  return letters.length >= 2 ? letters : "NEXA";
}

/** The public link for a code. */
export function referralLink(siteUrl: string, code: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/r/${encodeURIComponent(code)}`;
}

// ── Stages ──

export const REFERRAL_STAGE_TRIGGERS = [
  "MANUAL",
  "LINK_VISITED",
  "DEMO_BOOKED",
  "DEMO_ATTENDED",
  "CONVERTED",
  "LOST"
] as const;
export const referralStageTriggerSchema = z.enum(REFERRAL_STAGE_TRIGGERS);
export type ReferralStageTrigger = z.infer<typeof referralStageTriggerSchema>;

export const REFERRAL_STAGE_TRIGGER_LABELS: Record<ReferralStageTrigger, string> = {
  CONVERTED: "Onboarded (set by an admin)",
  DEMO_ATTENDED: "Joins the demo class",
  DEMO_BOOKED: "Books a demo class",
  LINK_VISITED: "Opens the referral link",
  LOST: "Marked as not joining",
  MANUAL: "Moved by an admin"
};

/** Badge variants a stage may use. */
export const REFERRAL_STAGE_TONES = [
  "secondary",
  "info",
  "warning",
  "success",
  "destructive",
  "accent",
  "default"
] as const;
export const referralStageToneSchema = z.enum(REFERRAL_STAGE_TONES);
export type ReferralStageTone = z.infer<typeof referralStageToneSchema>;

export type ReferralStageItem = {
  id: string;
  name: string;
  description: string | null;
  tone: ReferralStageTone;
  position: number;
  trigger: ReferralStageTrigger;
  /** Referrals currently in this stage (admin list only; 0 elsewhere). */
  referralCount: number;
};

/**
 * The default pipeline, seeded by the `referral_program` migration (and again
 * by the API if the table is ever empty). Admins rename, reorder and extend it.
 */
export const DEFAULT_REFERRAL_STAGES: readonly {
  id: string;
  name: string;
  description: string;
  tone: ReferralStageTone;
  position: number;
  trigger: ReferralStageTrigger;
}[] = [
  { description: "Opened the referral link.", id: "refstage_visited", name: "Visited", position: 10, tone: "secondary", trigger: "LINK_VISITED" },
  { description: "Booked a free demo class.", id: "refstage_booked", name: "Demo booked", position: 20, tone: "info", trigger: "DEMO_BOOKED" },
  { description: "Joined the demo class.", id: "refstage_attended", name: "Demo attended", position: 30, tone: "warning", trigger: "DEMO_ATTENDED" },
  { description: "Enrolled at the academy (set by an admin).", id: "refstage_converted", name: "Onboarded", position: 40, tone: "success", trigger: "CONVERTED" },
  { description: "Decided not to join.", id: "refstage_lost", name: "Not joined", position: 50, tone: "destructive", trigger: "LOST" }
];

type StageLike = { id: string; position: number; trigger: ReferralStageTrigger };

/** A CONVERTED or LOST stage is final: nothing automatic moves a referral out. */
export function isFinalReferralStage(stage: Pick<StageLike, "trigger">): boolean {
  return stage.trigger === "CONVERTED" || stage.trigger === "LOST";
}

/**
 * Whether an automatic event (visit, booking, attendance) may move a referral
 * from `from` to `to`: only forward, and never out of a final stage. Admin
 * moves ignore this rule.
 */
export function canAutoAdvanceReferral(from: StageLike | null, to: StageLike): boolean {
  if (!from) return true;
  if (from.id === to.id || isFinalReferralStage(from)) return false;
  return to.position > from.position;
}

/**
 * Every stage a referral counts as having reached when it enters `target`:
 * the target plus each earlier non-LOST stage (a jump from "Visited" straight
 * to "Onboarded" still attended a demo). Entering LOST reaches only LOST.
 */
export function referralStagesReached<T extends StageLike>(stages: readonly T[], target: T): T[] {
  if (target.trigger === "LOST") return [target];
  return stages.filter(
    (stage) => stage.id === target.id || (stage.trigger !== "LOST" && stage.position <= target.position)
  );
}

// ── Rewards ──

export const referralRewardKindSchema = z.enum(["PER_REFERRAL", "MILESTONE"]);
export type ReferralRewardKind = z.infer<typeof referralRewardKindSchema>;

export const referralRewardStatusSchema = z.enum(["PENDING", "CREDITED", "CANCELLED"]);
export type ReferralRewardStatus = z.infer<typeof referralRewardStatusSchema>;

/** CASH = money (minor units); POINTS = whole points; DISCOUNT_PERCENT = whole percent off one payment. */
export const referralRewardUnitSchema = z.enum(["CASH", "POINTS", "DISCOUNT_PERCENT"]);
export type ReferralRewardUnit = z.infer<typeof referralRewardUnitSchema>;

export const REFERRAL_REWARD_UNIT_LABELS: Record<ReferralRewardUnit, string> = {
  CASH: "Money",
  DISCOUNT_PERCENT: "Discount on fees",
  POINTS: "Points"
};

/** REFERRER = the person who shared the link; REFERRED = the new person who joined through it. */
export const referralBeneficiarySchema = z.enum(["REFERRER", "REFERRED"]);
export type ReferralBeneficiary = z.infer<typeof referralBeneficiarySchema>;

export const REFERRAL_BENEFICIARY_LABELS: Record<ReferralBeneficiary, string> = {
  REFERRED: "New member (referred)",
  REFERRER: "Referrer"
};

/** "₹500", "250 points" or "10% off". */
export function formatReferralReward(amount: number, unit: ReferralRewardUnit, currency: string): string {
  if (unit === "POINTS") return formatReferralPoints(amount);
  if (unit === "DISCOUNT_PERCENT") return `${amount}% off`;
  return formatMoney(amount, currency);
}

export function formatReferralPoints(points: number): string {
  const abs = Math.abs(points);
  return `${points < 0 ? "-" : ""}${abs.toLocaleString("en-IN")} ${abs === 1 ? "point" : "points"}`;
}

/**
 * The milestone multiples a referrer has earned for `count` referrals at a
 * stage with a rule of every `milestoneCount`: 7 with every 3 → [3, 6].
 */
export function referralMilestonesReached(count: number, milestoneCount: number): number[] {
  if (!Number.isInteger(milestoneCount) || milestoneCount < 1 || count < milestoneCount) return [];
  const reached: number[] = [];
  for (let n = milestoneCount; n <= count; n += milestoneCount) reached.push(n);
  return reached;
}

export type ReferralRewardRuleItem = {
  id: string;
  name: string;
  description: string | null;
  stageId: string;
  stageName: string;
  kind: ReferralRewardKind;
  milestoneCount: number | null;
  /** The value in `unit`: minor units, points or percent. */
  amountMinor: number;
  currency: string;
  unit: ReferralRewardUnit;
  beneficiary: ReferralBeneficiary;
  maxDiscountMinor: number | null;
  discountValidDays: number | null;
  /** Empty = every referrer role (always the role of the person who shared the link). */
  roles: ReferrerRole[];
  autoApprove: boolean;
  isActive: boolean;
  rewardCount: number;
  createdAt: string;
};

const rewardRuleBaseSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  description: z.string().trim().max(500).optional().nullable(),
  stageId: z.string().min(1, "Pick a stage."),
  kind: referralRewardKindSchema,
  milestoneCount: z.number().int().min(2, "A milestone is at least 2 referrals.").max(1000).optional().nullable(),
  /** In `unit`: minor units (₹500 = 50000), whole points, or whole percent (1–100). */
  amountMinor: z.number().int().min(1, "Amount must be more than zero.").max(100_000_000),
  unit: referralRewardUnitSchema.default("CASH"),
  beneficiary: referralBeneficiarySchema.default("REFERRER"),
  maxDiscountMinor: z.number().int().min(1).max(100_000_000).optional().nullable(),
  discountValidDays: z.number().int().min(1).max(3650).optional().nullable(),
  roles: z.array(referrerRoleSchema).max(REFERRER_ROLES.length),
  autoApprove: z.boolean(),
  isActive: z.boolean()
});

/**
 * The shape rules a reward rule must follow, as one message or null:
 * a milestone needs a count; a discount is for the referred person only, is
 * 1–100 percent, and is paid per referral; a referred person's reward is
 * always per referral (they join once).
 */
export function referralRewardRuleProblem(rule: {
  kind: ReferralRewardKind;
  milestoneCount?: number | null;
  unit: ReferralRewardUnit;
  beneficiary: ReferralBeneficiary;
  amountMinor: number;
}): { message: string; path: string } | null {
  if (rule.kind === "MILESTONE" && (rule.milestoneCount ?? 0) < 2) {
    return { message: "Set how many referrals make a milestone.", path: "milestoneCount" };
  }
  if (rule.beneficiary === "REFERRED" && rule.kind !== "PER_REFERRAL") {
    return { message: "A new member's benefit is given once, per referral.", path: "kind" };
  }
  if (rule.unit === "DISCOUNT_PERCENT" && rule.beneficiary !== "REFERRED") {
    return { message: "Fee discounts are for the new member. Give referrers money or points.", path: "unit" };
  }
  if (rule.unit === "DISCOUNT_PERCENT" && rule.amountMinor > 100) {
    return { message: "A discount is at most 100%.", path: "amountMinor" };
  }
  return null;
}

export const createReferralRewardRuleRequestSchema = rewardRuleBaseSchema.superRefine((rule, ctx) => {
  const problem = referralRewardRuleProblem(rule);
  if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem.message, path: [problem.path] });
});
export type CreateReferralRewardRuleRequest = z.infer<typeof createReferralRewardRuleRequestSchema>;

export const updateReferralRewardRuleRequestSchema = rewardRuleBaseSchema.partial();
export type UpdateReferralRewardRuleRequest = z.infer<typeof updateReferralRewardRuleRequestSchema>;

export type ReferralRewardItem = {
  id: string;
  ruleId: string;
  ruleName: string;
  referrerId: string;
  referrerName: string;
  referrerRole: ReferrerRole;
  referralId: string | null;
  prospectName: string | null;
  /** The value in `unit`. */
  amountMinor: number;
  currency: string;
  unit: ReferralRewardUnit;
  /** REFERRED = `referrerId`/`referrerName` are the new member who received it. */
  beneficiary: ReferralBeneficiary;
  /** DISCOUNT_PERCENT once credited: the personal code and whether it is still usable. */
  discountCode: string | null;
  discountStatus: "ACTIVE" | "USED" | "CANCELLED" | "EXPIRED" | null;
  status: ReferralRewardStatus;
  description: string;
  createdAt: string;
  creditedAt: string | null;
};

export const cancelReferralRewardRequestSchema = z.object({
  reason: z.string().trim().max(500).optional()
});
export type CancelReferralRewardRequest = z.infer<typeof cancelReferralRewardRequestSchema>;

// ── Credits ──

export const referralCreditEntryTypeSchema = z.enum([
  "REWARD",
  "REWARD_REVERSAL",
  "WITHDRAWAL",
  "WITHDRAWAL_REVERSAL",
  "PAYMENT_CODE",
  "PAYMENT_CODE_REVERSAL",
  "ADJUSTMENT",
  "POINTS_TRANSFER_OUT",
  "POINTS_TRANSFER_IN",
  "CONVERSION_OUT",
  "CONVERSION_IN"
]);
export type ReferralCreditEntryType = z.infer<typeof referralCreditEntryTypeSchema>;

/** CASH = money (never transferable); POINTS = sendable, convertible one way into CASH. */
export const referralWalletSchema = z.enum(["CASH", "POINTS"]);
export type ReferralWallet = z.infer<typeof referralWalletSchema>;

export const REFERRAL_WALLET_LABELS: Record<ReferralWallet, string> = {
  CASH: "Money",
  POINTS: "Points"
};

export const REFERRAL_CREDIT_ENTRY_LABELS: Record<ReferralCreditEntryType, string> = {
  ADJUSTMENT: "Adjustment",
  CONVERSION_IN: "Converted from points",
  CONVERSION_OUT: "Converted to money",
  POINTS_TRANSFER_IN: "Points received",
  POINTS_TRANSFER_OUT: "Points sent",
  PAYMENT_CODE: "Payment code",
  PAYMENT_CODE_REVERSAL: "Payment code cancelled",
  REWARD: "Reward",
  REWARD_REVERSAL: "Reward cancelled",
  WITHDRAWAL: "Withdrawal",
  WITHDRAWAL_REVERSAL: "Withdrawal returned"
};

export type ReferralCreditEntryItem = {
  id: string;
  type: ReferralCreditEntryType;
  wallet: ReferralWallet;
  /** Signed: minor units (CASH) or points (POINTS). */
  amountMinor: number;
  currency: string;
  note: string | null;
  /** Transfers: the other person's name. */
  counterpartyName: string | null;
  createdAt: string;
};

/** Admin ledger row: every wallet movement of every user. */
export type AdminReferralLedgerItem = ReferralCreditEntryItem & {
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  createdByName: string | null;
};

/** One "formatAmount" for a ledger amount in its wallet. */
export function formatReferralWalletAmount(amount: number, wallet: ReferralWallet, currency: string): string {
  return wallet === "POINTS" ? formatReferralPoints(amount) : formatMoney(amount, currency);
}

export const adjustReferralCreditsRequestSchema = z.object({
  userId: z.string().min(1),
  wallet: referralWalletSchema.default("CASH"),
  /** Signed, in the wallet's unit (minor units or points); never zero. */
  amountMinor: z
    .number()
    .int()
    .min(-100_000_000)
    .max(100_000_000)
    .refine((value) => value !== 0, "Amount cannot be zero."),
  note: z.string().trim().min(1, "Say why.").max(500)
});
export type AdjustReferralCreditsRequest = z.infer<typeof adjustReferralCreditsRequestSchema>;

// ── Withdrawals ──

export const referralWithdrawalStatusSchema = z.enum(["REQUESTED", "PAID", "REJECTED", "CANCELLED"]);
export type ReferralWithdrawalStatus = z.infer<typeof referralWithdrawalStatusSchema>;

export type ReferralWithdrawalItem = {
  id: string;
  userId: string;
  userName: string;
  userRole: ReferrerRole;
  amountMinor: number;
  currency: string;
  payoutDetails: string;
  status: ReferralWithdrawalStatus;
  adminNote: string | null;
  payoutReference: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

export const requestReferralWithdrawalRequestSchema = z.object({
  amountMinor: z.number().int().min(1, "Enter an amount."),
  payoutDetails: z.string().trim().min(3, "Tell us where to send the money (UPI id or bank details).").max(500)
});
export type RequestReferralWithdrawalRequest = z.infer<typeof requestReferralWithdrawalRequestSchema>;

export const payReferralWithdrawalRequestSchema = z.object({
  payoutReference: z.string().trim().min(1, "Add the transfer reference.").max(200),
  adminNote: z.string().trim().max(500).optional()
});
export type PayReferralWithdrawalRequest = z.infer<typeof payReferralWithdrawalRequestSchema>;

export const rejectReferralWithdrawalRequestSchema = z.object({
  adminNote: z.string().trim().min(1, "Say why.").max(500)
});
export type RejectReferralWithdrawalRequest = z.infer<typeof rejectReferralWithdrawalRequestSchema>;

// ── Payment codes (credits → fees) ──

export type ReferralPaymentCodeItem = {
  id: string;
  code: string;
  /** What the code takes off, in minor units. */
  amountMinor: number;
  currency: string;
  /** Which wallet paid for it; `points` is how many points it cost (POINTS only). */
  wallet: ReferralWallet;
  points: number | null;
  /** ACTIVE = unused; USED = applied to a paid order; CANCELLED = credits returned. */
  status: "ACTIVE" | "USED" | "CANCELLED";
  createdAt: string;
};

export const createReferralPaymentCodeRequestSchema = z.object({
  wallet: referralWalletSchema.default("CASH"),
  /** Minor units from CASH, or a number of points from POINTS. */
  amount: z.number().int().min(1, "Enter an amount.").max(100_000_000)
});
export type CreateReferralPaymentCodeRequest = z.infer<typeof createReferralPaymentCodeRequestSchema>;

// ── Points: transfers and conversion ──

/** The money value of `points` at the admin rate, rounded down to a whole minor unit. */
export function referralPointsValueMinor(
  points: number,
  rate: { conversionPoints: number; conversionValueMinor: number }
): number {
  if (points <= 0 || rate.conversionPoints <= 0 || rate.conversionValueMinor <= 0) return 0;
  return Math.floor((points * rate.conversionValueMinor) / rate.conversionPoints);
}

export const transferReferralPointsRequestSchema = z.object({
  /** The recipient's account email. */
  email: z.string().trim().toLowerCase().email("Enter the email they sign in with."),
  points: z.number().int().min(1, "Enter how many points.").max(100_000_000),
  note: z.string().trim().max(200).optional()
});
export type TransferReferralPointsRequest = z.infer<typeof transferReferralPointsRequestSchema>;

export type TransferReferralPointsResponse = {
  points: number;
  recipientName: string;
  pointsBalance: number;
};

export const convertReferralPointsRequestSchema = z.object({
  points: z.number().int().min(1, "Enter how many points.").max(100_000_000)
});
export type ConvertReferralPointsRequest = z.infer<typeof convertReferralPointsRequestSchema>;

export type ConvertReferralPointsResponse = {
  points: number;
  amountMinor: number;
  currency: string;
};

// ── Referrals ──

/** "Priya Sharma" → "Priya S." — all a non-sales referrer sees of a prospect. */
export function maskProspectName(name: string | null | undefined): string | null {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  const [first, ...rest] = parts;
  const last = rest.at(-1);
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first!;
}

export type ReferralItem = {
  id: string;
  /** Masked for students and coaches; full for SALES and admins. */
  prospectName: string | null;
  stageId: string;
  stageName: string;
  stageTone: ReferralStageTone;
  stageTrigger: ReferralStageTrigger;
  visits: number;
  createdAt: string;
  stageChangedAt: string;
  convertedAt: string | null;
  /** SALES (own referrals) and admins only; null otherwise. */
  contact: { phone: string | null; email: string | null; parentName: string | null } | null;
  /** Signed up: the new member's account is linked (their benefits go there). */
  joined: boolean;
};

export type AdminReferralItem = ReferralItem & {
  referrerId: string;
  referrerName: string;
  referrerRole: ReferrerRole;
  code: string;
  leadId: string | null;
  referredUser: { id: string; name: string; email: string } | null;
};

export type ReferralStageEventItem = {
  id: string;
  fromStageName: string | null;
  toStageName: string | null;
  actorName: string | null;
  note: string | null;
  createdAt: string;
};

export type AdminReferralDetail = AdminReferralItem & {
  events: ReferralStageEventItem[];
  rewards: ReferralRewardItem[];
};

/** Link (email) or unlink (null) the new member's account. */
export const linkReferredUserRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter the account's email.").nullable()
});
export type LinkReferredUserRequest = z.infer<typeof linkReferredUserRequestSchema>;

export const moveReferralStageRequestSchema = z.object({
  stageId: z.string().min(1),
  note: z.string().trim().max(500).optional()
});
export type MoveReferralStageRequest = z.infer<typeof moveReferralStageRequestSchema>;

export const referralVisitRequestSchema = z.object({
  code: z.string().trim().min(1).max(32),
  url: z.string().trim().max(2000).optional(),
  referrer: z.string().trim().max(2000).optional()
});
export type ReferralVisitRequest = z.infer<typeof referralVisitRequestSchema>;

export type ReferralVisitResponse = {
  /** False for an unknown or switched-off code; the page simply continues. */
  valid: boolean;
  /** The referrer's first name, for a "Invited by Priya" line. */
  referrerFirstName: string | null;
  /** What the new member gets for joining through this link. */
  benefits: ReferralBenefitItem[];
};

/** A REFERRED-beneficiary rule, as the new member sees it. */
export type ReferralBenefitItem = {
  id: string;
  name: string;
  description: string | null;
  stageName: string;
  amountMinor: number;
  unit: ReferralRewardUnit;
  currency: string;
};

// ── Stage admin ──

export const createReferralStageRequestSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(60),
  description: z.string().trim().max(300).optional().nullable(),
  tone: referralStageToneSchema
});
export type CreateReferralStageRequest = z.infer<typeof createReferralStageRequestSchema>;

export const updateReferralStageRequestSchema = createReferralStageRequestSchema.partial();
export type UpdateReferralStageRequest = z.infer<typeof updateReferralStageRequestSchema>;

export const reorderReferralStagesRequestSchema = z.object({
  stageIds: z.array(z.string().min(1)).min(1).max(50)
});
export type ReorderReferralStagesRequest = z.infer<typeof reorderReferralStagesRequestSchema>;

// ── Settings ──

export type ReferralSettingsItem = {
  enabled: boolean;
  referrerRoles: ReferrerRole[];
  attributionDays: number;
  currency: string;
  withdrawalRoles: ReferrerRole[];
  minWithdrawalMinor: number;
  paymentUseRoles: ReferrerRole[];
  programTerms: string | null;
  pointsTransferEnabled: boolean;
  pointsTransferRoles: ReferrerRole[];
  minTransferPoints: number;
  /** Rolling 24 hours per sender; 0 = no limit. */
  maxTransferPointsPerDay: number;
  pointsConversionEnabled: boolean;
  pointsConversionRoles: ReferrerRole[];
  /** `conversionPoints` points = `conversionValueMinor` minor units. */
  conversionPoints: number;
  conversionValueMinor: number;
  minConversionPoints: number;
  pointsPaymentEnabled: boolean;
};

export const updateReferralSettingsRequestSchema = z.object({
  enabled: z.boolean().optional(),
  referrerRoles: z.array(referrerRoleSchema).max(REFERRER_ROLES.length).optional(),
  attributionDays: z.number().int().min(1).max(365).optional(),
  withdrawalRoles: z.array(referrerRoleSchema).max(REFERRER_ROLES.length).optional(),
  minWithdrawalMinor: z.number().int().min(0).max(100_000_000).optional(),
  paymentUseRoles: z.array(referrerRoleSchema).max(REFERRER_ROLES.length).optional(),
  programTerms: z.string().trim().max(4000).optional().nullable(),
  pointsTransferEnabled: z.boolean().optional(),
  pointsTransferRoles: z.array(referrerRoleSchema).max(REFERRER_ROLES.length).optional(),
  minTransferPoints: z.number().int().min(1).max(100_000_000).optional(),
  maxTransferPointsPerDay: z.number().int().min(0).max(100_000_000).optional(),
  pointsConversionEnabled: z.boolean().optional(),
  pointsConversionRoles: z.array(referrerRoleSchema).max(REFERRER_ROLES.length).optional(),
  conversionPoints: z.number().int().min(1, "At least 1 point.").max(1_000_000).optional(),
  conversionValueMinor: z.number().int().min(1, "Worth more than zero.").max(100_000_000).optional(),
  minConversionPoints: z.number().int().min(1).max(100_000_000).optional(),
  pointsPaymentEnabled: z.boolean().optional()
});
export type UpdateReferralSettingsRequest = z.infer<typeof updateReferralSettingsRequestSchema>;

/** SALES always holds a link — it is the only thing the role is for. */
export function canHoldReferralLink(role: string, settings: Pick<ReferralSettingsItem, "enabled" | "referrerRoles">): boolean {
  if (!settings.enabled) return false;
  if (role === "SALES") return true;
  return (settings.referrerRoles as readonly string[]).includes(role);
}

// ── Referrer board ──

export type MyReferralSummary = {
  /** False when the program is off or the role has no link. */
  eligible: boolean;
  code: string | null;
  codeActive: boolean;
  stages: (ReferralStageItem & { reached: number })[];
  totals: {
    referrals: number;
    visits: number;
    converted: number;
  };
  credits: {
    /** CASH wallet (money). */
    balanceMinor: number;
    pendingRewardsMinor: number;
    earnedMinor: number;
    currency: string;
  };
  points: {
    balance: number;
    pending: number;
    earned: number;
    canTransfer: boolean;
    canConvert: boolean;
    canPayFees: boolean;
    minTransferPoints: number;
    maxTransferPointsPerDay: number;
    /** Sent in the last 24 hours (counts against the daily limit). */
    sentLast24h: number;
    conversionPoints: number;
    conversionValueMinor: number;
    minConversionPoints: number;
  };
  canWithdraw: boolean;
  canPayFees: boolean;
  minWithdrawalMinor: number;
  programTerms: string | null;
  /** Active rules for this referrer's role, for "how you earn" (REFERRER) and "what your friend gets" (REFERRED). */
  rules: Pick<
    ReferralRewardRuleItem,
    "id" | "name" | "description" | "stageName" | "kind" | "milestoneCount" | "amountMinor" | "currency" | "unit" | "beneficiary"
  >[];
};

// ── Admin board ──

export type ReferrerStatsItem = {
  userId: string;
  name: string;
  email: string;
  phoneNumber: string | null;
  /** Never signed in yet (SALES accounts waiting for their link). */
  lastLoginAt: string | null;
  role: ReferrerRole;
  code: string | null;
  codeActive: boolean;
  visits: number;
  referrals: number;
  converted: number;
  balanceMinor: number;
  earnedMinor: number;
  pointsBalance: number;
};

export type AdminReferralOverview = {
  stages: ReferralStageItem[];
  totals: {
    referrals: number;
    visits: number;
    converted: number;
    referrers: number;
    pendingRewards: number;
    pendingRewardsMinor: number;
    openWithdrawals: number;
    openWithdrawalsMinor: number;
    /** Points held across every wallet right now. */
    pointsOutstanding: number;
    /** Referrals whose new member has an account linked. */
    joined: number;
  };
  currency: string;
};

export const updateReferrerCodeRequestSchema = z.object({
  isActive: z.boolean().optional(),
  /** A new code; omit to keep the current one. */
  code: referralCodeSchema.optional()
});
export type UpdateReferrerCodeRequest = z.infer<typeof updateReferrerCodeRequestSchema>;

// ── Lists ──

export type ReferralPage<T> = {
  items: T[];
  pagination: { total: number; page: number; pageSize: number; totalPages: number };
};

// ── Sales sign-in links ──

export const sendReferrerAccessLinkRequestSchema = z.object({
  channels: z.array(z.enum(["EMAIL", "WHATSAPP"])).min(1, "Pick email, WhatsApp or both.").max(2),
  /** Saved on the account when given; WhatsApp needs one. */
  phoneNumber: z
    .string()
    .trim()
    .max(20)
    .refine((value) => value === "" || value.replace(/\D/g, "").length >= 10, "Enter a valid phone number.")
    .optional()
});
export type SendReferrerAccessLinkRequest = z.infer<typeof sendReferrerAccessLinkRequestSchema>;

export type SendReferrerAccessLinkResponse = {
  email: "SENT" | "FAILED" | "SKIPPED";
  whatsapp: "SENT" | "FAILED" | "SKIPPED";
  /** Why WhatsApp failed (not configured, bad number…). */
  whatsappError: string | null;
};

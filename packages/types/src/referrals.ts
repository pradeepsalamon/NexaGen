import { z } from "zod";
import { formatMoney } from "./payments";

// Referral program (docs/REFERRALS.md). Students, coaches and SALES accounts
// share a link (`/r/<code>`); every person who opens it is tracked through an
// admin-editable pipeline. Each stage carries admin-set values: students earn
// POINTS, coaches and SALES earn money (CASH, withdrawable), and the new member
// gets points. Milestone bonuses add to that. Students spend points on
// admin-made vouchers (a percent or fixed discount, or free days of access).
// Points are never sent between users and never become money.

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
} & ReferralStageValues;

/** What one referral reaching a stage earns (docs/REFERRALS.md § Earning). */
export type ReferralStageValues = {
  /** Points a student referrer earns. */
  studentPoints: number;
  /** Money (minor units) a coach referrer earns. */
  coachCashMinor: number;
  /** Money (minor units) a SALES referrer earns. */
  salesCashMinor: number;
  /** Points the new member gets once their account is linked. */
  newMemberPoints: number;
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


// ── Wallets ──

/** CASH = money (coaches, SALES; withdrawable, never transferable); POINTS = students and new members, spent on vouchers. */
export const referralWalletSchema = z.enum(["CASH", "POINTS"]);
export type ReferralWallet = z.infer<typeof referralWalletSchema>;

export const REFERRAL_WALLET_LABELS: Record<ReferralWallet, string> = {
  CASH: "Money",
  POINTS: "Points"
};

/** The wallet a referrer role earns into: students earn points, staff earn money. */
export function referralWalletForRole(role: string): ReferralWallet {
  return role === "STUDENT" ? "POINTS" : "CASH";
}

/** Roles that may withdraw money (students never do: they earn points). */
export const REFERRAL_PAYOUT_ROLES = ["COACH", "SALES"] as const;
export const referralPayoutRoleSchema = z.enum(REFERRAL_PAYOUT_ROLES);
export type ReferralPayoutRole = z.infer<typeof referralPayoutRoleSchema>;

// ── Earning: stage values ──

/**
 * What the referrer earns when one referral reaches `stage`: points for a
 * student, money for a coach or SALES. Null when the stage pays them nothing.
 */
export function referrerStageReward(
  stage: Pick<ReferralStageValues, "studentPoints" | "coachCashMinor" | "salesCashMinor">,
  role: string
): { wallet: ReferralWallet; amount: number } | null {
  const amount = role === "STUDENT" ? stage.studentPoints : role === "COACH" ? stage.coachCashMinor : role === "SALES" ? stage.salesCashMinor : 0;
  return amount > 0 ? { amount, wallet: referralWalletForRole(role) } : null;
}

const stageValueSchema = (max: number) => z.number().int().min(0, "Cannot be negative.").max(max);

/** Admin edit of a stage's values. Money in minor units. */
export const referralStageValuesSchema = z.object({
  studentPoints: stageValueSchema(10_000_000),
  coachCashMinor: stageValueSchema(100_000_000),
  salesCashMinor: stageValueSchema(100_000_000),
  newMemberPoints: stageValueSchema(10_000_000)
});

// ── Earning: milestone bonuses ──

/** Who a bonus is for. Students get points; the others get money. */
export const REFERRAL_BONUS_AUDIENCES = ["STUDENTS", "COACHES", "SALES", "STAFF"] as const;
export const referralBonusAudienceSchema = z.enum(REFERRAL_BONUS_AUDIENCES);
export type ReferralBonusAudience = z.infer<typeof referralBonusAudienceSchema>;

export const REFERRAL_BONUS_AUDIENCE_LABELS: Record<ReferralBonusAudience, string> = {
  COACHES: "Coaches (money)",
  SALES: "Sales staff (money)",
  STAFF: "Coaches and sales staff (money)",
  STUDENTS: "Students (points)"
};

/** The roles a bonus audience covers, and the wallet it pays into. */
export function referralBonusAudienceTarget(audience: ReferralBonusAudience): { roles: ReferrerRole[]; wallet: ReferralWallet } {
  switch (audience) {
    case "STUDENTS":
      return { roles: ["STUDENT"], wallet: "POINTS" };
    case "COACHES":
      return { roles: ["COACH"], wallet: "CASH" };
    case "SALES":
      return { roles: ["SALES"], wallet: "CASH" };
    case "STAFF":
      return { roles: ["COACH", "SALES"], wallet: "CASH" };
  }
}

/** The audience a stored rule's roles + unit describe, or null for a legacy shape. */
export function referralBonusAudienceOf(roles: readonly string[], unit: string): ReferralBonusAudience | null {
  const set = [...new Set(roles)].sort().join(",");
  if (unit === "POINTS") return set === "STUDENT" ? "STUDENTS" : null;
  if (unit !== "CASH") return null;
  if (set === "COACH") return "COACHES";
  if (set === "SALES") return "SALES";
  if (set === "COACH,SALES") return "STAFF";
  return null;
}

/**
 * The milestone multiples a referrer has earned for `count` referrals at a
 * stage with a bonus every `everyCount`: 7 with every 3 → [3, 6].
 */
export function referralMilestonesReached(count: number, everyCount: number): number[] {
  if (!Number.isInteger(everyCount) || everyCount < 1 || count < everyCount) return [];
  const reached: number[] = [];
  for (let n = everyCount; n <= count; n += everyCount) reached.push(n);
  return reached;
}

export type ReferralBonusRuleItem = {
  id: string;
  name: string;
  description: string | null;
  stageId: string;
  stageName: string;
  /** Paid each time the referrer's count at the stage reaches a multiple of this. */
  everyCount: number;
  audience: ReferralBonusAudience;
  /** Points (STUDENTS) or minor units (the others). */
  amount: number;
  currency: string;
  autoApprove: boolean;
  isActive: boolean;
  rewardCount: number;
  createdAt: string;
};

const bonusRuleBaseSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  description: z.string().trim().max(500).optional().nullable(),
  stageId: z.string().min(1, "Pick a stage."),
  everyCount: z.number().int().min(2, "A milestone is at least 2 referrals.").max(1000),
  audience: referralBonusAudienceSchema,
  /** Points for students; minor units (₹500 = 50000) for the others. */
  amount: z.number().int().min(1, "Amount must be more than zero.").max(100_000_000),
  autoApprove: z.boolean(),
  isActive: z.boolean()
});

export const createReferralBonusRuleRequestSchema = bonusRuleBaseSchema;
export type CreateReferralBonusRuleRequest = z.infer<typeof createReferralBonusRuleRequestSchema>;

export const updateReferralBonusRuleRequestSchema = bonusRuleBaseSchema.partial();
export type UpdateReferralBonusRuleRequest = z.infer<typeof updateReferralBonusRuleRequestSchema>;

// ── Rewards (what was earned) ──

export const referralRewardStatusSchema = z.enum(["PENDING", "CREDITED", "CANCELLED"]);
export type ReferralRewardStatus = z.infer<typeof referralRewardStatusSchema>;

/** CASH = money; POINTS = points. DISCOUNT_PERCENT only on rewards issued before the rebuild. */
export const referralRewardUnitSchema = z.enum(["CASH", "POINTS", "DISCOUNT_PERCENT"]);
export type ReferralRewardUnit = z.infer<typeof referralRewardUnitSchema>;

/** REFERRER = the person who shared the link; REFERRED = the new person who joined through it. */
export const referralBeneficiarySchema = z.enum(["REFERRER", "REFERRED"]);
export type ReferralBeneficiary = z.infer<typeof referralBeneficiarySchema>;

export const REFERRAL_BENEFICIARY_LABELS: Record<ReferralBeneficiary, string> = {
  REFERRED: "New member",
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

export type ReferralRewardItem = {
  id: string;
  /** What earned it: a stage value or a bonus rule name. */
  sourceName: string;
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
  status: ReferralRewardStatus;
  description: string;
  createdAt: string;
  creditedAt: string | null;
};

export const cancelReferralRewardRequestSchema = z.object({
  reason: z.string().trim().max(500).optional()
});
export type CancelReferralRewardRequest = z.infer<typeof cancelReferralRewardRequestSchema>;

// ── Ledger (points and money history) ──

export const referralCreditEntryTypeSchema = z.enum([
  "REWARD",
  "REWARD_REVERSAL",
  "WITHDRAWAL",
  "WITHDRAWAL_REVERSAL",
  "REDEMPTION",
  "REDEMPTION_REVERSAL",
  "ADJUSTMENT",
  "EXPIRY",
  // Retired in the rebuild; old rows still show.
  "PAYMENT_CODE",
  "PAYMENT_CODE_REVERSAL",
  "POINTS_TRANSFER_OUT",
  "POINTS_TRANSFER_IN",
  "CONVERSION_OUT",
  "CONVERSION_IN"
]);
export type ReferralCreditEntryType = z.infer<typeof referralCreditEntryTypeSchema>;

export const REFERRAL_CREDIT_ENTRY_LABELS: Record<ReferralCreditEntryType, string> = {
  ADJUSTMENT: "Adjustment",
  CONVERSION_IN: "Converted from points",
  CONVERSION_OUT: "Converted to money",
  EXPIRY: "Points expired",
  PAYMENT_CODE: "Payment code",
  PAYMENT_CODE_REVERSAL: "Payment code cancelled",
  POINTS_TRANSFER_IN: "Points received",
  POINTS_TRANSFER_OUT: "Points sent",
  REDEMPTION: "Voucher redeemed",
  REDEMPTION_REVERSAL: "Points returned",
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
  createdAt: string;
};

/** Admin ledger row: every movement of every user. */
export type AdminReferralLedgerItem = ReferralCreditEntryItem & {
  userId: string;
  userName: string;
  userEmail: string;
  userRole: string;
  createdByName: string | null;
};

export function formatReferralWalletAmount(amount: number, wallet: ReferralWallet, currency: string): string {
  return wallet === "POINTS" ? formatReferralPoints(amount) : formatMoney(amount, currency);
}

export const adjustReferralCreditsRequestSchema = z.object({
  userId: z.string().min(1),
  wallet: referralWalletSchema.default("POINTS"),
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

// ── Withdrawals (coaches and SALES) ──

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

// ── Vouchers (students spend points) ──

export const REFERRAL_VOUCHER_TYPES = ["PERCENT_DISCOUNT", "FIXED_DISCOUNT", "FREE_DAYS"] as const;
export const referralVoucherTypeSchema = z.enum(REFERRAL_VOUCHER_TYPES);
export type ReferralVoucherType = z.infer<typeof referralVoucherTypeSchema>;

export const REFERRAL_VOUCHER_TYPE_LABELS: Record<ReferralVoucherType, string> = {
  FIXED_DISCOUNT: "Fixed amount off",
  FREE_DAYS: "Free days of access",
  PERCENT_DISCOUNT: "Percentage off"
};

/** The terms a voucher (and the redemption that snapshots it) carries. */
export type ReferralVoucherTerms = {
  type: ReferralVoucherType;
  percentOff: number | null;
  amountOffMinor: number | null;
  maxDiscountMinor: number | null;
  minOrderMinor: number | null;
  freeDays: number | null;
};

/** "20% off (up to ₹500) on fees of ₹1,000 or more", "₹500 off", "30 days free". */
export function formatReferralVoucherValue(terms: ReferralVoucherTerms, currency: string): string {
  if (terms.type === "FREE_DAYS") {
    const days = terms.freeDays ?? 0;
    if (days > 0 && days % 30 === 0) return `${days / 30 === 1 ? "1 month" : `${days / 30} months`} free`;
    if (days > 0 && days % 7 === 0) return `${days / 7 === 1 ? "1 week" : `${days / 7} weeks`} free`;
    return `${days} ${days === 1 ? "day" : "days"} free`;
  }
  const base =
    terms.type === "PERCENT_DISCOUNT"
      ? `${terms.percentOff ?? 0}% off${terms.maxDiscountMinor ? ` (up to ${formatMoney(terms.maxDiscountMinor, currency)})` : ""}`
      : `${formatMoney(terms.amountOffMinor ?? 0, currency)} off`;
  return terms.minOrderMinor ? `${base} on fees of ${formatMoney(terms.minOrderMinor, currency)} or more` : base;
}

const voucherBaseSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  description: z.string().trim().max(1000).optional().nullable(),
  type: referralVoucherTypeSchema,
  pointsCost: z.number().int().min(1, "Costs at least 1 point.").max(10_000_000),
  percentOff: z.number().int().min(1, "At least 1%.").max(100, "At most 100%.").optional().nullable(),
  amountOffMinor: z.number().int().min(1, "More than zero.").max(100_000_000).optional().nullable(),
  maxDiscountMinor: z.number().int().min(1, "More than zero.").max(100_000_000).optional().nullable(),
  minOrderMinor: z.number().int().min(1, "More than zero.").max(100_000_000).optional().nullable(),
  freeDays: z.number().int().min(1, "At least 1 day.").max(366, "At most 366 days.").optional().nullable(),
  planIds: z.array(z.string().min(1)).max(50).default([]),
  codeValidDays: z.number().int().min(1).max(3650).optional().nullable(),
  requiresApproval: z.boolean().default(false),
  stock: z.number().int().min(1).max(1_000_000).optional().nullable(),
  perUserLimit: z.number().int().min(1).max(1000).optional().nullable(),
  startsAt: z.string().datetime().optional().nullable(),
  endsAt: z.string().datetime().optional().nullable(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10_000).default(0)
});

/**
 * The one shape rule for a voucher, as a message or null: each type needs its
 * value; a fixed discount is not capped; the minimum fee is for discounts; a
 * percent cap and a minimum fee must leave something to take off; the window
 * must end after it starts.
 */
export function referralVoucherProblem(voucher: {
  type: ReferralVoucherType;
  percentOff?: number | null;
  amountOffMinor?: number | null;
  maxDiscountMinor?: number | null;
  minOrderMinor?: number | null;
  freeDays?: number | null;
  startsAt?: string | null;
  endsAt?: string | null;
}): { message: string; path: string } | null {
  if (voucher.type === "PERCENT_DISCOUNT" && !voucher.percentOff) return { message: "Set the percentage off.", path: "percentOff" };
  if (voucher.type === "FIXED_DISCOUNT" && !voucher.amountOffMinor) return { message: "Set the amount off.", path: "amountOffMinor" };
  if (voucher.type === "FREE_DAYS" && !voucher.freeDays) return { message: "Set how many free days.", path: "freeDays" };
  if (voucher.type !== "PERCENT_DISCOUNT" && voucher.maxDiscountMinor) {
    return { message: "Only a percentage discount has a maximum.", path: "maxDiscountMinor" };
  }
  if (voucher.type === "FREE_DAYS" && voucher.minOrderMinor) {
    return { message: "Free days have no minimum fee.", path: "minOrderMinor" };
  }
  if (voucher.type === "FIXED_DISCOUNT" && voucher.minOrderMinor && voucher.amountOffMinor && voucher.amountOffMinor > voucher.minOrderMinor) {
    return { message: "The amount off is more than the minimum fee.", path: "amountOffMinor" };
  }
  if (voucher.startsAt && voucher.endsAt && new Date(voucher.endsAt) <= new Date(voucher.startsAt)) {
    return { message: "The end must be after the start.", path: "endsAt" };
  }
  return null;
}

export const createReferralVoucherRequestSchema = voucherBaseSchema.superRefine((voucher, ctx) => {
  const problem = referralVoucherProblem(voucher);
  if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem.message, path: [problem.path] });
});
export type CreateReferralVoucherRequest = z.input<typeof createReferralVoucherRequestSchema>;

export const updateReferralVoucherRequestSchema = voucherBaseSchema.partial();
export type UpdateReferralVoucherRequest = z.input<typeof updateReferralVoucherRequestSchema>;

/** Admin view of a voucher. */
export type ReferralVoucherItem = ReferralVoucherTerms & {
  id: string;
  name: string;
  description: string | null;
  pointsCost: number;
  planIds: string[];
  planNames: string[];
  codeValidDays: number | null;
  requiresApproval: boolean;
  stock: number | null;
  perUserLimit: number | null;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  sortOrder: number;
  /** Redemptions that count against stock (pending + fulfilled). */
  redeemedCount: number;
  pendingCount: number;
  currency: string;
  createdAt: string;
};

/** A voucher as the student sees it in the rewards store. */
export type MyReferralVoucherItem = ReferralVoucherTerms & {
  id: string;
  name: string;
  description: string | null;
  pointsCost: number;
  planNames: string[];
  /** The plans a FREE_DAYS voucher may extend (empty = any plan the student holds). */
  planIds: string[];
  codeValidDays: number | null;
  requiresApproval: boolean;
  endsAt: string | null;
  /** Left across everyone; null = unlimited. */
  remaining: number | null;
  perUserLimit: number | null;
  /** This student's pending + fulfilled redemptions of it. */
  redeemedByMe: number;
  /** Why it cannot be redeemed right now (null = it can, points permitting). */
  unavailableReason: string | null;
};

export type MyReferralVoucherCatalogue = {
  /** False for non-students, or when the academy switched redeeming off. */
  canRedeem: boolean;
  pointsBalance: number;
  currency: string;
  vouchers: MyReferralVoucherItem[];
  /** The student's current time-limited access, for picking which plan free days extend. */
  plans: { planId: string; planName: string; endsAt: string }[];
};

export const redeemReferralVoucherRequestSchema = z.object({
  /** FREE_DAYS: which plan to extend (needed only when it is ambiguous). */
  planId: z.string().min(1).optional()
});
export type RedeemReferralVoucherRequest = z.infer<typeof redeemReferralVoucherRequestSchema>;

export const REFERRAL_REDEMPTION_STATUSES = ["PENDING", "FULFILLED", "REJECTED", "CANCELLED", "REVOKED"] as const;
export const referralRedemptionStatusSchema = z.enum(REFERRAL_REDEMPTION_STATUSES);
export type ReferralRedemptionStatus = z.infer<typeof referralRedemptionStatusSchema>;

export type ReferralRedemptionItem = ReferralVoucherTerms & {
  id: string;
  voucherId: string;
  voucherName: string;
  userId: string;
  userName: string;
  userEmail: string;
  pointsCost: number;
  currency: string;
  status: ReferralRedemptionStatus;
  /** Discounts, once fulfilled: the personal code and whether it is still usable. */
  discountCode: string | null;
  discountStatus: "ACTIVE" | "USED" | "CANCELLED" | "EXPIRED" | null;
  codeEndsAt: string | null;
  /** FREE_DAYS: the plan and the access end date after the extension. */
  planName: string | null;
  accessEndsAt: string | null;
  adminNote: string | null;
  createdAt: string;
  fulfilledAt: string | null;
};

export const rejectReferralRedemptionRequestSchema = z.object({
  adminNote: z.string().trim().min(1, "Say why.").max(500)
});
export type RejectReferralRedemptionRequest = z.infer<typeof rejectReferralRedemptionRequestSchema>;

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
  /** Signed up: the new member's account is linked (their points go there). */
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

/** Points a new member gets when their referral reaches a stage. */
export type ReferralBenefitItem = {
  stageId: string;
  stageName: string;
  points: number;
};

// ── Stage admin ──

export const createReferralStageRequestSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required.").max(60),
    description: z.string().trim().max(300).optional().nullable(),
    tone: referralStageToneSchema
  })
  .merge(referralStageValuesSchema.partial());
export type CreateReferralStageRequest = z.infer<typeof createReferralStageRequestSchema>;

export const updateReferralStageRequestSchema = createReferralStageRequestSchema.partial();
export type UpdateReferralStageRequest = z.infer<typeof updateReferralStageRequestSchema>;

export const reorderReferralStagesRequestSchema = z.object({
  stageIds: z.array(z.string().min(1)).min(1).max(50)
});
export type ReorderReferralStagesRequest = z.infer<typeof reorderReferralStagesRequestSchema>;

// ── Points expiry ──

export const REFERRAL_POINTS_EXPIRY_MIN_DAYS = 30;
/** The board warns about points that expire within this many days. */
export const REFERRAL_POINTS_EXPIRY_WARNING_DAYS = 30;

/**
 * How many points of one wallet have expired by `cutoff` (docs/REFERRALS.md § "Points expiry").
 * Spending always uses the oldest points first, so everything ever taken out (vouchers,
 * cancelled rewards, earlier expiries) counts against the credits older than the cutoff;
 * what is left of those is expired. Points given back (a rejected voucher) count as earned
 * on the day they came back. Never negative.
 */
export function referralPointsExpired(
  entries: readonly { amountMinor: number; createdAt: Date | string }[],
  cutoff: Date
): number {
  let oldCredits = 0;
  let debits = 0;
  for (const entry of entries) {
    if (entry.amountMinor < 0) debits -= entry.amountMinor;
    else if (new Date(entry.createdAt).getTime() < cutoff.getTime()) oldCredits += entry.amountMinor;
  }
  return Math.max(0, oldCredits - debits);
}

// ── Settings ──

export type ReferralSettingsItem = {
  enabled: boolean;
  referrerRoles: ReferrerRole[];
  attributionDays: number;
  currency: string;
  /** Coaches and/or SALES; students never withdraw. */
  withdrawalRoles: ReferralPayoutRole[];
  minWithdrawalMinor: number;
  programTerms: string | null;
  /** Stage-value rewards in points are credited at once. */
  autoApprovePoints: boolean;
  /** Stage-value rewards in money are credited at once (off = an admin approves each). */
  autoApproveCash: boolean;
  redemptionsEnabled: boolean;
  /** Per student, rolling 30 days; 0 = no limit. */
  maxRedemptionsPer30Days: number;
  /** Unspent points expire this many days after they were earned; null = never. */
  pointsExpiryDays: number | null;
};

export const updateReferralSettingsRequestSchema = z.object({
  enabled: z.boolean().optional(),
  referrerRoles: z.array(referrerRoleSchema).max(REFERRER_ROLES.length).optional(),
  attributionDays: z.number().int().min(1).max(365).optional(),
  withdrawalRoles: z.array(referralPayoutRoleSchema).max(REFERRAL_PAYOUT_ROLES.length).optional(),
  minWithdrawalMinor: z.number().int().min(0).max(100_000_000).optional(),
  programTerms: z.string().trim().max(4000).optional().nullable(),
  autoApprovePoints: z.boolean().optional(),
  autoApproveCash: z.boolean().optional(),
  redemptionsEnabled: z.boolean().optional(),
  maxRedemptionsPer30Days: z.number().int().min(0).max(1000).optional(),
  pointsExpiryDays: z
    .number()
    .int()
    .min(REFERRAL_POINTS_EXPIRY_MIN_DAYS, `Use at least ${REFERRAL_POINTS_EXPIRY_MIN_DAYS} days, or leave it empty for no expiry.`)
    .max(3650)
    .nullable()
    .optional()
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
  /** The wallet this role earns into: POINTS for students, CASH for coaches and SALES. */
  wallet: ReferralWallet;
  currency: string;
  stages: (ReferralStageItem & { reached: number })[];
  totals: {
    referrals: number;
    visits: number;
    converted: number;
  };
  points: {
    balance: number;
    /** Rewards awaiting an admin. */
    pending: number;
    earned: number;
    /** Spent on vouchers (fulfilled or waiting for approval). */
    redeemed: number;
    /** Points that expire within `REFERRAL_POINTS_EXPIRY_WARNING_DAYS` if not spent; 0 when expiry is off. */
    expiringSoon: number;
    /** Days points last (the academy's setting); null = they never expire. */
    expiryDays: number | null;
  };
  /** Coaches and SALES only (null for students). */
  money: {
    balanceMinor: number;
    pendingMinor: number;
    earnedMinor: number;
  } | null;
  canWithdraw: boolean;
  minWithdrawalMinor: number;
  /** Students: the rewards store is open. */
  canRedeem: boolean;
  programTerms: string | null;
  /** Per stage: what this referrer earns and what their friend gets. */
  earnings: { stageId: string; stageName: string; referrer: number; friendPoints: number }[];
  /** Active milestone bonuses for this role. */
  bonuses: { id: string; name: string; description: string | null; stageName: string; everyCount: number; amount: number }[];
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
  pointsEarned: number;
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
    /** Voucher redemptions waiting for an admin. */
    pendingRedemptions: number;
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

import { z } from "zod";

// Referral program (docs/REFERRALS.md). Students, coaches and SALES accounts
// share a link (`/r/<code>`); every person who opens it is tracked through an
// admin-editable pipeline, and admin-defined rules turn progress into rewards
// that land in a credits wallet (withdraw, or pay fees with a personal code).

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
  amountMinor: number;
  currency: string;
  /** Empty = every referrer role. */
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
  /** Integer minor units (₹500 = 50000). */
  amountMinor: z.number().int().min(1, "Amount must be more than zero.").max(100_000_000),
  roles: z.array(referrerRoleSchema).max(REFERRER_ROLES.length),
  autoApprove: z.boolean(),
  isActive: z.boolean()
});

export const createReferralRewardRuleRequestSchema = rewardRuleBaseSchema.refine(
  (rule) => rule.kind !== "MILESTONE" || (rule.milestoneCount ?? 0) >= 2,
  { message: "Set how many referrals make a milestone.", path: ["milestoneCount"] }
);
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
  amountMinor: number;
  currency: string;
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
  "ADJUSTMENT"
]);
export type ReferralCreditEntryType = z.infer<typeof referralCreditEntryTypeSchema>;

export const REFERRAL_CREDIT_ENTRY_LABELS: Record<ReferralCreditEntryType, string> = {
  ADJUSTMENT: "Adjustment",
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
  /** Signed minor units. */
  amountMinor: number;
  currency: string;
  note: string | null;
  createdAt: string;
};

export const adjustReferralCreditsRequestSchema = z.object({
  userId: z.string().min(1),
  /** Signed minor units; never zero. */
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
  amountMinor: number;
  currency: string;
  /** ACTIVE = unused; USED = applied to a paid order; CANCELLED = credits returned. */
  status: "ACTIVE" | "USED" | "CANCELLED";
  createdAt: string;
};

export const createReferralPaymentCodeRequestSchema = z.object({
  amountMinor: z.number().int().min(1, "Enter an amount.")
});
export type CreateReferralPaymentCodeRequest = z.infer<typeof createReferralPaymentCodeRequestSchema>;

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
};

export type AdminReferralItem = ReferralItem & {
  referrerId: string;
  referrerName: string;
  referrerRole: ReferrerRole;
  code: string;
  leadId: string | null;
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
};

export const updateReferralSettingsRequestSchema = z.object({
  enabled: z.boolean().optional(),
  referrerRoles: z.array(referrerRoleSchema).max(REFERRER_ROLES.length).optional(),
  attributionDays: z.number().int().min(1).max(365).optional(),
  withdrawalRoles: z.array(referrerRoleSchema).max(REFERRER_ROLES.length).optional(),
  minWithdrawalMinor: z.number().int().min(0).max(100_000_000).optional(),
  paymentUseRoles: z.array(referrerRoleSchema).max(REFERRER_ROLES.length).optional(),
  programTerms: z.string().trim().max(4000).optional().nullable()
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
    balanceMinor: number;
    pendingRewardsMinor: number;
    earnedMinor: number;
    currency: string;
  };
  canWithdraw: boolean;
  canPayFees: boolean;
  minWithdrawalMinor: number;
  programTerms: string | null;
  /** Active rules this referrer can earn from, for "how you earn". */
  rules: Pick<ReferralRewardRuleItem, "id" | "name" | "description" | "stageName" | "kind" | "milestoneCount" | "amountMinor" | "currency">[];
};

// ── Admin board ──

export type ReferrerStatsItem = {
  userId: string;
  name: string;
  email: string;
  role: ReferrerRole;
  code: string | null;
  codeActive: boolean;
  visits: number;
  referrals: number;
  converted: number;
  balanceMinor: number;
  earnedMinor: number;
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

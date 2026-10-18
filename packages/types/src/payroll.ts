import { z } from "zod";
import { partialWithoutDefaults } from "./core-schemas";

// ─────────────────────────────────────────────────────────────
// Coach payroll & payslips — shared contract.
//
// A separate financial track from ./payments + ./invoices (customer billing):
// this is what the ACADEMY owes a COACH, computed from actual teaching
// activity (CoachClass / CoachAttendance — read, never re-derived) rather
// than a checkout. Money is integer minor units throughout, exactly like
// payments — reuse toMinorUnits/toMajorUnits/formatMoney from ./payments,
// never reimplement them here.
//
// Rate/rule resolution is exposed as PURE functions (resolveEffective
// CompensationRate, resolveApplicableRules) so the server calculation and an
// admin-side "preview before you save" UI call the identical logic and can
// never drift, mirroring resolveTaxTreatment/computeTax in ./invoices.
// ─────────────────────────────────────────────────────────────

// ── Engagement & compensation model ──

export const coachEngagementTypeSchema = z.enum([
  "EMPLOYEE",
  "CONTRACTOR",
  "FREELANCER",
  "OTHER"
]);
export type CoachEngagementType = z.infer<typeof coachEngagementTypeSchema>;

export const COACH_ENGAGEMENT_TYPE_LABELS: Record<CoachEngagementType, string> = {
  EMPLOYEE: "Employee",
  CONTRACTOR: "Contractor",
  FREELANCER: "Freelancer",
  OTHER: "Other"
};

/** EMPLOYEE gets a Payslip; everything else gets a Coach Payment Statement (§17). */
export function documentKindForEngagement(
  engagementType: CoachEngagementType
): PayslipDocumentKind {
  return engagementType === "EMPLOYEE" ? "PAYSLIP" : "PAYMENT_STATEMENT";
}

export const coachCompensationModelSchema = z.enum([
  "HOURLY",
  "PER_CLASS",
  "FIXED_SALARY",
  "HOURLY_PLUS_CLASS",
  "TIERED",
  "PERCENTAGE",
  "HYBRID"
]);
export type CoachCompensationModel = z.infer<typeof coachCompensationModelSchema>;

export const COACH_COMPENSATION_MODEL_LABELS: Record<CoachCompensationModel, string> = {
  HOURLY: "Hourly",
  PER_CLASS: "Per class",
  FIXED_SALARY: "Fixed monthly salary",
  HOURLY_PLUS_CLASS: "Hourly + per-class",
  TIERED: "Tiered hourly",
  PERCENTAGE: "Percentage of revenue",
  HYBRID: "Hybrid (base + incentives)"
};

export const compensationCalculationTypeSchema = z.enum([
  "HOURLY_RATE",
  "PER_CLASS_RATE",
  "MONTHLY_SALARY",
  "TIER",
  "PERCENTAGE"
]);
export type CompensationCalculationType = z.infer<
  typeof compensationCalculationTypeSchema
>;

// ── Effective-dated rate scoping & tiers ──

export const compensationRateScopeSchema = z.object({
  classTypes: z.array(z.string()).optional(),
  studentLevels: z.array(z.string()).optional(),
  batchIds: z.array(z.string()).optional()
});
export type CompensationRateScope = z.infer<typeof compensationRateScopeSchema>;

export const compensationTierSchema = z.object({
  /** Inclusive upper bound of hours for this tier; omitted = open-ended (last tier). */
  uptoHours: z.number().positive().optional(),
  rateMinor: z.number().int().nonnegative()
});
export type CompensationTier = z.infer<typeof compensationTierSchema>;

export const compensationTierConfigSchema = z.array(compensationTierSchema);
export type CompensationTierConfig = z.infer<typeof compensationTierConfigSchema>;

// ── Compensation rate (effective-dated) ──

export const createCompensationRateSchema = z
  .object({
    compensationModel: coachCompensationModelSchema,
    calculationType: compensationCalculationTypeSchema,
    rateMinor: z.number().int().nonnegative().optional(),
    percentageBps: z.number().int().min(0).max(10000).optional(),
    tierConfig: compensationTierConfigSchema.optional(),
    scopeConfig: compensationRateScopeSchema.optional(),
    effectiveFrom: z.string().datetime(),
    effectiveTo: z.string().datetime().optional()
  })
  .refine(
    (v) =>
      (v.calculationType !== "TIER" || (v.tierConfig?.length ?? 0) > 0) &&
      (v.calculationType !== "PERCENTAGE" || v.percentageBps !== undefined) &&
      (!["HOURLY_RATE", "PER_CLASS_RATE", "MONTHLY_SALARY"].includes(v.calculationType) ||
        v.rateMinor !== undefined),
    { message: "rateMinor/percentageBps/tierConfig must match calculationType" }
  );
export type CreateCompensationRateRequest = z.infer<
  typeof createCompensationRateSchema
>;

export const closeCompensationRateSchema = z.object({
  effectiveTo: z.string().datetime()
});
export type CloseCompensationRateRequest = z.infer<typeof closeCompensationRateSchema>;

export type CompensationRateItem = {
  id: string;
  coachId: string;
  compensationModel: CoachCompensationModel;
  calculationType: CompensationCalculationType;
  rateMinor: number | null;
  percentageBps: number | null;
  tierConfig: CompensationTierConfig | null;
  scopeConfig: CompensationRateScope | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
};

// ── Compensation profile ──

export const updateCompensationProfileSchema = z.object({
  engagementType: coachEngagementTypeSchema.optional(),
  defaultCompensationModel: coachCompensationModelSchema.optional(),
  currency: z.string().length(3).optional(),
  paymentMethod: z.string().max(100).optional(),
  paymentDetails: z.record(z.string(), z.unknown()).optional(),
  panNumber: z.string().max(20).optional(),
  gstin: z.string().max(20).optional(),
  notes: z.string().max(2000).optional()
});
export type UpdateCompensationProfileRequest = z.infer<
  typeof updateCompensationProfileSchema
>;

/**
 * Admin-facing shape. `paymentDetails` is present here only because this type
 * is the admin response — a coach's OWN view of their profile must never
 * include it (payroll-auth.helper.ts enforces this server-side, not this type).
 */
export type CompensationProfileItem = {
  id: string;
  coachId: string;
  coachName: string;
  coachEmail: string;
  engagementType: CoachEngagementType;
  defaultCompensationModel: CoachCompensationModel;
  currency: string;
  paymentMethod: string | null;
  paymentDetails: Record<string, unknown> | null;
  panNumber: string | null;
  gstin: string | null;
  taxTreatment: string | null;
  notes: string | null;
  rates: CompensationRateItem[];
  createdAt: string;
  updatedAt: string;
};

/**
 * Resolves a coach's currently-effective compensation rate at a point in
 * time, optionally narrowed by class/student/batch scope. Pure — no DB
 * access — so the server engine and an admin "preview" UI never drift.
 *
 * Tie-break: the most specifically-scoped candidate wins; among equally
 * specific candidates, the most recently effective one wins.
 */
export function resolveEffectiveCompensationRate<
  T extends {
    effectiveFrom: string | Date;
    effectiveTo?: string | Date | null;
    scopeConfig?: CompensationRateScope | null;
  }
>(
  rates: T[],
  atDate: string | Date,
  context: { classType?: string; studentLevel?: string; batchId?: string } = {}
): T | null {
  const at = new Date(atDate).getTime();

  const candidates = rates.filter((rate) => {
    const from = new Date(rate.effectiveFrom).getTime();
    const to = rate.effectiveTo ? new Date(rate.effectiveTo).getTime() : null;
    if (at < from) return false;
    if (to !== null && at >= to) return false;
    return scopeMatches(rate.scopeConfig ?? null, context);
  });
  if (candidates.length === 0) return null;

  return candidates.sort((a, b) => {
    const specificityDiff =
      scopeSpecificity(b.scopeConfig ?? null) - scopeSpecificity(a.scopeConfig ?? null);
    if (specificityDiff !== 0) return specificityDiff;
    return new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime();
  })[0];
}

function scopeMatches(
  scope: CompensationRateScope | null,
  context: { classType?: string; studentLevel?: string; batchId?: string }
): boolean {
  if (!scope) return true;
  if (scope.classTypes?.length && context.classType && !scope.classTypes.includes(context.classType)) {
    return false;
  }
  if (
    scope.studentLevels?.length &&
    context.studentLevel &&
    !scope.studentLevels.includes(context.studentLevel)
  ) {
    return false;
  }
  if (scope.batchIds?.length && context.batchId && !scope.batchIds.includes(context.batchId)) {
    return false;
  }
  return true;
}

function scopeSpecificity(scope: CompensationRateScope | null): number {
  if (!scope) return 0;
  return (
    (scope.classTypes?.length ? 1 : 0) +
    (scope.studentLevels?.length ? 1 : 0) +
    (scope.batchIds?.length ? 1 : 0)
  );
}

// ── Payroll rules (cancellation / attendance / bonus / deduction) ──

export const payrollRuleTypeSchema = z.enum([
  "CANCELLATION",
  "ATTENDANCE",
  "BONUS",
  "DEDUCTION"
]);
export type PayrollRuleType = z.infer<typeof payrollRuleTypeSchema>;

export const PAYROLL_RULE_TYPE_LABELS: Record<PayrollRuleType, string> = {
  CANCELLATION: "Cancellation",
  ATTENDANCE: "Attendance",
  BONUS: "Bonus",
  DEDUCTION: "Deduction"
};

/** Who cancelled the class, matching CoachClass.cancelledById's resolved role. */
export const cancelledByActorSchema = z.enum(["COACH", "STUDENT", "ADMIN", "PLATFORM"]);
export type CancelledByActor = z.infer<typeof cancelledByActorSchema>;

export const payrollRuleConditionSchema = z.object({
  cancelledBy: cancelledByActorSchema.optional(),
  noticeHoursLessThan: z.number().nonnegative().optional(),
  noticeHoursAtLeast: z.number().nonnegative().optional(),
  minTeachingHours: z.number().nonnegative().optional(),
  classType: z.string().optional()
});
export type PayrollRuleCondition = z.infer<typeof payrollRuleConditionSchema>;

export const payrollRuleEffectSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("PAYOUT_PERCENT"), percent: z.number().min(0).max(100) }),
  z.object({ kind: z.literal("FLAT_AMOUNT"), amountMinor: z.number().int() })
]);
export type PayrollRuleEffect = z.infer<typeof payrollRuleEffectSchema>;

export const createPayrollRuleSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  ruleType: payrollRuleTypeSchema,
  condition: payrollRuleConditionSchema,
  effect: payrollRuleEffectSchema,
  priority: z.number().int().default(0),
  enabled: z.boolean().default(true),
  effectiveFrom: z.string().datetime(),
  effectiveTo: z.string().datetime().optional()
});
export type CreatePayrollRuleRequest = z.infer<typeof createPayrollRuleSchema>;

export const updatePayrollRuleSchema = partialWithoutDefaults(createPayrollRuleSchema);
export type UpdatePayrollRuleRequest = z.infer<typeof updatePayrollRuleSchema>;

export type PayrollRuleItem = {
  id: string;
  name: string;
  description: string | null;
  ruleType: PayrollRuleType;
  condition: PayrollRuleCondition;
  effect: PayrollRuleEffect;
  priority: number;
  enabled: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Resolves which rules of (optionally) a given type are in force at a point
 * in time, sorted highest-priority first. Pure, mirrors
 * {@link resolveEffectiveCompensationRate}.
 */
export function resolveApplicableRules<
  T extends {
    ruleType: PayrollRuleType;
    enabled: boolean;
    priority: number;
    effectiveFrom: string | Date;
    effectiveTo?: string | Date | null;
  }
>(rules: T[], atDate: string | Date, ruleType?: PayrollRuleType): T[] {
  const at = new Date(atDate).getTime();
  return rules
    .filter((rule) => {
      if (!rule.enabled) return false;
      if (ruleType && rule.ruleType !== ruleType) return false;
      const from = new Date(rule.effectiveFrom).getTime();
      const to = rule.effectiveTo ? new Date(rule.effectiveTo).getTime() : null;
      if (at < from) return false;
      if (to !== null && at >= to) return false;
      return true;
    })
    .sort((a, b) => b.priority - a.priority);
}

// ── Payroll period lifecycle ──

export const payrollPeriodTypeSchema = z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY", "CUSTOM"]);
export type PayrollPeriodType = z.infer<typeof payrollPeriodTypeSchema>;

export const PAYROLL_PERIOD_TYPE_LABELS: Record<PayrollPeriodType, string> = {
  WEEKLY: "Weekly",
  BIWEEKLY: "Bi-weekly",
  MONTHLY: "Monthly",
  CUSTOM: "Custom range"
};

export const payrollPeriodStatusSchema = z.enum([
  "DRAFT",
  "CALCULATING",
  "REVIEW",
  "APPROVED",
  "FINALIZED",
  "PAID",
  "CANCELLED"
]);
export type PayrollPeriodStatus = z.infer<typeof payrollPeriodStatusSchema>;

export const PAYROLL_PERIOD_STATUS_LABELS: Record<PayrollPeriodStatus, string> = {
  DRAFT: "Draft",
  CALCULATING: "Calculating",
  REVIEW: "In review",
  APPROVED: "Approved",
  FINALIZED: "Finalized",
  PAID: "Paid",
  CANCELLED: "Cancelled"
};

/** Statuses at/after which a period's records are immutable (§31). */
export const LOCKED_PAYROLL_PERIOD_STATUSES: readonly PayrollPeriodStatus[] = [
  "FINALIZED",
  "PAID"
];

export const createPayrollPeriodSchema = z.object({
  periodType: payrollPeriodTypeSchema,
  startDate: z.string().date(),
  endDate: z.string().date(),
  notes: z.string().max(2000).optional()
});
export type CreatePayrollPeriodRequest = z.infer<typeof createPayrollPeriodSchema>;

export const cancelPayrollPeriodSchema = z.object({
  reason: z.string().max(1000).optional()
});
export type CancelPayrollPeriodRequest = z.infer<typeof cancelPayrollPeriodSchema>;

export type PayrollPeriodItem = {
  id: string;
  periodType: PayrollPeriodType;
  startDate: string;
  endDate: string;
  status: PayrollPeriodStatus;
  createdById: string | null;
  calculatedAt: string | null;
  approvedById: string | null;
  approvedAt: string | null;
  finalizedById: string | null;
  finalizedAt: string | null;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

// ── Coach payroll record (one per coach per period) ──

export const coachPayrollRecordStatusSchema = z.enum([
  "PENDING",
  "CALCULATED",
  "REVIEWED",
  "APPROVED",
  "FINALIZED",
  "PAID"
]);
export type CoachPayrollRecordStatus = z.infer<typeof coachPayrollRecordStatusSchema>;

export const COACH_PAYROLL_RECORD_STATUS_LABELS: Record<CoachPayrollRecordStatus, string> = {
  PENDING: "Pending",
  CALCULATED: "Calculated",
  REVIEWED: "In review",
  APPROVED: "Approved",
  FINALIZED: "Finalized",
  PAID: "Paid"
};

export const payrollLineItemSourceSchema = z.enum(["BASE", "CLASS", "RULE", "ADJUSTMENT"]);
export type PayrollLineItemSource = z.infer<typeof payrollLineItemSourceSchema>;

export const payrollLineItemSchema = z.object({
  label: z.string(),
  quantity: z.number().optional(),
  rateMinor: z.number().int().optional(),
  amountMinor: z.number().int(),
  source: payrollLineItemSourceSchema
});
export type PayrollLineItem = z.infer<typeof payrollLineItemSchema>;

/** Versioned so a future shape change never breaks rendering an old record. */
export const payrollEarningsBreakdownSchema = z.object({
  version: z.literal(1),
  lineItems: z.array(payrollLineItemSchema)
});
export type PayrollEarningsBreakdown = z.infer<typeof payrollEarningsBreakdownSchema>;

export type TeachingSummary = {
  scheduledClassesCount: number;
  completedClassesCount: number;
  cancelledByCoachCount: number;
  cancelledByStudentCount: number;
  cancelledByAdminCount: number;
  noShowCount: number;
  totalTeachingSeconds: number;
  totalBoardSeconds: number;
};

export type CoachPayrollRecordItem = TeachingSummary & {
  id: string;
  periodId: string;
  period: {
    periodType: PayrollPeriodType;
    startDate: string;
    endDate: string;
    status: PayrollPeriodStatus;
  };
  coachId: string;
  coachName: string;
  coachEmail: string;
  status: CoachPayrollRecordStatus;
  earningsBreakdown: PayrollEarningsBreakdown | null;
  grossEarningsMinor: number;
  totalDeductionsMinor: number;
  totalAdjustmentsMinor: number;
  netPayableMinor: number;
  calculatedAt: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  finalizedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// ── Manual adjustments ──

export const payrollAdjustmentTypeSchema = z.enum(["EARNING", "DEDUCTION"]);
export type PayrollAdjustmentType = z.infer<typeof payrollAdjustmentTypeSchema>;

export const createPayrollAdjustmentSchema = z.object({
  type: payrollAdjustmentTypeSchema,
  description: z.string().min(1).max(500),
  amountMinor: z.number().int().positive(),
  reason: z.string().min(1).max(1000)
});
export type CreatePayrollAdjustmentRequest = z.infer<typeof createPayrollAdjustmentSchema>;

export const reversePayrollAdjustmentSchema = z.object({
  reversalReason: z.string().min(1).max(1000)
});
export type ReversePayrollAdjustmentRequest = z.infer<
  typeof reversePayrollAdjustmentSchema
>;

export type PayrollAdjustmentItem = {
  id: string;
  payrollRecordId: string;
  type: PayrollAdjustmentType;
  description: string;
  amountMinor: number;
  reason: string;
  createdById: string | null;
  createdAt: string;
  reversedById: string | null;
  reversedAt: string | null;
  reversalReason: string | null;
};

// ── Payout ──

export const payoutStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "PAID",
  "FAILED",
  "CANCELLED"
]);
export type PayoutStatus = z.infer<typeof payoutStatusSchema>;

export const PAYOUT_STATUS_LABELS: Record<PayoutStatus, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  PAID: "Paid",
  FAILED: "Failed",
  CANCELLED: "Cancelled"
};

export const createPayoutSchema = z.object({
  payrollRecordId: z.string().min(1)
});
export type CreatePayoutRequest = z.infer<typeof createPayoutSchema>;

export const markPayoutPaidSchema = z.object({
  reference: z.string().min(1).max(200),
  method: z.string().min(1).max(100),
  paidAt: z.string().datetime(),
  notes: z.string().max(1000).optional()
});
export type MarkPayoutPaidRequest = z.infer<typeof markPayoutPaidSchema>;

export type CoachPayoutItem = {
  id: string;
  payrollRecordId: string;
  status: PayoutStatus;
  method: string | null;
  reference: string | null;
  paidAt: string | null;
  notes: string | null;
  adminId: string | null;
  createdAt: string;
  updatedAt: string;
};

// ── Payslip document ──

export const payslipDocumentKindSchema = z.enum(["PAYSLIP", "PAYMENT_STATEMENT"]);
export type PayslipDocumentKind = z.infer<typeof payslipDocumentKindSchema>;

export const PAYSLIP_DOCUMENT_KIND_LABELS: Record<PayslipDocumentKind, string> = {
  PAYSLIP: "Payslip",
  PAYMENT_STATEMENT: "Coach Payment Statement"
};

/**
 * The PDF artifact's own state, separate from the payroll record's financial
 * status — mirrors InvoicePdfStatus (./invoices). A failed render must never
 * make a finalized/paid record look unresolved.
 */
export const payslipPdfStatusSchema = z.enum(["PENDING", "GENERATING", "READY", "FAILED"]);
export type PayslipPdfStatus = z.infer<typeof payslipPdfStatusSchema>;

export const PAYSLIP_PDF_STATUS_LABELS: Record<PayslipPdfStatus, string> = {
  PENDING: "Queued",
  GENERATING: "Generating",
  READY: "Ready",
  FAILED: "Generation failed"
};

export type PayslipItem = {
  id: string;
  documentNumber: string;
  payrollRecordId: string;
  documentKind: PayslipDocumentKind;
  engagementTypeAtIssue: CoachEngagementType;
  pdfStatus: PayslipPdfStatus;
  pdfError: string | null;
  issuedAt: string;
  createdAt: string;
};

/** "NEXA-PAY-2026-000001" — mirrors formatDocumentNumber in ./invoices. */
export function formatPayslipNumber(year: number, sequenceNumber: number): string {
  return `NEXA-PAY-${year}-${String(sequenceNumber).padStart(6, "0")}`;
}

/**
 * Everything `payslip-pdf.service.ts` needs to render one document, gathered
 * once at render time from the (already-frozen, once FINALIZED)
 * `CoachPayrollRecord` + `Payslip` + coach name + period — mirrors how
 * `InvoiceItem` (./invoices) is a fully self-contained render input.
 */
export type PayslipDocument = {
  documentNumber: string;
  documentKind: PayslipDocumentKind;
  issuedAt: string;
  period: { periodType: PayrollPeriodType; startDate: string; endDate: string };
  coach: { name: string; engagementType: CoachEngagementType };
  currency: string;
  teachingSummary: TeachingSummary;
  earningsBreakdown: PayrollEarningsBreakdown;
  grossEarningsMinor: number;
  totalDeductionsMinor: number;
  totalAdjustmentsMinor: number;
  netPayableMinor: number;
  payoutStatus: PayoutStatus | null;
  paidAt: string | null;
};

// ── List responses ──

export type PayrollPeriodListResponse = { periods: PayrollPeriodItem[] };
export type CoachPayrollRecordListResponse = { records: CoachPayrollRecordItem[] };
export type PayrollAdjustmentListResponse = { adjustments: PayrollAdjustmentItem[] };
export type PayrollRuleListResponse = { rules: PayrollRuleItem[] };
export type CoachPayoutListResponse = { payouts: CoachPayoutItem[] };
export type PayslipListResponse = { payslips: PayslipItem[] };

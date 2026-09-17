import type {
  CancelledByActor,
  CoachCompensationModel,
  CompensationTier,
  PayrollEarningsBreakdown,
  PayrollLineItem,
  PayrollRuleCondition,
  PayrollRuleEffect,
  TeachingSummary
} from "@nexa-chess/types";

/**
 * The payroll calculation engine (CLAUDE.md payroll §4).
 *
 * Pure and framework-independent by design: no Prisma import, no HTTP
 * concerns. `payroll-calculation.service.ts` is the only caller — it loads
 * rows, builds this input, and persists the output. Keeping this pure is
 * what would let an admin-side "preview before you save" UI call the exact
 * same function a future phase might expose through packages/types, and is
 * what makes the compensation-model × cancellation-rule matrix exhaustively
 * unit-testable without a database.
 */

/** One rate row already narrowed to a single calculationType by the caller. */
export type EngineRate = {
  rateMinor: number | null;
  percentageBps: number | null;
  tierConfig: CompensationTier[] | null;
};

export type EngineResolvedRates = {
  hourly?: EngineRate;
  perClass?: EngineRate;
  monthlySalary?: EngineRate;
  tier?: EngineRate;
  percentage?: EngineRate;
};

export type EngineRule = {
  id: string;
  ruleType: "CANCELLATION" | "ATTENDANCE" | "BONUS" | "DEDUCTION";
  condition: PayrollRuleCondition;
  effect: PayrollRuleEffect;
  priority: number;
};

export type EngineCancelledClass = {
  classId: string;
  /** null when the acting user's role could not be resolved. */
  cancelledBy: CancelledByActor | null;
  /** Hours between cancellation and the class's original scheduled start; null if unknown. */
  noticeHours: number | null;
  /** The class's scheduled duration — what a completed session of this kind would have earned. */
  scheduledDurationSeconds: number;
};

export type PayrollCalculationInput = {
  compensationModel: CoachCompensationModel;
  resolvedRates: EngineResolvedRates;
  teachingSummary: TeachingSummary;
  cancellationRules: EngineRule[];
  bonusRules: EngineRule[];
  deductionRules: EngineRule[];
  cancelledClasses: EngineCancelledClass[];
};

export type PayrollCalculationResult = {
  earningsBreakdown: PayrollEarningsBreakdown;
  grossEarningsMinor: number;
  totalDeductionsMinor: number;
  netPayableMinor: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const hoursOf = (seconds: number) => seconds / 3600;

function hourlyLine(rate: EngineRate, hours: number, label = "Teaching hours"): PayrollLineItem | null {
  if (rate.rateMinor === null || hours <= 0) return null;
  return {
    label,
    quantity: round2(hours),
    rateMinor: rate.rateMinor,
    amountMinor: Math.round(hours * rate.rateMinor),
    source: "CLASS"
  };
}

function perClassLine(
  rate: EngineRate,
  count: number,
  label = "Completed classes"
): PayrollLineItem | null {
  if (rate.rateMinor === null || count <= 0) return null;
  return {
    label,
    quantity: count,
    rateMinor: rate.rateMinor,
    amountMinor: rate.rateMinor * count,
    source: "CLASS"
  };
}

function salaryLine(rate: EngineRate, label = "Fixed salary"): PayrollLineItem | null {
  if (rate.rateMinor === null) return null;
  return { label, amountMinor: rate.rateMinor, source: "BASE" };
}

function tieredLines(rate: EngineRate, hours: number): PayrollLineItem[] {
  const tiers = rate.tierConfig;
  if (!tiers || tiers.length === 0 || hours <= 0) return [];

  const sorted = [...tiers].sort(
    (a, b) => (a.uptoHours ?? Number.POSITIVE_INFINITY) - (b.uptoHours ?? Number.POSITIVE_INFINITY)
  );

  const items: PayrollLineItem[] = [];
  let remaining = hours;
  let previousCap = 0;

  for (const tier of sorted) {
    if (remaining <= 0) break;
    const cap = tier.uptoHours ?? Number.POSITIVE_INFINITY;
    const tierHours = Math.max(0, Math.min(remaining, cap - previousCap));
    if (tierHours > 0) {
      items.push({
        label: `Hours ${previousCap}–${tier.uptoHours ?? "∞"}`,
        quantity: round2(tierHours),
        rateMinor: tier.rateMinor,
        amountMinor: Math.round(tierHours * tier.rateMinor),
        source: "CLASS"
      });
      remaining -= tierHours;
    }
    previousCap = cap;
  }
  return items;
}

/** Base earnings from the coach's compensation model — before rules/adjustments. */
function computeBaseEarnings(
  model: CoachCompensationModel,
  rates: EngineResolvedRates,
  teachingSummary: TeachingSummary
): PayrollLineItem[] {
  const hours = hoursOf(teachingSummary.totalTeachingSeconds);
  const items: PayrollLineItem[] = [];

  switch (model) {
    case "HOURLY": {
      const line = rates.hourly && hourlyLine(rates.hourly, hours);
      if (line) items.push(line);
      break;
    }
    case "PER_CLASS": {
      const line = rates.perClass && perClassLine(rates.perClass, teachingSummary.completedClassesCount);
      if (line) items.push(line);
      break;
    }
    case "FIXED_SALARY": {
      const line = rates.monthlySalary && salaryLine(rates.monthlySalary);
      if (line) items.push(line);
      break;
    }
    case "HOURLY_PLUS_CLASS": {
      const hourly = rates.hourly && hourlyLine(rates.hourly, hours);
      const perClass =
        rates.perClass && perClassLine(rates.perClass, teachingSummary.completedClassesCount);
      if (hourly) items.push(hourly);
      if (perClass) items.push(perClass);
      break;
    }
    case "TIERED": {
      if (rates.tier) items.push(...tieredLines(rates.tier, hours));
      break;
    }
    case "PERCENTAGE": {
      // Revenue linkage is out of scope for now (CLAUDE.md payroll "explicitly
      // out of scope"). Surface the gap rather than silently paying 0.
      items.push({
        label: "Percentage of revenue (not available — no revenue linkage yet)",
        amountMinor: 0,
        source: "BASE"
      });
      break;
    }
    case "HYBRID": {
      const salary = rates.monthlySalary && salaryLine(rates.monthlySalary, "Base salary");
      const hourly = rates.hourly && hourlyLine(rates.hourly, hours, "Teaching hours incentive");
      const perClass =
        rates.perClass &&
        perClassLine(rates.perClass, teachingSummary.completedClassesCount, "Class incentive");
      if (salary) items.push(salary);
      if (hourly) items.push(hourly);
      if (perClass) items.push(perClass);
      break;
    }
  }
  return items;
}

function ruleConditionMatchesCancellation(
  condition: PayrollRuleCondition,
  cancelled: EngineCancelledClass
): boolean {
  if (condition.cancelledBy && condition.cancelledBy !== cancelled.cancelledBy) return false;
  if (
    condition.noticeHoursLessThan !== undefined &&
    (cancelled.noticeHours === null || cancelled.noticeHours >= condition.noticeHoursLessThan)
  ) {
    return false;
  }
  if (
    condition.noticeHoursAtLeast !== undefined &&
    (cancelled.noticeHours === null || cancelled.noticeHours < condition.noticeHoursAtLeast)
  ) {
    return false;
  }
  return true;
}

function applyEffect(effect: PayrollRuleEffect, baseAmountMinor: number): number {
  return effect.kind === "PAYOUT_PERCENT"
    ? Math.round((baseAmountMinor * effect.percent) / 100)
    : effect.amountMinor;
}

/**
 * A cancelled class earns nothing by default — the first matching
 * CANCELLATION rule (rules are pre-sorted highest-priority first) decides
 * otherwise. No matching rule = ₹0, explained with a line item either way
 * (§11: never show only a final number).
 */
function computeCancellationCompensation(
  model: CoachCompensationModel,
  rates: EngineResolvedRates,
  rules: EngineRule[],
  cancelledClasses: EngineCancelledClass[]
): PayrollLineItem[] {
  return cancelledClasses.map((cancelled) => {
    const wouldBeAmount = wouldBeEarningsForClass(model, rates, cancelled.scheduledDurationSeconds);
    const rule = rules.find((r) => ruleConditionMatchesCancellation(r.condition, cancelled));
    const amountMinor = rule ? applyEffect(rule.effect, wouldBeAmount) : 0;
    const actor = cancelled.cancelledBy?.toLowerCase() ?? "unknown";

    return {
      label: rule
        ? `Cancelled class (${actor}) — per rule`
        : `Cancelled class (${actor}) — not payable`,
      amountMinor,
      source: "RULE"
    } satisfies PayrollLineItem;
  });
}

function wouldBeEarningsForClass(
  model: CoachCompensationModel,
  rates: EngineResolvedRates,
  scheduledDurationSeconds: number
): number {
  const hours = hoursOf(scheduledDurationSeconds);
  if ((model === "HOURLY" || model === "HOURLY_PLUS_CLASS" || model === "HYBRID") && rates.hourly?.rateMinor) {
    return Math.round(hours * rates.hourly.rateMinor);
  }
  if ((model === "PER_CLASS" || model === "HOURLY_PLUS_CLASS" || model === "HYBRID") && rates.perClass?.rateMinor) {
    return rates.perClass.rateMinor;
  }
  return 0;
}

function computeRuleLines(
  rules: EngineRule[],
  teachingSummary: TeachingSummary,
  grossSoFarMinor: number
): PayrollLineItem[] {
  const hours = hoursOf(teachingSummary.totalTeachingSeconds);
  const items: PayrollLineItem[] = [];

  for (const rule of rules) {
    if (rule.condition.minTeachingHours !== undefined && hours < rule.condition.minTeachingHours) {
      continue;
    }
    items.push({
      label: rule.ruleType === "BONUS" ? "Bonus" : "Deduction",
      amountMinor: Math.abs(applyEffect(rule.effect, grossSoFarMinor)),
      source: "RULE"
    });
  }
  return items;
}

export function calculatePayroll(input: PayrollCalculationInput): PayrollCalculationResult {
  const baseLines = computeBaseEarnings(
    input.compensationModel,
    input.resolvedRates,
    input.teachingSummary
  );
  const cancellationLines = computeCancellationCompensation(
    input.compensationModel,
    input.resolvedRates,
    input.cancellationRules,
    input.cancelledClasses
  );

  const earningsSoFar =
    sumAmounts(baseLines) + sumAmounts(cancellationLines);

  const bonusLines = computeRuleLines(input.bonusRules, input.teachingSummary, earningsSoFar);
  const grossEarningsMinor = earningsSoFar + sumAmounts(bonusLines);

  const deductionLines = computeRuleLines(
    input.deductionRules,
    input.teachingSummary,
    grossEarningsMinor
  );
  const totalDeductionsMinor = sumAmounts(deductionLines);

  const netPayableMinor = grossEarningsMinor - totalDeductionsMinor;

  return {
    earningsBreakdown: {
      version: 1,
      lineItems: [...baseLines, ...cancellationLines, ...bonusLines, ...deductionLines]
    },
    grossEarningsMinor,
    totalDeductionsMinor,
    netPayableMinor
  };
}

function sumAmounts(items: PayrollLineItem[]): number {
  return items.reduce((sum, item) => sum + item.amountMinor, 0);
}

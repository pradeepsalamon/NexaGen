import { calculatePayroll, type PayrollCalculationInput } from "./payroll-calculation.engine";
import type { TeachingSummary } from "@nexa-chess/types";

/**
 * The payroll calculation engine.
 *
 * This is the highest-stakes logic in the whole feature — a wrong number
 * here is money a coach is over- or under-paid. Every compensation model and
 * every cancellation-rule scenario the spec describes gets its own case.
 */

const emptySummary: TeachingSummary = {
  scheduledClassesCount: 0,
  completedClassesCount: 0,
  cancelledByCoachCount: 0,
  cancelledByStudentCount: 0,
  cancelledByAdminCount: 0,
  noShowCount: 0,
  totalTeachingSeconds: 0,
  totalBoardSeconds: 0
};

function baseInput(overrides: Partial<PayrollCalculationInput> = {}): PayrollCalculationInput {
  return {
    compensationModel: "HOURLY",
    resolvedRates: {},
    teachingSummary: emptySummary,
    cancellationRules: [],
    bonusRules: [],
    deductionRules: [],
    cancelledClasses: [],
    ...overrides
  };
}

describe("calculatePayroll — compensation models", () => {
  it("HOURLY: teaching hours × hourly rate", () => {
    // 38.5 hours × ₹500/hr (50000 paise) = ₹19,250 — the CLAUDE.md worked example.
    const result = calculatePayroll(
      baseInput({
        compensationModel: "HOURLY",
        resolvedRates: { hourly: { rateMinor: 50000, percentageBps: null, tierConfig: null } },
        teachingSummary: { ...emptySummary, totalTeachingSeconds: 38.5 * 3600 }
      })
    );
    expect(result.grossEarningsMinor).toBe(1_925_000);
    expect(result.netPayableMinor).toBe(1_925_000);
    expect(result.earningsBreakdown.lineItems).toHaveLength(1);
    expect(result.earningsBreakdown.lineItems[0]).toMatchObject({ quantity: 38.5, rateMinor: 50000 });
  });

  it("PER_CLASS: completed classes × class rate", () => {
    // 24 classes × ₹600 (60000 paise) = ₹14,400 — the CLAUDE.md worked example.
    const result = calculatePayroll(
      baseInput({
        compensationModel: "PER_CLASS",
        resolvedRates: { perClass: { rateMinor: 60000, percentageBps: null, tierConfig: null } },
        teachingSummary: { ...emptySummary, completedClassesCount: 24 }
      })
    );
    expect(result.grossEarningsMinor).toBe(1_440_000);
  });

  it("FIXED_SALARY: flat monthly amount regardless of hours", () => {
    const result = calculatePayroll(
      baseInput({
        compensationModel: "FIXED_SALARY",
        resolvedRates: { monthlySalary: { rateMinor: 2_500_000, percentageBps: null, tierConfig: null } },
        teachingSummary: { ...emptySummary, totalTeachingSeconds: 0, completedClassesCount: 0 }
      })
    );
    expect(result.grossEarningsMinor).toBe(2_500_000);
  });

  it("HOURLY_PLUS_CLASS: sums an hourly component and a per-class component", () => {
    const result = calculatePayroll(
      baseInput({
        compensationModel: "HOURLY_PLUS_CLASS",
        resolvedRates: {
          hourly: { rateMinor: 40000, percentageBps: null, tierConfig: null },
          perClass: { rateMinor: 10000, percentageBps: null, tierConfig: null }
        },
        teachingSummary: { ...emptySummary, totalTeachingSeconds: 10 * 3600, completedClassesCount: 5 }
      })
    );
    // 10h × 400 + 5 × 100 = 4000 + 500 = 4500 rupees → 450000 + 50000 paise
    expect(result.grossEarningsMinor).toBe(400_000 + 50_000);
    expect(result.earningsBreakdown.lineItems).toHaveLength(2);
  });

  it("TIERED: splits hours across tier breakpoints", () => {
    // 0–20h @ ₹400, 21–40h @ ₹500, 41+ @ ₹600 — CLAUDE.md worked example, 32.5 hours.
    const result = calculatePayroll(
      baseInput({
        compensationModel: "TIERED",
        resolvedRates: {
          tier: {
            rateMinor: null,
            percentageBps: null,
            tierConfig: [
              { uptoHours: 20, rateMinor: 40000 },
              { uptoHours: 40, rateMinor: 50000 },
              { rateMinor: 60000 }
            ]
          }
        },
        teachingSummary: { ...emptySummary, totalTeachingSeconds: 32.5 * 3600 }
      })
    );
    // 20 × 400 + 12.5 × 500 = 8000 + 6250 = 14250 rupees
    expect(result.grossEarningsMinor).toBe(20 * 40000 + 12.5 * 50000);
    expect(result.earningsBreakdown.lineItems).toHaveLength(2);
  });

  it("TIERED: hours fully inside the first tier only produce one line", () => {
    const result = calculatePayroll(
      baseInput({
        compensationModel: "TIERED",
        resolvedRates: {
          tier: {
            rateMinor: null,
            percentageBps: null,
            tierConfig: [
              { uptoHours: 20, rateMinor: 40000 },
              { rateMinor: 60000 }
            ]
          }
        },
        teachingSummary: { ...emptySummary, totalTeachingSeconds: 5 * 3600 }
      })
    );
    expect(result.earningsBreakdown.lineItems).toHaveLength(1);
    expect(result.grossEarningsMinor).toBe(5 * 40000);
  });

  it("PERCENTAGE: surfaces the missing-revenue-linkage gap rather than silently paying 0", () => {
    const result = calculatePayroll(baseInput({ compensationModel: "PERCENTAGE" }));
    expect(result.grossEarningsMinor).toBe(0);
    expect(result.earningsBreakdown.lineItems[0].label).toMatch(/not available/i);
  });

  it("HYBRID: base salary + hourly incentive + class incentive", () => {
    const result = calculatePayroll(
      baseInput({
        compensationModel: "HYBRID",
        resolvedRates: {
          monthlySalary: { rateMinor: 1_000_000, percentageBps: null, tierConfig: null },
          hourly: { rateMinor: 20000, percentageBps: null, tierConfig: null },
          perClass: { rateMinor: 5000, percentageBps: null, tierConfig: null }
        },
        teachingSummary: { ...emptySummary, totalTeachingSeconds: 10 * 3600, completedClassesCount: 4 }
      })
    );
    // 1,000,000 + (10×20000) + (4×5000) = 1,000,000 + 200,000 + 20,000
    expect(result.grossEarningsMinor).toBe(1_220_000);
    expect(result.earningsBreakdown.lineItems).toHaveLength(3);
  });

  it("a compensation model with no resolved rate produces zero, not a crash", () => {
    const result = calculatePayroll(baseInput({ compensationModel: "HOURLY", resolvedRates: {} }));
    expect(result.grossEarningsMinor).toBe(0);
    expect(result.earningsBreakdown.lineItems).toHaveLength(0);
  });
});

describe("calculatePayroll — cancellation rules", () => {
  const hourlyRates = { hourly: { rateMinor: 50000, percentageBps: null, tierConfig: null } };

  it("coach cancels → ₹0 when a matching rule says so", () => {
    const result = calculatePayroll(
      baseInput({
        resolvedRates: hourlyRates,
        cancellationRules: [
          {
            id: "r1",
            ruleType: "CANCELLATION",
            condition: { cancelledBy: "COACH" },
            effect: { kind: "PAYOUT_PERCENT", percent: 0 },
            priority: 0
          }
        ],
        cancelledClasses: [
          { classId: "c1", cancelledBy: "COACH", noticeHours: 5, scheduledDurationSeconds: 3600 }
        ]
      })
    );
    expect(result.grossEarningsMinor).toBe(0);
    expect(result.earningsBreakdown.lineItems[0]).toMatchObject({ amountMinor: 0, source: "RULE" });
  });

  it("student cancels < 2h before → 100% payout per rule", () => {
    const result = calculatePayroll(
      baseInput({
        resolvedRates: hourlyRates,
        cancellationRules: [
          {
            id: "r1",
            ruleType: "CANCELLATION",
            condition: { cancelledBy: "STUDENT", noticeHoursLessThan: 2 },
            effect: { kind: "PAYOUT_PERCENT", percent: 100 },
            priority: 0
          }
        ],
        cancelledClasses: [
          // 1 hour scheduled, cancelled with 1h notice (< 2h) → full pay
          { classId: "c1", cancelledBy: "STUDENT", noticeHours: 1, scheduledDurationSeconds: 3600 }
        ]
      })
    );
    // wouldBeAmount = 1h × 50000 = 50000
    expect(result.grossEarningsMinor).toBe(50000);
  });

  it("student cancels > 2h before → 0% payout per rule", () => {
    const result = calculatePayroll(
      baseInput({
        resolvedRates: hourlyRates,
        cancellationRules: [
          {
            id: "r1",
            ruleType: "CANCELLATION",
            condition: { cancelledBy: "STUDENT", noticeHoursAtLeast: 2 },
            effect: { kind: "PAYOUT_PERCENT", percent: 0 },
            priority: 0
          }
        ],
        cancelledClasses: [
          { classId: "c1", cancelledBy: "STUDENT", noticeHours: 5, scheduledDurationSeconds: 3600 }
        ]
      })
    );
    expect(result.grossEarningsMinor).toBe(0);
  });

  it("no matching rule → ₹0, but the reason is explained in the breakdown", () => {
    const result = calculatePayroll(
      baseInput({
        resolvedRates: hourlyRates,
        cancellationRules: [],
        cancelledClasses: [
          { classId: "c1", cancelledBy: "ADMIN", noticeHours: 3, scheduledDurationSeconds: 3600 }
        ]
      })
    );
    expect(result.grossEarningsMinor).toBe(0);
    expect(result.earningsBreakdown.lineItems[0].label).toMatch(/not payable/i);
  });

  it("a flat-amount cancellation effect ignores the would-be class value", () => {
    const result = calculatePayroll(
      baseInput({
        resolvedRates: hourlyRates,
        cancellationRules: [
          {
            id: "r1",
            ruleType: "CANCELLATION",
            condition: {},
            effect: { kind: "FLAT_AMOUNT", amountMinor: 12345 },
            priority: 0
          }
        ],
        cancelledClasses: [
          { classId: "c1", cancelledBy: "ADMIN", noticeHours: null, scheduledDurationSeconds: 3600 }
        ]
      })
    );
    expect(result.grossEarningsMinor).toBe(12345);
  });

  it("higher-priority rules are tried first (caller is expected to pre-sort, but the first match wins)", () => {
    const result = calculatePayroll(
      baseInput({
        resolvedRates: hourlyRates,
        cancellationRules: [
          {
            id: "specific",
            ruleType: "CANCELLATION",
            condition: { cancelledBy: "COACH" },
            effect: { kind: "FLAT_AMOUNT", amountMinor: 111 },
            priority: 10
          },
          {
            id: "catch-all",
            ruleType: "CANCELLATION",
            condition: {},
            effect: { kind: "FLAT_AMOUNT", amountMinor: 222 },
            priority: 0
          }
        ],
        cancelledClasses: [
          { classId: "c1", cancelledBy: "COACH", noticeHours: 1, scheduledDurationSeconds: 3600 }
        ]
      })
    );
    expect(result.grossEarningsMinor).toBe(111);
  });
});

describe("calculatePayroll — bonus & deduction rules", () => {
  const hourlyRates = { hourly: { rateMinor: 50000, percentageBps: null, tierConfig: null } };

  it("applies a bonus only once the minimum-hours condition is met", () => {
    const below = calculatePayroll(
      baseInput({
        resolvedRates: hourlyRates,
        teachingSummary: { ...emptySummary, totalTeachingSeconds: 30 * 3600 },
        bonusRules: [
          {
            id: "b1",
            ruleType: "BONUS",
            condition: { minTeachingHours: 40 },
            effect: { kind: "FLAT_AMOUNT", amountMinor: 200000 },
            priority: 0
          }
        ]
      })
    );
    expect(below.grossEarningsMinor).toBe(30 * 50000); // no bonus

    const above = calculatePayroll(
      baseInput({
        resolvedRates: hourlyRates,
        teachingSummary: { ...emptySummary, totalTeachingSeconds: 45 * 3600 },
        bonusRules: [
          {
            id: "b1",
            ruleType: "BONUS",
            condition: { minTeachingHours: 40 },
            effect: { kind: "FLAT_AMOUNT", amountMinor: 200000 },
            priority: 0
          }
        ]
      })
    );
    expect(above.grossEarningsMinor).toBe(45 * 50000 + 200000);
  });

  it("a flat deduction reduces net payable but not gross earnings", () => {
    const result = calculatePayroll(
      baseInput({
        resolvedRates: hourlyRates,
        teachingSummary: { ...emptySummary, totalTeachingSeconds: 10 * 3600 },
        deductionRules: [
          {
            id: "d1",
            ruleType: "DEDUCTION",
            condition: {},
            effect: { kind: "FLAT_AMOUNT", amountMinor: 5000 },
            priority: 0
          }
        ]
      })
    );
    expect(result.grossEarningsMinor).toBe(10 * 50000);
    expect(result.totalDeductionsMinor).toBe(5000);
    expect(result.netPayableMinor).toBe(10 * 50000 - 5000);
  });

  it("a percentage deduction is computed off gross earnings and never negative", () => {
    const result = calculatePayroll(
      baseInput({
        resolvedRates: hourlyRates,
        teachingSummary: { ...emptySummary, totalTeachingSeconds: 10 * 3600 },
        deductionRules: [
          {
            id: "d1",
            ruleType: "DEDUCTION",
            condition: {},
            effect: { kind: "PAYOUT_PERCENT", percent: 10 },
            priority: 0
          }
        ]
      })
    );
    const gross = 10 * 50000;
    expect(result.totalDeductionsMinor).toBe(Math.round(gross * 0.1));
    expect(result.netPayableMinor).toBe(gross - Math.round(gross * 0.1));
  });
});

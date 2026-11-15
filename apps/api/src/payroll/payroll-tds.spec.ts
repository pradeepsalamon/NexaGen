import { computeTds, financialYearStart, formatBpsPercent } from "@nexa-chess/types";
import type { PrismaService } from "../prisma/prisma.service";
import { readTdsSnapshot, recomputeAdjustmentTotals, recomputeNetPayable } from "./payroll-record-totals.util";

const terms = (overrides: Partial<Parameters<typeof computeTds>[0]> = {}) => ({
  priorTaxableMinor: 0,
  priorTdsMinor: 0,
  rateBps: 1000,
  thresholdMinor: 0,
  ...overrides
});

describe("computeTds", () => {
  it("deducts the rate from the first payment when there is no threshold", () => {
    expect(computeTds(terms(), 3_000_000)).toBe(300_000);
  });

  it("deducts nothing until the year's pay goes above the threshold", () => {
    expect(computeTds(terms({ thresholdMinor: 5_000_000 }), 3_000_000)).toBe(0);
    // Exactly at the threshold is still not above it.
    expect(computeTds(terms({ priorTaxableMinor: 2_000_000, thresholdMinor: 5_000_000 }), 3_000_000)).toBe(0);
  });

  it("catches up on the whole year's pay once the threshold is crossed", () => {
    // ₹30,000 earlier with no TDS, ₹30,000 now, threshold ₹50,000, 10%: ₹6,000 on ₹60,000.
    expect(computeTds(terms({ priorTaxableMinor: 3_000_000, thresholdMinor: 5_000_000 }), 3_000_000)).toBe(600_000);
  });

  it("takes off what earlier payslips already deducted", () => {
    expect(
      computeTds(terms({ priorTaxableMinor: 6_000_000, priorTdsMinor: 600_000, thresholdMinor: 5_000_000 }), 2_000_000)
    ).toBe(200_000);
  });

  it("never deducts more than this payslip pays; the rest carries over", () => {
    expect(computeTds(terms({ priorTaxableMinor: 9_000_000, thresholdMinor: 9_000_000 }), 500_000)).toBe(500_000);
  });

  it("never goes negative when earlier payslips over-deducted", () => {
    expect(computeTds(terms({ priorTaxableMinor: 1_000_000, priorTdsMinor: 900_000 }), 1_000_000)).toBe(0);
  });

  it("is zero for a zero rate or nothing to pay", () => {
    expect(computeTds(terms({ rateBps: 0 }), 1_000_000)).toBe(0);
    expect(computeTds(terms(), 0)).toBe(0);
    expect(computeTds(terms(), -500)).toBe(0);
  });

  it("rounds to the nearest minor unit", () => {
    expect(computeTds(terms({ rateBps: 750 }), 333)).toBe(25);
  });
});

describe("financialYearStart", () => {
  it("uses April by default for India", () => {
    expect(financialYearStart("2026-11-15", 4).toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(financialYearStart("2027-03-31", 4).toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(financialYearStart("2027-04-01", 4).toISOString()).toBe("2027-04-01T00:00:00.000Z");
  });

  it("follows the academy's own start month", () => {
    expect(financialYearStart("2026-11-15", 1).toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(financialYearStart("2026-06-30", 7).toISOString()).toBe("2025-07-01T00:00:00.000Z");
  });
});

describe("formatBpsPercent", () => {
  it("prints whole and fractional rates", () => {
    expect(formatBpsPercent(1000)).toBe("10%");
    expect(formatBpsPercent(750)).toBe("7.5%");
    expect(formatBpsPercent(1)).toBe("0.01%");
  });
});

describe("payroll record totals with TDS", () => {
  const snapshot = {
    priorTaxableMinor: 0,
    priorTdsMinor: 0,
    rateBps: 1000,
    thresholdMinor: 0,
    version: 1,
    yearStart: "2026-04-01"
  };

  function fakePrisma(record: Record<string, unknown>, adjustments: Array<{ type: string; amountMinor: number }> = []) {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      coachPayrollRecord: {
        findUniqueOrThrow: jest.fn(async () => record),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => Object.assign(record, data))
      },
      payrollAdjustment: { findMany: jest.fn(async () => adjustments) }
    };
    const prisma = { $transaction: (fn: (client: typeof tx) => Promise<void>) => fn(tx) } as unknown as PrismaService;
    return { prisma, record };
  }

  it("takes TDS off the pay before TDS", async () => {
    const { prisma, record } = fakePrisma({
      grossEarningsMinor: 1_000_000,
      tdsSnapshot: snapshot,
      totalAdjustmentsMinor: 0,
      totalDeductionsMinor: 100_000
    });
    await recomputeNetPayable(prisma, "rec");
    expect(record).toMatchObject({ netPayableMinor: 810_000, tdsMinor: 90_000 });
  });

  it("leaves the pay alone when the record has no TDS terms", async () => {
    const { prisma, record } = fakePrisma({
      grossEarningsMinor: 1_000_000,
      tdsSnapshot: null,
      totalAdjustmentsMinor: 50_000,
      totalDeductionsMinor: 0
    });
    await recomputeNetPayable(prisma, "rec");
    expect(record).toMatchObject({ netPayableMinor: 1_050_000, tdsMinor: 0 });
  });

  it("re-works TDS when an adjustment changes what the record pays", async () => {
    const { prisma, record } = fakePrisma(
      { grossEarningsMinor: 1_000_000, tdsSnapshot: snapshot, totalAdjustmentsMinor: 0, totalDeductionsMinor: 0 },
      [
        { amountMinor: 200_000, type: "EARNING" },
        { amountMinor: 50_000, type: "DEDUCTION" }
      ]
    );
    await recomputeAdjustmentTotals(prisma, "rec");
    expect(record).toMatchObject({ netPayableMinor: 1_035_000, tdsMinor: 115_000, totalAdjustmentsMinor: 150_000 });
  });

  it("reads only a well-formed snapshot", () => {
    expect(readTdsSnapshot(snapshot)).toEqual(snapshot);
    expect(readTdsSnapshot(null)).toBeNull();
    expect(readTdsSnapshot({ rateBps: "10" })).toBeNull();
  });
});

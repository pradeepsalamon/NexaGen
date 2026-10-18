import { Test, type TestingModule } from "@nestjs/testing";
import {
  resolveApplicableRules,
  resolveEffectiveCompensationRate,
  type CompensationRateScope
} from "@nexa-chess/types";
import { PrismaService } from "../prisma/prisma.service";
import { CompensationRateResolutionService } from "./compensation-rate-resolution.service";

/**
 * Effective-date/scope resolution (§14).
 *
 * The rule these tests protect: a historical payroll period must always
 * resolve the rate/rule that was ACTUALLY in force when it ran, never the
 * one in force today. Boundary conditions (a rate starting exactly on the
 * period's reference date, an ended rate) are where off-by-one bugs hide.
 */
describe("resolveEffectiveCompensationRate", () => {
  const rate = (
    id: string,
    from: string,
    to: string | null,
    scopeConfig: CompensationRateScope | null = null
  ) => ({
    id,
    effectiveFrom: from,
    effectiveTo: to,
    scopeConfig
  });

  it("picks the only candidate whose window covers the date", () => {
    const rates = [rate("r1", "2026-01-01", "2026-07-01"), rate("r2", "2026-07-01", null)];
    expect(resolveEffectiveCompensationRate(rates, "2026-03-01")?.id).toBe("r1");
    expect(resolveEffectiveCompensationRate(rates, "2026-09-01")?.id).toBe("r2");
  });

  it("treats effectiveFrom as inclusive", () => {
    const rates = [rate("r1", "2026-07-01", null)];
    expect(resolveEffectiveCompensationRate(rates, "2026-07-01")?.id).toBe("r1");
    expect(resolveEffectiveCompensationRate(rates, "2026-06-30")).toBeNull();
  });

  it("treats effectiveTo as exclusive — the day a rate ends, the next one is already in force", () => {
    const rates = [rate("r1", "2026-01-01", "2026-07-01"), rate("r2", "2026-07-01", null)];
    const winner = resolveEffectiveCompensationRate(rates, "2026-07-01");
    expect(winner?.id).toBe("r2");
  });

  it("returns null when no rate has ever been configured for that date", () => {
    const rates = [rate("r1", "2026-07-01", null)];
    expect(resolveEffectiveCompensationRate(rates, "2026-01-01")).toBeNull();
  });

  it("prefers the more specifically-scoped candidate over an unscoped one", () => {
    const rates = [
      rate("general", "2026-01-01", null, null),
      rate("private-only", "2026-01-01", null, { classTypes: ["PRIVATE"] })
    ];
    const winner = resolveEffectiveCompensationRate(rates, "2026-06-01", { classType: "PRIVATE" });
    expect(winner?.id).toBe("private-only");
  });

  it("falls back to the unscoped rate when the context doesn't match any scoped candidate", () => {
    const rates = [
      rate("general", "2026-01-01", null, null),
      rate("private-only", "2026-01-01", null, { classTypes: ["PRIVATE"] })
    ];
    const winner = resolveEffectiveCompensationRate(rates, "2026-06-01", { classType: "GROUP" });
    expect(winner?.id).toBe("general");
  });

  it("among equally-scoped candidates, the most recently effective one wins", () => {
    const rates = [rate("old", "2026-01-01", null), rate("new", "2026-06-01", null)];
    expect(resolveEffectiveCompensationRate(rates, "2026-08-01")?.id).toBe("new");
  });
});

describe("resolveApplicableRules", () => {
  const rule = (
    id: string,
    priority: number,
    enabled = true,
    ruleType: "CANCELLATION" | "BONUS" = "CANCELLATION",
    from = "2026-01-01",
    to: string | null = null
  ) => ({ id, priority, enabled, ruleType, effectiveFrom: from, effectiveTo: to });

  it("excludes disabled rules", () => {
    const rules = [rule("r1", 0, false)];
    expect(resolveApplicableRules(rules, "2026-06-01")).toHaveLength(0);
  });

  it("excludes rules outside their effective window", () => {
    const rules = [rule("r1", 0, true, "CANCELLATION", "2026-07-01")];
    expect(resolveApplicableRules(rules, "2026-01-01")).toHaveLength(0);
    expect(resolveApplicableRules(rules, "2026-08-01")).toHaveLength(1);
  });

  it("filters by ruleType when given", () => {
    const rules = [rule("c1", 0, true, "CANCELLATION"), rule("b1", 0, true, "BONUS")];
    expect(resolveApplicableRules(rules, "2026-06-01", "BONUS").map((r) => r.id)).toEqual(["b1"]);
  });

  it("sorts by priority, highest first", () => {
    const rules = [rule("low", 1), rule("high", 10), rule("mid", 5)];
    expect(resolveApplicableRules(rules, "2026-06-01").map((r) => r.id)).toEqual([
      "high",
      "mid",
      "low"
    ]);
  });
});

describe("CompensationRateResolutionService", () => {
  const build = async (rateRows: Record<string, unknown>[], ruleRows: Record<string, unknown>[] = []) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompensationRateResolutionService,
        {
          provide: PrismaService,
          useValue: {
            coachCompensationRate: { findMany: jest.fn().mockResolvedValue(rateRows) },
            payrollRule: { findMany: jest.fn().mockResolvedValue(ruleRows) }
          }
        }
      ]
    }).compile();
    return module.get(CompensationRateResolutionService);
  };

  it("resolves a single HOURLY rate into the hourly slot", async () => {
    const service = await build([
      {
        id: "r1",
        calculationType: "HOURLY_RATE",
        rateMinor: 50000,
        percentageBps: null,
        tierConfig: null,
        scopeConfig: null,
        effectiveFrom: new Date("2026-01-01"),
        effectiveTo: null
      }
    ]);
    const resolved = await service.resolveRatesForModel("coach1", "HOURLY", new Date("2026-06-01"));
    expect(resolved.hourly?.rateMinor).toBe(50000);
    expect(resolved.perClass).toBeUndefined();
  });

  it("resolves both slots for HOURLY_PLUS_CLASS", async () => {
    const service = await build([
      {
        id: "r1",
        calculationType: "HOURLY_RATE",
        rateMinor: 40000,
        percentageBps: null,
        tierConfig: null,
        scopeConfig: null,
        effectiveFrom: new Date("2026-01-01"),
        effectiveTo: null
      },
      {
        id: "r2",
        calculationType: "PER_CLASS_RATE",
        rateMinor: 10000,
        percentageBps: null,
        tierConfig: null,
        scopeConfig: null,
        effectiveFrom: new Date("2026-01-01"),
        effectiveTo: null
      }
    ]);
    const resolved = await service.resolveRatesForModel(
      "coach1",
      "HOURLY_PLUS_CLASS",
      new Date("2026-06-01")
    );
    expect(resolved.hourly?.rateMinor).toBe(40000);
    expect(resolved.perClass?.rateMinor).toBe(10000);
  });

  it("leaves a slot unresolved when no rate has been configured", async () => {
    const service = await build([]);
    const resolved = await service.resolveRatesForModel("coach1", "HOURLY", new Date("2026-06-01"));
    expect(resolved.hourly).toBeUndefined();
  });

  it("returns applicable rules for a type, sorted by priority", async () => {
    const service = await build([], [
      {
        id: "low",
        ruleType: "CANCELLATION",
        condition: {},
        effect: { kind: "FLAT_AMOUNT", amountMinor: 1 },
        priority: 1,
        enabled: true,
        effectiveFrom: new Date("2026-01-01"),
        effectiveTo: null
      },
      {
        id: "high",
        ruleType: "CANCELLATION",
        condition: {},
        effect: { kind: "FLAT_AMOUNT", amountMinor: 2 },
        priority: 5,
        enabled: true,
        effectiveFrom: new Date("2026-01-01"),
        effectiveTo: null
      }
    ]);
    const rules = await service.getApplicableRules("CANCELLATION", new Date("2026-06-01"));
    expect(rules.map((r) => r.id)).toEqual(["high", "low"]);
  });
});

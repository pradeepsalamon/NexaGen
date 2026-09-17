import { Injectable } from "@nestjs/common";
import {
  resolveApplicableRules,
  resolveEffectiveCompensationRate,
  type CoachCompensationModel,
  type CompensationCalculationType,
  type CompensationRateScope,
  type CompensationTierConfig,
  type PayrollRuleCondition,
  type PayrollRuleEffect,
  type PayrollRuleType
} from "@nexa-chess/types";
import { PrismaService } from "../prisma/prisma.service";
import type { EngineResolvedRates, EngineRule } from "./payroll-calculation.engine";

/**
 * Thin Nest wrapper: loads `CoachCompensationRate`/`PayrollRule` rows and
 * delegates the actual effective-date/scope resolution to the pure functions
 * in `@nexa-chess/types` (`resolveEffectiveCompensationRate`,
 * `resolveApplicableRules`). Keeping resolution logic in the shared package
 * is what lets a future admin "preview" call the identical function without
 * hitting the API.
 */
@Injectable()
export class CompensationRateResolutionService {
  constructor(private readonly prisma: PrismaService) {}

  private static readonly CALCULATION_TYPES_FOR_MODEL: Record<
    CoachCompensationModel,
    CompensationCalculationType[]
  > = {
    HOURLY: ["HOURLY_RATE"],
    PER_CLASS: ["PER_CLASS_RATE"],
    FIXED_SALARY: ["MONTHLY_SALARY"],
    HOURLY_PLUS_CLASS: ["HOURLY_RATE", "PER_CLASS_RATE"],
    TIERED: ["TIER"],
    PERCENTAGE: ["PERCENTAGE"],
    HYBRID: ["MONTHLY_SALARY", "HOURLY_RATE", "PER_CLASS_RATE"]
  };

  private static readonly SLOT_FOR_CALCULATION_TYPE: Record<
    CompensationCalculationType,
    keyof EngineResolvedRates
  > = {
    HOURLY_RATE: "hourly",
    PER_CLASS_RATE: "perClass",
    MONTHLY_SALARY: "monthlySalary",
    TIER: "tier",
    PERCENTAGE: "percentage"
  };

  /**
   * Resolves every rate slot a coach's compensation model needs (e.g. HYBRID
   * needs up to three) as of `atDate`, optionally narrowed by class/student/
   * batch scope.
   */
  async resolveRatesForModel(
    coachId: string,
    model: CoachCompensationModel,
    atDate: Date,
    context: { classType?: string; studentLevel?: string; batchId?: string } = {}
  ): Promise<EngineResolvedRates> {
    const calculationTypes =
      CompensationRateResolutionService.CALCULATION_TYPES_FOR_MODEL[model];

    const rows = await this.prisma.coachCompensationRate.findMany({
      where: { coachId, calculationType: { in: calculationTypes } }
    });

    const resolved: EngineResolvedRates = {};
    for (const calculationType of calculationTypes) {
      const candidates = rows.filter((r) => r.calculationType === calculationType);
      const winner = resolveEffectiveCompensationRate(
        candidates.map((r) => ({
          ...r,
          scopeConfig: (r.scopeConfig as CompensationRateScope | null) ?? null
        })),
        atDate,
        context
      );
      if (!winner) continue;

      const slot = CompensationRateResolutionService.SLOT_FOR_CALCULATION_TYPE[calculationType];
      resolved[slot] = {
        rateMinor: winner.rateMinor,
        percentageBps: winner.percentageBps,
        tierConfig: (winner.tierConfig as CompensationTierConfig | null) ?? null
      };
    }
    return resolved;
  }

  /** All enabled rules of a type in force at `atDate`, highest priority first. */
  async getApplicableRules(ruleType: PayrollRuleType, atDate: Date): Promise<EngineRule[]> {
    const rows = await this.prisma.payrollRule.findMany({
      where: { ruleType, enabled: true }
    });

    const applicable = resolveApplicableRules(rows, atDate, ruleType);
    return applicable.map((rule) => ({
      id: rule.id,
      ruleType: rule.ruleType as EngineRule["ruleType"],
      condition: rule.condition as PayrollRuleCondition,
      effect: rule.effect as PayrollRuleEffect,
      priority: rule.priority
    }));
  }
}

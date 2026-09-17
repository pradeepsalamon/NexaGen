import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { calculatePayroll } from "./payroll-calculation.engine";
import { PayrollPeriodStatus, type Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CompensationRateResolutionService } from "./compensation-rate-resolution.service";
import { TeachingDataAggregationService } from "./teaching-data-aggregation.service";
import { recomputeNetPayable } from "./payroll-record-totals.util";

/**
 * Orchestrates a period's calculation: for every in-scope coach, aggregate
 * teaching data → resolve rates/rules → run the pure engine → persist a
 * `CoachPayrollRecord`. Moves the period `DRAFT → CALCULATING → REVIEW`.
 *
 * `calculatePeriod` (the first run) only accepts DRAFT; `recalculatePeriod`
 * (§25, driven by `payroll-lifecycle.service.ts`) only accepts REVIEW —
 * once APPROVED/FINALIZED/PAID a period's records are immutable (§31).
 * Recalculating never touches `totalAdjustmentsMinor`/manual adjustments —
 * only the engine's own output columns — so a recalculation can't silently
 * erase an adjustment an admin already added.
 */
@Injectable()
export class PayrollCalculationService {
  private readonly logger = new Logger(PayrollCalculationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly teachingData: TeachingDataAggregationService,
    private readonly rateResolution: CompensationRateResolutionService
  ) {}

  async calculatePeriod(periodId: string): Promise<void> {
    await this.run(periodId, PayrollPeriodStatus.DRAFT, PayrollPeriodStatus.DRAFT);
  }

  async recalculatePeriod(periodId: string): Promise<void> {
    await this.run(periodId, PayrollPeriodStatus.REVIEW, PayrollPeriodStatus.REVIEW);
  }

  private async run(
    periodId: string,
    requiredStatus: PayrollPeriodStatus,
    statusOnFailure: PayrollPeriodStatus
  ): Promise<void> {
    const period = await this.prisma.payrollPeriod.findUniqueOrThrow({ where: { id: periodId } });
    if (period.status !== requiredStatus) {
      throw new ConflictException(
        `Cannot calculate a period that is ${period.status.toLowerCase()}; only a ${requiredStatus.toLowerCase()} period can be calculated.`
      );
    }

    await this.prisma.payrollPeriod.update({
      where: { id: periodId },
      data: { status: PayrollPeriodStatus.CALCULATING }
    });

    try {
      const coachIds = await this.getInScopeCoachIds(period.startDate, period.endDate);

      for (const coachId of coachIds) {
        await this.calculateForCoach(periodId, coachId, period.startDate, period.endDate);
      }

      await this.prisma.payrollPeriod.update({
        where: { id: periodId },
        data: { status: PayrollPeriodStatus.REVIEW, calculatedAt: new Date() }
      });
    } catch (error) {
      // Roll back to where it started rather than leaving the period stuck in
      // CALCULATING — a coach with in-flight classes (still SCHEDULED/LIVE)
      // is the expected failure mode here, and the admin should be free to
      // retry once those classes settle.
      await this.prisma.payrollPeriod.update({
        where: { id: periodId },
        data: { status: statusOnFailure }
      });
      throw error;
    }
  }

  private async getInScopeCoachIds(startDate: Date, endDate: Date): Promise<string[]> {
    const [classCoaches, profileCoaches] = await Promise.all([
      this.prisma.coachClass.findMany({
        where: { startsAt: { gte: startDate, lt: endDate } },
        distinct: ["coachId"],
        select: { coachId: true }
      }),
      this.prisma.coachCompensationProfile.findMany({ select: { coachId: true } })
    ]);

    return Array.from(
      new Set([...classCoaches.map((c) => c.coachId), ...profileCoaches.map((p) => p.coachId)])
    );
  }

  private async calculateForCoach(
    periodId: string,
    coachId: string,
    startDate: Date,
    endDate: Date
  ): Promise<void> {
    const profile = await this.prisma.coachCompensationProfile.findUnique({ where: { coachId } });
    const compensationModel = profile?.defaultCompensationModel ?? "HOURLY";

    // Rates/rules are resolved as of the period's end — a rate change
    // mid-period always wins for that whole period (a documented
    // simplification; effective-dating finer than one period is not needed
    // for WEEKLY/BIWEEKLY/MONTHLY/CUSTOM runs).
    const asOf = endDate;

    const { summary, cancelledClasses } = await this.teachingData.getTeachingData(
      coachId,
      startDate,
      endDate
    );

    const resolvedRates = await this.rateResolution.resolveRatesForModel(
      coachId,
      compensationModel,
      asOf
    );
    const cancellationRules = await this.rateResolution.getApplicableRules("CANCELLATION", asOf);
    const bonusRules = await this.rateResolution.getApplicableRules("BONUS", asOf);
    const deductionRules = await this.rateResolution.getApplicableRules("DEDUCTION", asOf);

    const result = calculatePayroll({
      compensationModel,
      resolvedRates,
      teachingSummary: summary,
      cancellationRules,
      bonusRules,
      deductionRules,
      cancelledClasses
    });

    const ruleSnapshot = {
      cancellationRules,
      bonusRules,
      deductionRules
    } as unknown as Prisma.InputJsonValue;
    const rateSnapshot = resolvedRates as unknown as Prisma.InputJsonValue;
    const earningsBreakdown = result.earningsBreakdown as unknown as Prisma.InputJsonValue;

    // netPayableMinor is deliberately NOT set here — recomputeNetPayable
    // below is the only writer, so an existing manual adjustment (added
    // while the period sat in REVIEW) survives a recalculation untouched.
    const record = await this.prisma.coachPayrollRecord.upsert({
      where: { periodId_coachId: { periodId, coachId } },
      create: {
        periodId,
        coachId,
        status: "CALCULATED",
        ...summary,
        earningsBreakdown,
        rateSnapshot,
        ruleSnapshot,
        grossEarningsMinor: result.grossEarningsMinor,
        totalDeductionsMinor: result.totalDeductionsMinor,
        totalAdjustmentsMinor: 0,
        netPayableMinor: 0,
        calculatedAt: new Date()
      },
      update: {
        status: "CALCULATED",
        ...summary,
        earningsBreakdown,
        rateSnapshot,
        ruleSnapshot,
        grossEarningsMinor: result.grossEarningsMinor,
        totalDeductionsMinor: result.totalDeductionsMinor,
        calculatedAt: new Date()
      }
    });
    await recomputeNetPayable(this.prisma, record.id);

    this.logger.log(`Calculated payroll: period=${periodId} coach=${coachId} record=${record.id}`);
  }
}

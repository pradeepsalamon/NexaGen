import { ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { financialYearStart, type PayrollTdsSnapshot } from "@nexa-chess/types";
import { calculatePayroll } from "./payroll-calculation.engine";
import { PayrollPeriodStatus, Prisma, type PayrollSettings } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CompensationRateResolutionService } from "./compensation-rate-resolution.service";
import { TeachingDataAggregationService } from "./teaching-data-aggregation.service";
import { recomputeNetPayable } from "./payroll-record-totals.util";
import { PayrollSettingsService } from "./payroll-settings.service";

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
    private readonly rateResolution: CompensationRateResolutionService,
    private readonly settings: PayrollSettingsService
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
    const period = await this.prisma.payrollPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw new NotFoundException("Payroll period not found.");
    if (period.status !== requiredStatus) {
      throw new ConflictException(
        `Cannot calculate a period that is ${period.status.toLowerCase()}; only a ${requiredStatus.toLowerCase()} period can be calculated.`
      );
    }

    // Claimed conditionally: a concurrent calculate or approve that changed the
    // status since the read above must not be overwritten.
    const { count } = await this.prisma.payrollPeriod.updateMany({
      where: { id: periodId, status: requiredStatus },
      data: { status: PayrollPeriodStatus.CALCULATING }
    });
    if (count === 0) {
      throw new ConflictException("This period changed while you were calculating it. Reload and try again.");
    }

    try {
      const coachIds = await this.getInScopeCoachIds(periodId, period.startDate, period.endDate);
      const settings = await this.settings.find();

      for (const coachId of coachIds) {
        await this.calculateForCoach(periodId, coachId, period.startDate, period.endDate, settings);
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

  private async getInScopeCoachIds(periodId: string, startDate: Date, endDate: Date): Promise<string[]> {
    const [classCoaches, profileCoaches, recordCoaches] = await Promise.all([
      this.prisma.coachClass.findMany({
        where: { startsAt: { gte: startDate, lt: endDate } },
        distinct: ["coachId"],
        select: { coachId: true }
      }),
      this.prisma.coachCompensationProfile.findMany({ select: { coachId: true } }),
      // A coach already calculated here is recalculated too, so one who dropped out
      // of scope (classes moved away, profile removed) comes back as zero instead
      // of keeping the old figures (review R7).
      this.prisma.coachPayrollRecord.findMany({ select: { coachId: true }, where: { periodId } })
    ]);

    return Array.from(
      new Set([...classCoaches.map((c) => c.coachId), ...profileCoaches.map((p) => p.coachId), ...recordCoaches.map((r) => r.coachId)])
    );
  }

  private async calculateForCoach(
    periodId: string,
    coachId: string,
    startDate: Date,
    endDate: Date,
    settings: PayrollSettings | null
  ): Promise<void> {
    const profile = await this.prisma.coachCompensationProfile.findUnique({ where: { coachId } });
    const compensationModel = profile?.defaultCompensationModel ?? "HOURLY";

    // Rates/rules are resolved as of the period's last instant — a rate change
    // mid-period always wins for that whole period (a documented
    // simplification; effective-dating finer than one period is not needed
    // for WEEKLY/BIWEEKLY/MONTHLY/CUSTOM runs). endDate is exclusive, so a rate
    // starting on the next period's first day must not apply here.
    const asOf = new Date(endDate.getTime() - 1);

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
    const tds = await this.resolveTdsSnapshot(periodId, coachId, startDate, settings, profile?.tdsRateBps ?? null);
    const tdsSnapshot = tds ? (tds as unknown as Prisma.InputJsonValue) : Prisma.DbNull;

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
        tdsSnapshot,
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
        tdsSnapshot,
        grossEarningsMinor: result.grossEarningsMinor,
        totalDeductionsMinor: result.totalDeductionsMinor,
        calculatedAt: new Date()
      }
    });
    await recomputeNetPayable(this.prisma, record.id);

    this.logger.log(`Calculated payroll: period=${periodId} coach=${coachId} record=${record.id}`);
  }

  /**
   * The TDS terms to freeze on this coach's record, or null when none applies
   * (TDS off, or a zero rate). The coach's own rate wins over the academy's.
   *
   * "Earlier this year" is every other period that starts inside the same
   * financial year and before this one, cancelled periods aside — whatever
   * its status, since it is pay the academy expects to make. Recalculating an
   * earlier period afterwards does not reach forward into this record:
   * recalculate this one too if that happens while it is still in review.
   */
  private async resolveTdsSnapshot(
    periodId: string,
    coachId: string,
    startDate: Date,
    settings: PayrollSettings | null,
    coachRateBps: number | null
  ): Promise<PayrollTdsSnapshot | null> {
    if (!settings?.tdsEnabled) return null;
    const rateBps = coachRateBps ?? settings.tdsRateBps;
    if (rateBps <= 0) return null;

    const yearStart = financialYearStart(startDate, settings.financialYearStartMonth);
    const earlier = await this.prisma.coachPayrollRecord.findMany({
      where: {
        coachId,
        periodId: { not: periodId },
        period: {
          startDate: { gte: yearStart, lt: startDate },
          status: { not: PayrollPeriodStatus.CANCELLED }
        }
      },
      select: { netPayableMinor: true, tdsMinor: true }
    });

    return {
      version: 1,
      rateBps,
      thresholdMinor: settings.tdsThresholdMinor,
      yearStart: yearStart.toISOString().slice(0, 10),
      priorTaxableMinor: earlier.reduce(
        (sum, record) => sum + Math.max(0, record.netPayableMinor + record.tdsMinor),
        0
      ),
      priorTdsMinor: earlier.reduce((sum, record) => sum + record.tdsMinor, 0)
    };
  }
}

import { ConflictException, Injectable } from "@nestjs/common";
import type { PayrollPeriodItem } from "@nexa-chess/types";
import { PayrollPeriodStatus, type CoachPayrollRecordStatus } from "@prisma/client";
import { MessagingDispatchService } from "../messaging/messaging-dispatch.service";
import { PrismaService } from "../prisma/prisma.service";
import { PayrollAuditService } from "./payroll-audit.service";
import { PayrollCalculationService } from "./payroll-calculation.service";
import { PayrollPeriodService } from "./payroll-period.service";
import { PayslipGenerationService } from "./payslip-generation.service";

/**
 * Everything past the first calculation: recalculate (§25), and the
 * approve → finalize → paid lock sequence (§15/§24/§31). Once FINALIZED, a
 * period's `CoachPayrollRecord` rows never silently change again — the only
 * path forward from there is `PayrollAdjustmentService`'s reversal record
 * before finalization, or a brand-new period.
 */
@Injectable()
export class PayrollLifecycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: PayrollPeriodService,
    private readonly calculation: PayrollCalculationService,
    private readonly audit: PayrollAuditService,
    private readonly messaging: MessagingDispatchService,
    private readonly payslips: PayslipGenerationService
  ) {}

  async recalculate(periodId: string, actorId: string): Promise<PayrollPeriodItem> {
    // PayrollCalculationService.recalculatePeriod itself only accepts REVIEW
    // and throws otherwise — this is a defensive pre-check for a clearer
    // error message plus the audit log, which only makes sense once we know
    // the attempt was actually legal.
    const period = await this.periods.getOrThrow(periodId);
    if (period.status !== PayrollPeriodStatus.REVIEW) {
      throw new ConflictException(
        `Cannot recalculate a period that is ${period.status.toLowerCase()}; only a period in REVIEW can be recalculated.`
      );
    }

    await this.calculation.recalculatePeriod(periodId);
    await this.audit.log({
      entity: "PayrollPeriod",
      entityId: periodId,
      action: "PAYROLL_RECALCULATED",
      userId: actorId
    });
    return this.periods.get(periodId);
  }

  async approve(periodId: string, actorId: string): Promise<PayrollPeriodItem> {
    return this.transition(periodId, actorId, {
      from: PayrollPeriodStatus.REVIEW,
      to: PayrollPeriodStatus.APPROVED,
      recordStatus: "APPROVED",
      periodTimestampField: "approvedAt",
      periodActorField: "approvedById",
      recordTimestampField: "approvedAt",
      action: "PAYROLL_APPROVED"
    });
  }

  async finalize(periodId: string, actorId: string): Promise<PayrollPeriodItem> {
    const result = await this.transition(periodId, actorId, {
      from: PayrollPeriodStatus.APPROVED,
      to: PayrollPeriodStatus.FINALIZED,
      recordStatus: "FINALIZED",
      periodTimestampField: "finalizedAt",
      periodActorField: "finalizedById",
      recordTimestampField: "finalizedAt",
      action: "PAYROLL_FINALIZED"
    });

    // One payslip per coach, queued off the request path — a slow/failed PDF
    // render must never block or undo the finalize itself (mirrors §20's
    // "a failed PDF never touches the payment").
    const records = await this.prisma.coachPayrollRecord.findMany({
      where: { periodId },
      select: { id: true }
    });
    for (const record of records) {
      this.payslips.requestGeneration(record.id);
      this.messaging.dispatchInBackground({
        event: "PAYROLL_FINALIZED",
        payrollRecordId: record.id
      });
    }

    return result;
  }

  async markPaid(periodId: string, actorId: string): Promise<PayrollPeriodItem> {
    return this.transition(periodId, actorId, {
      from: PayrollPeriodStatus.FINALIZED,
      to: PayrollPeriodStatus.PAID,
      recordStatus: "PAID",
      periodTimestampField: "paidAt",
      periodActorField: null,
      recordTimestampField: null,
      action: "PAYROLL_MARKED_PAID"
    });
  }

  async cancel(periodId: string, actorId: string, reason?: string): Promise<PayrollPeriodItem> {
    const period = await this.periods.getOrThrow(periodId);
    if (period.status !== PayrollPeriodStatus.DRAFT && period.status !== PayrollPeriodStatus.REVIEW) {
      throw new ConflictException(
        `Cannot cancel a period that is ${period.status.toLowerCase()}; only DRAFT or REVIEW periods can be cancelled. Once APPROVED, see a coach's individual payout for corrections.`
      );
    }

    const { count } = await this.prisma.payrollPeriod.updateMany({
      where: { id: periodId, status: period.status },
      data: { status: PayrollPeriodStatus.CANCELLED, notes: reason ?? period.notes }
    });
    if (count === 0) {
      throw new ConflictException("This period changed while you were cancelling it. Reload and try again.");
    }
    const updated = await this.periods.getOrThrow(periodId);
    await this.audit.log({
      entity: "PayrollPeriod",
      entityId: periodId,
      action: "PAYROLL_CANCELLED",
      userId: actorId,
      metadata: reason ? { reason } : undefined
    });
    return this.periods.toItem(updated);
  }

  private async transition(
    periodId: string,
    actorId: string,
    config: {
      from: PayrollPeriodStatus;
      to: PayrollPeriodStatus;
      recordStatus: CoachPayrollRecordStatus;
      periodTimestampField: "approvedAt" | "finalizedAt" | "paidAt";
      periodActorField: "approvedById" | "finalizedById" | null;
      recordTimestampField: "approvedAt" | "finalizedAt" | null;
      action: string;
    }
  ): Promise<PayrollPeriodItem> {
    const period = await this.periods.getOrThrow(periodId);
    if (period.status !== config.from) {
      throw new ConflictException(
        `Cannot move a period from ${period.status.toLowerCase()} to ${config.to.toLowerCase()}; it must currently be ${config.from.toLowerCase()}.`
      );
    }

    const now = new Date();
    // Conditional on `from`, so two concurrent requests cannot both pass the
    // check above and both run the side effects (payslips, messages).
    const updated = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.payrollPeriod.updateMany({
        where: { id: periodId, status: config.from },
        data: {
          status: config.to,
          [config.periodTimestampField]: now,
          ...(config.periodActorField ? { [config.periodActorField]: actorId } : {})
        }
      });
      if (count === 0) {
        throw new ConflictException("This period changed while you were updating it. Reload and try again.");
      }

      await tx.coachPayrollRecord.updateMany({
        where: { periodId },
        data: {
          status: config.recordStatus,
          ...(config.recordTimestampField ? { [config.recordTimestampField]: now } : {})
        }
      });
      return tx.payrollPeriod.findUniqueOrThrow({ where: { id: periodId } });
    });

    await this.audit.log({
      entity: "PayrollPeriod",
      entityId: periodId,
      action: config.action,
      userId: actorId
    });

    return this.periods.toItem(updated);
  }
}

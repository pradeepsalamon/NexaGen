import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreatePayrollAdjustmentRequest,
  PayrollAdjustmentItem,
  PayrollAdjustmentListResponse,
  ReversePayrollAdjustmentRequest
} from "@nexa-chess/types";
import type { CoachPayrollRecord, PayrollAdjustment } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { PayrollAuditService } from "./payroll-audit.service";
import { recomputeAdjustmentTotals } from "./payroll-record-totals.util";

const ADJUSTABLE_RECORD_STATUSES = ["CALCULATED", "APPROVED"] as const;

/**
 * Manual earnings/deductions on top of a calculated `CoachPayrollRecord`
 * (§9). Never hard-deleted — a correction is a reversal
 * (`reversedById`/`reversedAt`/`reversalReason`), keeping the row for audit
 * (§23) — matching how §15/§24 forbid silently rewriting a locked record.
 */
@Injectable()
export class PayrollAdjustmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PayrollAuditService
  ) {}

  async list(payrollRecordId: string): Promise<PayrollAdjustmentListResponse> {
    await this.getRecordOrThrow(payrollRecordId);
    const adjustments = await this.prisma.payrollAdjustment.findMany({
      where: { payrollRecordId },
      orderBy: { createdAt: "desc" }
    });
    return { adjustments: adjustments.map((a) => this.toItem(a)) };
  }

  async create(
    payrollRecordId: string,
    actorId: string,
    dto: CreatePayrollAdjustmentRequest
  ): Promise<PayrollAdjustmentItem> {
    const record = await this.getRecordOrThrow(payrollRecordId);
    this.assertAdjustable(record);

    const adjustment = await this.prisma.payrollAdjustment.create({
      data: {
        payrollRecordId,
        type: dto.type,
        description: dto.description,
        amountMinor: dto.amountMinor,
        reason: dto.reason,
        createdById: actorId
      }
    });
    await recomputeAdjustmentTotals(this.prisma, payrollRecordId);

    await this.audit.log({
      entity: "PayrollAdjustment",
      entityId: adjustment.id,
      action: "ADJUSTMENT_CREATED",
      userId: actorId,
      metadata: {
        payrollRecordId,
        type: dto.type,
        amountMinor: dto.amountMinor,
        description: dto.description,
        reason: dto.reason
      }
    });

    return this.toItem(adjustment);
  }

  async reverse(
    adjustmentId: string,
    actorId: string,
    dto: ReversePayrollAdjustmentRequest
  ): Promise<PayrollAdjustmentItem> {
    const adjustment = await this.prisma.payrollAdjustment.findUnique({ where: { id: adjustmentId } });
    if (!adjustment) throw new NotFoundException("Payroll adjustment not found.");
    if (adjustment.reversedAt) throw new ConflictException("This adjustment is already reversed.");

    const record = await this.getRecordOrThrow(adjustment.payrollRecordId);
    this.assertAdjustable(record);

    const updated = await this.prisma.payrollAdjustment.update({
      where: { id: adjustmentId },
      data: { reversedById: actorId, reversedAt: new Date(), reversalReason: dto.reversalReason }
    });
    await recomputeAdjustmentTotals(this.prisma, adjustment.payrollRecordId);

    await this.audit.log({
      entity: "PayrollAdjustment",
      entityId: adjustmentId,
      action: "ADJUSTMENT_REVERSED",
      userId: actorId,
      metadata: { reversalReason: dto.reversalReason }
    });

    return this.toItem(updated);
  }

  private async getRecordOrThrow(payrollRecordId: string): Promise<CoachPayrollRecord> {
    const record = await this.prisma.coachPayrollRecord.findUnique({ where: { id: payrollRecordId } });
    if (!record) throw new NotFoundException("Payroll record not found.");
    return record;
  }

  private assertAdjustable(record: CoachPayrollRecord): void {
    if (!ADJUSTABLE_RECORD_STATUSES.includes(record.status as (typeof ADJUSTABLE_RECORD_STATUSES)[number])) {
      throw new ConflictException(
        `Cannot adjust a payroll record that is ${record.status.toLowerCase()} — only CALCULATED or APPROVED records accept adjustments.`
      );
    }
  }

  private toItem(adjustment: PayrollAdjustment): PayrollAdjustmentItem {
    return {
      id: adjustment.id,
      payrollRecordId: adjustment.payrollRecordId,
      type: adjustment.type,
      description: adjustment.description,
      amountMinor: adjustment.amountMinor,
      reason: adjustment.reason,
      createdById: adjustment.createdById,
      createdAt: adjustment.createdAt.toISOString(),
      reversedById: adjustment.reversedById,
      reversedAt: adjustment.reversedAt?.toISOString() ?? null,
      reversalReason: adjustment.reversalReason
    };
  }
}

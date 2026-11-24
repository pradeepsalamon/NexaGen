import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreatePayrollAdjustmentRequest,
  PayrollAdjustmentItem,
  PayrollAdjustmentListResponse,
  ReversePayrollAdjustmentRequest
} from "@nexa-chess/types";
import type { CoachPayrollRecord, PayrollAdjustment } from "@prisma/client";
import { PrismaService, type PrismaTransactionClient } from "../prisma/prisma.service";
import { PayrollAuditService } from "./payroll-audit.service";
import { lockAndReadRecord, recomputeAdjustmentTotalsTx } from "./payroll-record-totals.util";

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
    const record = await this.prisma.coachPayrollRecord.findUnique({ select: { id: true }, where: { id: payrollRecordId } });
    if (!record) throw new NotFoundException("Payroll record not found.");
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
    // Check, insert and recompute under the record's row lock in one
    // transaction (review R2): a finalize that commits first is seen here,
    // and one that comes later waits for this adjustment.
    const adjustment = await this.prisma.$transaction(async (tx) => {
      const record = await this.lockedRecordOrThrow(tx, payrollRecordId);
      this.assertNotOwnRecord(record, actorId);
      this.assertAdjustable(record);
      const created = await tx.payrollAdjustment.create({
        data: {
          payrollRecordId,
          type: dto.type,
          description: dto.description,
          amountMinor: dto.amountMinor,
          reason: dto.reason,
          createdById: actorId
        }
      });
      await recomputeAdjustmentTotalsTx(tx, payrollRecordId);
      return created;
    });

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

    // Same lock as create (review R2); the reversal is claimed so two clicks
    // can't both reverse it.
    const updated = await this.prisma.$transaction(async (tx) => {
      const record = await this.lockedRecordOrThrow(tx, adjustment.payrollRecordId);
      this.assertNotOwnRecord(record, actorId);
      this.assertAdjustable(record);
      const { count } = await tx.payrollAdjustment.updateMany({
        where: { id: adjustmentId, reversedAt: null },
        data: { reversedById: actorId, reversedAt: new Date(), reversalReason: dto.reversalReason }
      });
      if (count === 0) throw new ConflictException("This adjustment is already reversed.");
      await recomputeAdjustmentTotalsTx(tx, adjustment.payrollRecordId);
      return tx.payrollAdjustment.findUniqueOrThrow({ where: { id: adjustmentId } });
    });

    await this.audit.log({
      entity: "PayrollAdjustment",
      entityId: adjustmentId,
      action: "ADJUSTMENT_REVERSED",
      userId: actorId,
      metadata: { payrollRecordId: adjustment.payrollRecordId, reversalReason: dto.reversalReason }
    });

    return this.toItem(updated);
  }

  private async lockedRecordOrThrow(tx: PrismaTransactionClient, payrollRecordId: string): Promise<CoachPayrollRecord> {
    const record = await lockAndReadRecord(tx, payrollRecordId);
    if (!record) throw new NotFoundException("Payroll record not found.");
    return record;
  }

  /** An admin who also teaches never adjusts their own pay (review R8). */
  private assertNotOwnRecord(record: CoachPayrollRecord, actorId: string): void {
    if (record.coachId === actorId) {
      throw new ForbiddenException("You can't adjust your own payroll. Ask another admin.");
    }
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

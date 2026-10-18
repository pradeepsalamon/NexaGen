import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type PayrollAuditEntity =
  | "PayrollPeriod"
  | "CoachPayrollRecord"
  | "PayrollAdjustment"
  | "CoachCompensationProfile"
  | "CoachCompensationRate"
  | "PayrollRule"
  | "CoachPayout"
  | "Payslip";

/**
 * Payroll's audit trail (§23). Reuses the existing generic `TrashAuditLog`
 * table (already reused beyond its original name for e.g.
 * `LIVE_SETTINGS_CHANGE`) rather than a new model — same
 * entity/entityId/action/userId/metadata shape.
 */
@Injectable()
export class PayrollAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(params: {
    entity: PayrollAuditEntity;
    entityId: string;
    action: string;
    userId?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    await this.prisma.trashAuditLog.create({
      data: {
        entity: params.entity,
        entityId: params.entityId,
        action: params.action,
        userId: params.userId ?? null,
        metadata: sanitize(params.metadata) as Prisma.InputJsonValue | undefined
      }
    });
  }

  async listForRecord(payrollRecordId: string) {
    return this.prisma.trashAuditLog.findMany({
      where: { entity: "CoachPayrollRecord", entityId: payrollRecordId },
      orderBy: { createdAt: "desc" }
    });
  }
}

/**
 * Defense in depth: bank/UPI details must never land in an audit log any
 * admin listing can render. Strips a top-level `paymentDetails` key even if
 * a caller accidentally passed a whole `CoachCompensationProfile` row.
 */
function sanitize(metadata: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!metadata || !("paymentDetails" in metadata)) return metadata;
  const { paymentDetails: _paymentDetails, ...rest } = metadata;
  return rest;
}

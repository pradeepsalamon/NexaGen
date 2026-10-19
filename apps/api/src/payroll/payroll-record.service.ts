import { NotFoundException, Injectable } from "@nestjs/common";
import type {
  CoachPayrollRecordItem,
  CoachPayrollRecordListResponse,
  PayrollEarningsBreakdown
} from "@nexa-chess/types";
import type { CoachPayrollRecord, PayrollPeriod, User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { fullName } from "../payments/payments-auth.helper";

type RecordWithRelations = CoachPayrollRecord & {
  coach: Pick<User, "firstName" | "lastName" | "email">;
  period: Pick<PayrollPeriod, "periodType" | "startDate" | "endDate" | "status">;
};

const INCLUDE = {
  coach: { select: { firstName: true, lastName: true, email: true } },
  period: { select: { periodType: true, startDate: true, endDate: true, status: true } }
} as const;

/** Read access to `CoachPayrollRecord` rows — no mutation lives here. */
@Injectable()
export class PayrollRecordService {
  constructor(private readonly prisma: PrismaService) {}

  async listForPeriod(periodId: string): Promise<CoachPayrollRecordListResponse> {
    const records = await this.prisma.coachPayrollRecord.findMany({
      where: { periodId },
      include: INCLUDE,
      orderBy: { netPayableMinor: "desc" }
    });
    return { records: records.map((r) => this.toItem(r)) };
  }

  async listForCoach(coachId: string): Promise<CoachPayrollRecordListResponse> {
    const records = await this.prisma.coachPayrollRecord.findMany({
      where: { coachId },
      include: INCLUDE,
      orderBy: { createdAt: "desc" }
    });
    return { records: records.map((r) => this.toItem(r)) };
  }

  async getOrThrow(id: string): Promise<CoachPayrollRecord> {
    const record = await this.prisma.coachPayrollRecord.findUnique({ where: { id } });
    if (!record) throw new NotFoundException("Payroll record not found.");
    return record;
  }

  async get(id: string): Promise<CoachPayrollRecordItem> {
    const record = await this.prisma.coachPayrollRecord.findUnique({
      where: { id },
      include: INCLUDE
    });
    if (!record) throw new NotFoundException("Payroll record not found.");
    return this.toItem(record);
  }

  toItem(record: RecordWithRelations): CoachPayrollRecordItem {
    return {
      id: record.id,
      periodId: record.periodId,
      period: {
        periodType: record.period.periodType,
        startDate: record.period.startDate.toISOString().slice(0, 10),
        endDate: record.period.endDate.toISOString().slice(0, 10),
        status: record.period.status
      },
      coachId: record.coachId,
      coachName: fullName(record.coach) ?? record.coach.email,
      coachEmail: record.coach.email,
      status: record.status,
      scheduledClassesCount: record.scheduledClassesCount,
      completedClassesCount: record.completedClassesCount,
      cancelledByCoachCount: record.cancelledByCoachCount,
      cancelledByStudentCount: record.cancelledByStudentCount,
      cancelledByAdminCount: record.cancelledByAdminCount,
      noShowCount: record.noShowCount,
      totalTeachingSeconds: record.totalTeachingSeconds,
      totalBoardSeconds: record.totalBoardSeconds,
      earningsBreakdown: record.earningsBreakdown as PayrollEarningsBreakdown | null,
      grossEarningsMinor: record.grossEarningsMinor,
      totalDeductionsMinor: record.totalDeductionsMinor,
      totalAdjustmentsMinor: record.totalAdjustmentsMinor,
      netPayableMinor: record.netPayableMinor,
      calculatedAt: record.calculatedAt?.toISOString() ?? null,
      reviewedAt: record.reviewedAt?.toISOString() ?? null,
      approvedAt: record.approvedAt?.toISOString() ?? null,
      finalizedAt: record.finalizedAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString()
    };
  }
}

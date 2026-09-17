import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreatePayrollPeriodRequest,
  PayrollPeriodItem,
  PayrollPeriodListResponse
} from "@nexa-chess/types";
import { Prisma, type PayrollPeriod } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Payroll period CRUD + read access. Status transitions past DRAFT live in
 * `payroll-calculation.service.ts` (→ CALCULATING/REVIEW) and
 * `payroll-lifecycle.service.ts` (→ APPROVED/FINALIZED/PAID/CANCELLED, Phase 3)
 * — this service only creates/reads periods.
 */
@Injectable()
export class PayrollPeriodService {
  constructor(private readonly prisma: PrismaService) {}

  async create(adminId: string, body: CreatePayrollPeriodRequest): Promise<PayrollPeriodItem> {
    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    if (endDate <= startDate) {
      throw new ConflictException("endDate must be after startDate.");
    }

    try {
      const period = await this.prisma.payrollPeriod.create({
        data: {
          periodType: body.periodType,
          startDate,
          endDate,
          notes: body.notes,
          createdById: adminId
        }
      });
      return this.toItem(period);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("A payroll period with this type and date range already exists.");
      }
      throw error;
    }
  }

  async list(): Promise<PayrollPeriodListResponse> {
    const periods = await this.prisma.payrollPeriod.findMany({
      orderBy: { startDate: "desc" }
    });
    return { periods: periods.map((p) => this.toItem(p)) };
  }

  async getOrThrow(id: string): Promise<PayrollPeriod> {
    const period = await this.prisma.payrollPeriod.findUnique({ where: { id } });
    if (!period) throw new NotFoundException("Payroll period not found.");
    return period;
  }

  async get(id: string): Promise<PayrollPeriodItem> {
    return this.toItem(await this.getOrThrow(id));
  }

  toItem(period: PayrollPeriod): PayrollPeriodItem {
    return {
      id: period.id,
      periodType: period.periodType,
      startDate: period.startDate.toISOString().slice(0, 10),
      endDate: period.endDate.toISOString().slice(0, 10),
      status: period.status,
      createdById: period.createdById,
      calculatedAt: period.calculatedAt?.toISOString() ?? null,
      approvedById: period.approvedById,
      approvedAt: period.approvedAt?.toISOString() ?? null,
      finalizedById: period.finalizedById,
      finalizedAt: period.finalizedAt?.toISOString() ?? null,
      paidAt: period.paidAt?.toISOString() ?? null,
      notes: period.notes,
      createdAt: period.createdAt.toISOString(),
      updatedAt: period.updatedAt.toISOString()
    };
  }
}

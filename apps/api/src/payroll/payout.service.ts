import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CoachPayoutItem,
  CoachPayoutListResponse,
  MarkPayoutPaidRequest
} from "@nexa-chess/types";
import { Prisma, type CoachPayout } from "@prisma/client";
import { MessagingDispatchService } from "../messaging/messaging-dispatch.service";
import { PrismaService } from "../prisma/prisma.service";
import { PayrollAuditService } from "./payroll-audit.service";

const PAYABLE_RECORD_STATUSES = ["FINALIZED", "PAID"] as const;

/**
 * Payout tracking, deliberately separate from the payroll calculation itself
 * (§22). With no bank-transfer integration yet, "Mark as Paid Manually" with
 * a reference/date/method/notes is the only path to PAID — matching how
 * `CoachPayout` is the one new model exempt from the "reuse existing patterns"
 * rule (there is no payments-side analogue: money flows out, not in).
 */
@Injectable()
export class PayoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PayrollAuditService,
    private readonly messaging: MessagingDispatchService
  ) {}

  async listForPeriod(periodId: string): Promise<CoachPayoutListResponse> {
    const payouts = await this.prisma.coachPayout.findMany({
      where: { payrollRecord: { periodId } },
      orderBy: { createdAt: "desc" }
    });
    return { payouts: payouts.map((p) => this.toItem(p)) };
  }

  async get(id: string): Promise<CoachPayoutItem> {
    return this.toItem(await this.getOrThrow(id));
  }

  /** Idempotent: returns the existing payout for a record rather than duplicating it. */
  async createForRecord(payrollRecordId: string, actorId: string): Promise<CoachPayoutItem> {
    const existing = await this.prisma.coachPayout.findUnique({ where: { payrollRecordId } });
    if (existing) return this.toItem(existing);

    const record = await this.prisma.coachPayrollRecord.findUnique({ where: { id: payrollRecordId } });
    if (!record) throw new NotFoundException("Payroll record not found.");
    if (!PAYABLE_RECORD_STATUSES.includes(record.status as (typeof PAYABLE_RECORD_STATUSES)[number])) {
      throw new ConflictException(
        `Cannot create a payout for a record that is ${record.status.toLowerCase()} — it must be FINALIZED first.`
      );
    }

    let payout: CoachPayout;
    try {
      payout = await this.prisma.coachPayout.create({
        data: { payrollRecordId, adminId: actorId, status: "PENDING" }
      });
    } catch (error) {
      // A concurrent request created it first.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const raced = await this.prisma.coachPayout.findUnique({ where: { payrollRecordId } });
        if (raced) return this.toItem(raced);
      }
      throw error;
    }

    await this.audit.log({
      entity: "CoachPayout",
      entityId: payout.id,
      action: "PAYOUT_CREATED",
      userId: actorId,
      metadata: { payrollRecordId }
    });

    return this.toItem(payout);
  }

  async markPaid(id: string, actorId: string, dto: MarkPayoutPaidRequest): Promise<CoachPayoutItem> {
    const existing = await this.getOrThrow(id);
    if (existing.status === "PAID") {
      throw new ConflictException("This payout is already marked paid.");
    }

    const payout = await this.prisma.$transaction(async (tx) => {
      // Conditional so two concurrent submits cannot both mark it paid.
      const { count } = await tx.coachPayout.updateMany({
        where: { id, status: { not: "PAID" } },
        data: {
          status: "PAID",
          reference: dto.reference,
          method: dto.method,
          paidAt: new Date(dto.paidAt),
          notes: dto.notes,
          adminId: actorId
        }
      });
      if (count === 0) throw new ConflictException("This payout is already marked paid.");

      // Only this coach's record moves to PAID — the period-level PAID status
      // (every coach paid) is a separate, explicit admin action
      // (`PayrollLifecycleService.markPaid`), not auto-derived here.
      await tx.coachPayrollRecord.update({
        where: { id: existing.payrollRecordId },
        data: { status: "PAID" }
      });
      return tx.coachPayout.findUniqueOrThrow({ where: { id } });
    });

    this.messaging.dispatchInBackground({
      event: "PAYROLL_PAID",
      payrollRecordId: existing.payrollRecordId
    });

    await this.audit.log({
      entity: "CoachPayout",
      entityId: id,
      action: "PAYOUT_MARKED_PAID",
      userId: actorId,
      metadata: { reference: dto.reference, method: dto.method, payrollRecordId: existing.payrollRecordId }
    });

    return this.toItem(payout);
  }

  private async getOrThrow(id: string): Promise<CoachPayout> {
    const payout = await this.prisma.coachPayout.findUnique({ where: { id } });
    if (!payout) throw new NotFoundException("Payout not found.");
    return payout;
  }

  private toItem(payout: CoachPayout): CoachPayoutItem {
    return {
      id: payout.id,
      payrollRecordId: payout.payrollRecordId,
      status: payout.status,
      method: payout.method,
      reference: payout.reference,
      paidAt: payout.paidAt?.toISOString() ?? null,
      notes: payout.notes,
      adminId: payout.adminId,
      createdAt: payout.createdAt.toISOString(),
      updatedAt: payout.updatedAt.toISOString()
    };
  }
}

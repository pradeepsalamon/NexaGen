import type { PrismaService, PrismaTransactionClient } from "../prisma/prisma.service";

/**
 * `netPayableMinor` always derives from three columns already on the row:
 * gross earnings (from the engine), rule-based deductions (also from the
 * engine), and manual adjustments (§9, tracked separately by
 * payroll-adjustment.service.ts). These two helpers are the only writers of
 * `netPayableMinor` — recalculating base numbers must never clobber
 * adjustments a coach already reviewed, and adding an adjustment must never
 * touch the base numbers.
 */

/**
 * Each recompute runs in a transaction holding the record's row lock, so two
 * concurrent adjustments serialize: the later one reads the earlier one's
 * committed rows instead of overwriting the total with a stale sum.
 */
async function lockRecord(tx: PrismaTransactionClient, payrollRecordId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "coach_payroll_records" WHERE id = ${payrollRecordId} FOR UPDATE`;
}

async function writeNetPayable(tx: PrismaTransactionClient, payrollRecordId: string): Promise<void> {
  const record = await tx.coachPayrollRecord.findUniqueOrThrow({
    where: { id: payrollRecordId },
    select: { grossEarningsMinor: true, totalDeductionsMinor: true, totalAdjustmentsMinor: true }
  });
  await tx.coachPayrollRecord.update({
    where: { id: payrollRecordId },
    data: {
      netPayableMinor:
        record.grossEarningsMinor - record.totalDeductionsMinor + record.totalAdjustmentsMinor
    }
  });
}

/** Re-derives netPayableMinor from the record's current gross/deductions/adjustments columns. */
export async function recomputeNetPayable(prisma: PrismaService, payrollRecordId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockRecord(tx, payrollRecordId);
    await writeNetPayable(tx, payrollRecordId);
  });
}

/** Re-sums every non-reversed adjustment into totalAdjustmentsMinor, then re-derives netPayableMinor. */
export async function recomputeAdjustmentTotals(
  prisma: PrismaService,
  payrollRecordId: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockRecord(tx, payrollRecordId);
    const activeAdjustments = await tx.payrollAdjustment.findMany({
      where: { payrollRecordId, reversedAt: null }
    });
    const totalAdjustmentsMinor = activeAdjustments.reduce(
      (sum, a) => sum + (a.type === "EARNING" ? a.amountMinor : -a.amountMinor),
      0
    );
    await tx.coachPayrollRecord.update({
      where: { id: payrollRecordId },
      data: { totalAdjustmentsMinor }
    });
    await writeNetPayable(tx, payrollRecordId);
  });
}

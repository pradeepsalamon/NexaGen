import type { PrismaService } from "../prisma/prisma.service";

/**
 * `netPayableMinor` always derives from three columns already on the row:
 * gross earnings (from the engine), rule-based deductions (also from the
 * engine), and manual adjustments (§9, tracked separately by
 * payroll-adjustment.service.ts). These two helpers are the only writers of
 * `netPayableMinor` — recalculating base numbers must never clobber
 * adjustments a coach already reviewed, and adding an adjustment must never
 * touch the base numbers.
 */

/** Re-derives netPayableMinor from the record's current gross/deductions/adjustments columns. */
export async function recomputeNetPayable(prisma: PrismaService, payrollRecordId: string): Promise<void> {
  const record = await prisma.coachPayrollRecord.findUniqueOrThrow({
    where: { id: payrollRecordId },
    select: { grossEarningsMinor: true, totalDeductionsMinor: true, totalAdjustmentsMinor: true }
  });
  await prisma.coachPayrollRecord.update({
    where: { id: payrollRecordId },
    data: {
      netPayableMinor:
        record.grossEarningsMinor - record.totalDeductionsMinor + record.totalAdjustmentsMinor
    }
  });
}

/** Re-sums every non-reversed adjustment into totalAdjustmentsMinor, then re-derives netPayableMinor. */
export async function recomputeAdjustmentTotals(
  prisma: PrismaService,
  payrollRecordId: string
): Promise<void> {
  const activeAdjustments = await prisma.payrollAdjustment.findMany({
    where: { payrollRecordId, reversedAt: null }
  });
  const totalAdjustmentsMinor = activeAdjustments.reduce(
    (sum, a) => sum + (a.type === "EARNING" ? a.amountMinor : -a.amountMinor),
    0
  );
  await prisma.coachPayrollRecord.update({
    where: { id: payrollRecordId },
    data: { totalAdjustmentsMinor }
  });
  await recomputeNetPayable(prisma, payrollRecordId);
}

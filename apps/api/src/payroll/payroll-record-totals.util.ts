import { computeTds, payrollTdsSnapshotSchema, type PayrollTdsSnapshot } from "@nexa-chess/types";
import type { PrismaService, PrismaTransactionClient } from "../prisma/prisma.service";

/**
 * `netPayableMinor` always derives from columns already on the row: gross
 * earnings (from the engine), rule-based deductions (also from the engine),
 * manual adjustments (§9, tracked separately by
 * payroll-adjustment.service.ts) and TDS. These two helpers are the only
 * writers of `netPayableMinor` and `tdsMinor` — recalculating base numbers
 * must never clobber adjustments a coach already reviewed, and adding an
 * adjustment must never touch the base numbers.
 *
 * TDS is worked out here, not in the engine, because an adjustment changes
 * what the record pays: it is `computeTds` of the pay before TDS, using the
 * terms frozen on the record when it was calculated (`tdsSnapshot`).
 */

/** The record's frozen TDS terms; null (no TDS) when absent or unreadable. */
export function readTdsSnapshot(value: unknown): PayrollTdsSnapshot | null {
  const parsed = payrollTdsSnapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

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
    select: {
      grossEarningsMinor: true,
      tdsSnapshot: true,
      totalAdjustmentsMinor: true,
      totalDeductionsMinor: true
    }
  });
  const beforeTdsMinor =
    record.grossEarningsMinor - record.totalDeductionsMinor + record.totalAdjustmentsMinor;
  const snapshot = readTdsSnapshot(record.tdsSnapshot);
  const tdsMinor = snapshot ? computeTds(snapshot, beforeTdsMinor) : 0;
  await tx.coachPayrollRecord.update({
    where: { id: payrollRecordId },
    data: { netPayableMinor: beforeTdsMinor - tdsMinor, tdsMinor }
  });
}

/** Re-derives tdsMinor and netPayableMinor from the record's current gross/deductions/adjustments columns. */
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
  await prisma.$transaction((tx) => recomputeAdjustmentTotalsTx(tx, payrollRecordId));
}

/** The same, inside the caller's transaction (it takes the record's row lock). */
export async function recomputeAdjustmentTotalsTx(
  tx: PrismaTransactionClient,
  payrollRecordId: string
): Promise<void> {
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
}

/**
 * Locks the record and returns it as committed, for a check that must hold
 * until the caller's write commits (review R2: an adjustment must not land on
 * a record finalized in between).
 */
export async function lockAndReadRecord(tx: PrismaTransactionClient, payrollRecordId: string) {
  await lockRecord(tx, payrollRecordId);
  return tx.coachPayrollRecord.findUnique({ where: { id: payrollRecordId } });
}

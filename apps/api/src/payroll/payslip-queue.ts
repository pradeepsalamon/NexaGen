/**
 * The payslip background queue.
 *
 * A feature module owns its queue name (no central registry — README
 * § "Background Jobs"), so the constant and its job payload live here beside
 * the producer and processor that use them. Mirrors payments/invoice-queue.ts.
 */
export const PAYSLIP_QUEUE = "payslip";

export const PAYSLIP_JOBS = {
  generatePayslipPdf: "generate-payslip-pdf"
} as const;

export type GeneratePayslipPdfJob = {
  payslipId: string;
  /** Re-render even when a PDF already exists (an admin-forced retry). */
  force?: boolean;
};

/**
 * Idempotency handle for a job. Separated with "--", NOT ":" — BullMQ builds
 * its Redis keys by joining on a colon and rejects a custom id containing
 * one ("Custom Id cannot contain :"), which would make every enqueue throw
 * and leave the PDF to the sweep (payments/invoice-queue.ts hit this first).
 */
export function payslipPdfJobId(payslipId: string, force = false): string {
  return force ? `payslip-pdf--${payslipId}--${Date.now()}` : `payslip-pdf--${payslipId}`;
}

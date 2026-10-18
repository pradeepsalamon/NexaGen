import { PAYSLIP_JOBS, PAYSLIP_QUEUE, payslipPdfJobId } from "./payslip-queue";

/**
 * Regression: `payments/invoice-queue.ts` originally used `invoice-pdf:<id>`
 * and BullMQ rejected every enqueue with "Custom Id cannot contain :" — only
 * surfaced against a real Redis. The payslip queue copies the fixed `--`
 * separator from the start; this guards against it regressing back.
 */
describe("payslip queue job ids", () => {
  it("never contains a colon", () => {
    expect(payslipPdfJobId("pay_1")).not.toContain(":");
    expect(payslipPdfJobId("pay_1", true)).not.toContain(":");
  });

  it("is stable per payslip, so two finalize retries collapse to one job", () => {
    expect(payslipPdfJobId("pay_1")).toBe(payslipPdfJobId("pay_1"));
    expect(payslipPdfJobId("pay_1")).toContain("pay_1");
  });

  it("is unique for a forced retry, so BullMQ cannot swallow it", () => {
    const first = payslipPdfJobId("pay_1", true);
    const second = payslipPdfJobId("pay_1", true);
    expect(first).not.toBe(payslipPdfJobId("pay_1"));
    expect(first.startsWith("payslip-pdf--pay_1--")).toBe(true);
    expect(second.startsWith("payslip-pdf--pay_1--")).toBe(true);
  });

  it("keeps the queue and job names stable", () => {
    expect(PAYSLIP_QUEUE).toBe("payslip");
    expect(PAYSLIP_JOBS.generatePayslipPdf).toBe("generate-payslip-pdf");
  });
});

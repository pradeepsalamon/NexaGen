import {
  creditNotePdfJobId,
  INVOICE_JOBS,
  INVOICE_QUEUE,
  invoicePdfJobId
} from "./invoice-queue";

/**
 * Regression: the first cut used `invoice-pdf:<id>` and BullMQ rejected every
 * enqueue with "Custom Id cannot contain :". Nothing surfaced in unit tests —
 * it only appeared against a real Redis — and the effect in production would
 * have been every invoice PDF silently falling back to the 10-minute sweep.
 */
describe("invoice queue job ids", () => {
  it("never contains a colon, which BullMQ reserves for its key separator", () => {
    expect(invoicePdfJobId("inv_1")).not.toContain(":");
    expect(invoicePdfJobId("inv_1", true)).not.toContain(":");
    expect(creditNotePdfJobId("cn_1")).not.toContain(":");
    expect(creditNotePdfJobId("cn_1", true)).not.toContain(":");
  });

  it("is stable per row, so redelivered webhooks collapse to one job", () => {
    expect(invoicePdfJobId("inv_1")).toBe(invoicePdfJobId("inv_1"));
    expect(invoicePdfJobId("inv_1")).toContain("inv_1");
  });

  it("is unique for a forced retry, so BullMQ cannot swallow it", () => {
    const first = invoicePdfJobId("inv_1", true);
    const second = invoicePdfJobId("inv_1", true);
    // Same row, different job: a completed job lingers 24h under its id.
    expect(first).not.toBe(invoicePdfJobId("inv_1"));
    expect(first.startsWith("invoice-pdf--inv_1--")).toBe(true);
    expect(second.startsWith("invoice-pdf--inv_1--")).toBe(true);
  });

  it("keeps the queue and job names stable", () => {
    expect(INVOICE_QUEUE).toBe("invoice");
    expect(INVOICE_JOBS.generateInvoicePdf).toBe("generate-invoice-pdf");
    expect(INVOICE_JOBS.generateCreditNotePdf).toBe("generate-credit-note-pdf");
  });
});

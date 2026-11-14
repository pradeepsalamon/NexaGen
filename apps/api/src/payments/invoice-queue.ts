/**
 * The invoice background queue.
 *
 * A feature module owns its queue name (there is no central registry — see
 * docs/INFRASTRUCTURE.md), so the constant and its job payloads live here
 * beside the producer and the processor that use them.
 */
export const INVOICE_QUEUE = "invoice";

export const INVOICE_JOBS = {
  /** Render + archive an invoice PDF, then email it. */
  generateInvoicePdf: "generate-invoice-pdf",
  /** Render + archive a credit note PDF. */
  generateCreditNotePdf: "generate-credit-note-pdf"
} as const;

export type GenerateInvoicePdfJob = {
  invoiceId: string;
  /** Re-render even when a PDF already exists (an admin-forced retry). */
  force?: boolean;
  /** False suppresses the receipt email; the PDF is still built. */
  sendEmail?: boolean;
};

export type GenerateCreditNotePdfJob = {
  creditNoteId: string;
  force?: boolean;
};

/**
 * Idempotency handle for a job (docs/INFRASTRUCTURE.md: "pass a `jobId` derived from your own
 * row"). Two webhook redeliveries for one capture collapse to a single job
 * rather than rendering the same invoice twice.
 *
 * A forced retry deliberately gets a unique id: BullMQ ignores an `add` whose
 * jobId still exists, and a completed job lingers for 24h, so reusing the id
 * would silently swallow the admin's "Regenerate PDF".
 *
 * Separated with "--", NOT ":". BullMQ builds its Redis keys by joining on a
 * colon and rejects a custom id containing one ("Custom Id cannot contain :"),
 * which would make every enqueue throw and leave the PDF to the sweep.
 */
export function invoicePdfJobId(invoiceId: string, force = false): string {
  return force
    ? `invoice-pdf--${invoiceId}--${Date.now()}`
    : `invoice-pdf--${invoiceId}`;
}

export function creditNotePdfJobId(creditNoteId: string, force = false): string {
  return force
    ? `credit-note-pdf--${creditNoteId}--${Date.now()}`
    : `credit-note-pdf--${creditNoteId}`;
}

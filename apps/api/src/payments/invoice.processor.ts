import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { getApiEnv } from "@nexa-chess/config/api";
import type { Job } from "bullmq";
import { buildWorkerOptions } from "../queue/queue.config";
import { InvoiceGenerationService } from "./invoice-generation.service";
import {
  INVOICE_JOBS,
  INVOICE_QUEUE,
  type GenerateCreditNotePdfJob,
  type GenerateInvoicePdfJob
} from "./invoice-queue";

/**
 * Renders invoice and credit-note PDFs off the request path.
 *
 * Why a queue rather than the fire-and-forget promise this replaced: a promise
 * dies with the process. A container restarted mid-render (a deploy, an OOM)
 * lost the work and the invoice sat `PENDING` until the 10-minute sweep noticed.
 * A BullMQ job survives the restart, retries with backoff on its own, and keeps
 * its failures for a week so they can be inspected.
 *
 * The sweep is still there and still matters — it is the safety net for the
 * case where Redis is unset (jobs are dropped) or a job is lost entirely. The
 * `pdfStatus` column is the source of truth either way; the queue is a nudge.
 */
@Processor(INVOICE_QUEUE, buildWorkerOptions(getApiEnv()))
export class InvoiceProcessor extends WorkerHost {
  private readonly logger = new Logger(InvoiceProcessor.name);

  constructor(private readonly generation: InvoiceGenerationService) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case INVOICE_JOBS.generateInvoicePdf: {
        const data = job.data as GenerateInvoicePdfJob;
        // Deliberately awaited and allowed to throw: a throw is what tells
        // BullMQ to retry. `generateAndDeliver` swallows render failures into
        // `pdfStatus: FAILED`, so only an unexpected fault reaches here.
        await this.generation.generateAndDeliver(data.invoiceId, {
          force: data.force,
          sendEmail: data.sendEmail
        });
        return;
      }

      case INVOICE_JOBS.generateCreditNotePdf: {
        const data = job.data as GenerateCreditNotePdfJob;
        await this.generation.generateCreditNote(data.creditNoteId, data.force);
        return;
      }

      default:
        this.logger.warn(`Unknown invoice job "${job.name}" — ignoring.`);
    }
  }
}

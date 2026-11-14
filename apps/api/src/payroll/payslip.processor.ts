import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { getApiEnv } from "@nexa-chess/config/api";
import type { Job } from "bullmq";
import { buildWorkerOptions } from "../queue/queue.config";
import { PayslipGenerationService } from "./payslip-generation.service";
import { PAYSLIP_JOBS, PAYSLIP_QUEUE, type GeneratePayslipPdfJob } from "./payslip-queue";

/**
 * Renders payslip PDFs off the request path — mirrors
 * `payments/invoice.processor.ts`. `pdfStatus` is the source of truth either
 * way; the queue is a nudge, and the 10-minute sweep is the safety net for
 * a dropped job (REDIS_URL unset) or a lost one.
 */
@Processor(PAYSLIP_QUEUE, buildWorkerOptions(getApiEnv()))
export class PayslipProcessor extends WorkerHost {
  private readonly logger = new Logger(PayslipProcessor.name);

  constructor(private readonly generation: PayslipGenerationService) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case PAYSLIP_JOBS.generatePayslipPdf: {
        const data = job.data as GeneratePayslipPdfJob;
        await this.generation.generate(data.payslipId, data.force);
        return;
      }
      default:
        this.logger.warn(`Unknown payslip job "${job.name}" — ignoring.`);
    }
  }
}

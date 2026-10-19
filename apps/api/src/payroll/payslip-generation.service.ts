import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { getApiEnv } from "@nexa-chess/config/api";
import {
  documentKindForEngagement,
  formatPayslipNumber,
  type PayslipDocument
} from "@nexa-chess/types";
import { PayslipPdfStatus, Prisma } from "@prisma/client";
import type { Queue } from "bullmq";
import { JOB_LOCKS, JobLockService, type JobLockName } from "../prisma/job-lock.service";
import { PrismaService, type PrismaTransactionClient } from "../prisma/prisma.service";
import { isQueueEnabled } from "../queue/queue.config";
import { fullName } from "../payments/payments-auth.helper";
import { payslipPdfJobId, PAYSLIP_JOBS, PAYSLIP_QUEUE } from "./payslip-queue";
import { PayslipPdfService } from "./payslip-pdf.service";
import { PayslipStorageService } from "./payslip-storage.service";

const MAX_PDF_ATTEMPTS = 5;

/**
 * Payslip creation, PDF generation and retry (§16/§20-equivalent).
 *
 * Mirrors `payments/invoice-generation.service.ts`: a failed render never
 * touches the payroll record's financial status — generation runs entirely
 * after finalization, a failure parks the row at `pdfStatus: FAILED`, and the
 * sweep below retries it. A payslip document number, once allocated, is
 * never reused, gapless within a year — same as `InvoiceSequence`.
 */
@Injectable()
export class PayslipGenerationService {

  private readonly logger = new Logger(PayslipGenerationService.name);
  private readonly queueEnabled = isQueueEnabled(getApiEnv());

  constructor(
    @InjectQueue(PAYSLIP_QUEUE) private readonly queue: Queue,
    private readonly jobLocks: JobLockService,
    private readonly pdf: PayslipPdfService,
    private readonly prisma: PrismaService,
    private readonly storage: PayslipStorageService
  ) {}

  // ────────────────────────────────────────────────
  // Requesting
  // ────────────────────────────────────────────────

  /**
   * Creates the `Payslip` row (if one doesn't already exist for this record)
   * and queues its render. Called once per coach when a period finalizes.
   * Never throws — a payslip failing to queue must not undo the finalize.
   */
  requestGeneration(payrollRecordId: string): void {
    void this.ensureAndEnqueue(payrollRecordId).catch((error) => {
      this.logger.error(
        `Payslip for record ${payrollRecordId} could not be started: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    });
  }

  private async ensureAndEnqueue(payrollRecordId: string): Promise<void> {
    const payslipId = await this.ensurePayslip(payrollRecordId);
    await this.enqueue(payslipId);
  }

  async ensurePayslip(payrollRecordId: string): Promise<string> {
    const existing = await this.prisma.payslip.findUnique({ where: { payrollRecordId } });
    if (existing) return existing.id;

    const record = await this.prisma.coachPayrollRecord.findUniqueOrThrow({
      where: { id: payrollRecordId }
    });
    const profile = await this.prisma.coachCompensationProfile.findUnique({
      where: { coachId: record.coachId }
    });
    const engagementType = profile?.engagementType ?? "EMPLOYEE";

    // Number and row in one transaction, so a failed create gives the number back.
    try {
      const payslip = await this.prisma.$transaction(async (tx) => {
        const documentNumber = await this.allocateDocumentNumber(tx);
        return tx.payslip.create({
          data: {
            documentNumber,
            payrollRecordId,
            documentKind: documentKindForEngagement(engagementType),
            engagementTypeAtIssue: engagementType,
            issuedAt: new Date(),
            pdfStatus: PayslipPdfStatus.PENDING
          }
        });
      });
      return payslip.id;
    } catch (error) {
      // A concurrent finalize created this record's payslip first.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const raced = await this.prisma.payslip.findUnique({ where: { payrollRecordId } });
        if (raced) return raced.id;
      }
      throw error;
    }
  }

  private async allocateDocumentNumber(tx: PrismaTransactionClient): Promise<string> {
    const year = new Date().getUTCFullYear();
    const sequence = await tx.payslipSequence.upsert({
      where: { year },
      create: { year, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } }
    });
    return formatPayslipNumber(year, sequence.lastNumber);
  }

  /** Puts the render on the queue, or runs it inline when queues are disabled. */
  async enqueue(payslipId: string, options?: { force?: boolean }): Promise<void> {
    if (!this.queueEnabled) {
      await this.generate(payslipId, options?.force ?? false);
      return;
    }

    await this.queue.add(
      PAYSLIP_JOBS.generatePayslipPdf,
      { payslipId, force: options?.force },
      { jobId: payslipPdfJobId(payslipId, options?.force) }
    );
  }

  // ────────────────────────────────────────────────
  // Generation
  // ────────────────────────────────────────────────

  /**
   * Renders and archives one payslip's PDF. The GENERATING claim is a
   * conditional update, so the cron sweep and an admin's manual retry cannot
   * render the same payslip twice at once.
   */
  async generate(payslipId: string, force = false): Promise<boolean> {
    const payslip = await this.prisma.payslip.findUnique({ where: { id: payslipId } });
    if (!payslip) throw new NotFoundException("Payslip not found.");

    if (payslip.pdfStatus === PayslipPdfStatus.READY && !force) return true;

    const claimed = await this.prisma.payslip.updateMany({
      where: {
        id: payslipId,
        ...(force ? {} : { pdfStatus: { in: [PayslipPdfStatus.PENDING, PayslipPdfStatus.FAILED] } })
      },
      data: { pdfStatus: PayslipPdfStatus.GENERATING }
    });
    if (claimed.count === 0) return false;

    try {
      const document = await this.buildDocument(payslipId);
      const pdf = await this.pdf.renderPayslip(document);
      const stored = await this.archive(pdf, document.documentNumber, new Date(document.issuedAt));

      await this.prisma.payslip.update({
        where: { id: payslipId },
        data: {
          pdfStatus: PayslipPdfStatus.READY,
          storageKey: stored.storageKey,
          pdfError: null,
          pdfAttempts: { increment: 1 }
        }
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.payslip.update({
        where: { id: payslipId },
        data: {
          pdfStatus: PayslipPdfStatus.FAILED,
          pdfError: message.slice(0, 500),
          pdfAttempts: { increment: 1 }
        }
      });
      this.logger.error(`Payslip ${payslipId} PDF generation failed: ${message}`);
      return false;
    }
  }

  /** Gathers everything the PDF needs from the (frozen once FINALIZED) record. */
  private async buildDocument(payslipId: string): Promise<PayslipDocument> {
    const payslip = await this.prisma.payslip.findUniqueOrThrow({
      where: { id: payslipId },
      include: {
        payrollRecord: {
          include: {
            period: true,
            coach: true,
            payout: true
          }
        }
      }
    });
    const record = payslip.payrollRecord;
    const profile = await this.prisma.coachCompensationProfile.findUnique({
      where: { coachId: record.coachId },
      select: { currency: true }
    });

    return {
      documentNumber: payslip.documentNumber,
      documentKind: payslip.documentKind,
      issuedAt: payslip.issuedAt.toISOString(),
      period: {
        periodType: record.period.periodType,
        startDate: record.period.startDate.toISOString(),
        endDate: record.period.endDate.toISOString()
      },
      coach: {
        name: fullName(record.coach) ?? record.coach.email,
        engagementType: payslip.engagementTypeAtIssue
      },
      currency: profile?.currency ?? "INR",
      teachingSummary: {
        scheduledClassesCount: record.scheduledClassesCount,
        completedClassesCount: record.completedClassesCount,
        cancelledByCoachCount: record.cancelledByCoachCount,
        cancelledByStudentCount: record.cancelledByStudentCount,
        cancelledByAdminCount: record.cancelledByAdminCount,
        noShowCount: record.noShowCount,
        totalTeachingSeconds: record.totalTeachingSeconds,
        totalBoardSeconds: record.totalBoardSeconds
      },
      earningsBreakdown:
        (record.earningsBreakdown as PayslipDocument["earningsBreakdown"] | null) ?? {
          version: 1,
          lineItems: []
        },
      grossEarningsMinor: record.grossEarningsMinor,
      totalDeductionsMinor: record.totalDeductionsMinor,
      totalAdjustmentsMinor: record.totalAdjustmentsMinor,
      netPayableMinor: record.netPayableMinor,
      payoutStatus: record.payout?.status ?? null,
      paidAt: record.payout?.paidAt?.toISOString() ?? null
    };
  }

  private async archive(
    pdf: Buffer,
    documentNumber: string,
    issuedAt: Date
  ): Promise<{ storageKey: string | null }> {
    if (!this.storage.isConfigured()) {
      this.storage.warnIfUnconfigured();
      return { storageKey: null };
    }
    const key = this.storage.buildKey(documentNumber, issuedAt);
    const result = await this.storage.upload(key, pdf);
    return { storageKey: result.storageKey };
  }

  // ────────────────────────────────────────────────
  // Serving
  // ────────────────────────────────────────────────

  /** Tries the archive first, falls back to rendering fresh (never a dead end for a download). */
  async getPayslipPdf(payslipId: string): Promise<Buffer> {
    const payslip = await this.prisma.payslip.findUnique({
      where: { id: payslipId },
      select: { storageKey: true }
    });

    if (payslip?.storageKey) {
      const archived = await this.storage.download(payslip.storageKey);
      if (archived) return archived;
      this.logger.warn(`Payslip ${payslipId} archive miss for ${payslip.storageKey}; re-rendering.`);
    }

    const document = await this.buildDocument(payslipId);
    const pdf = await this.pdf.renderPayslip(document);

    if (this.storage.isConfigured()) {
      void this.generate(payslipId, true).catch(() => undefined);
    }
    return pdf;
  }

  // ────────────────────────────────────────────────
  // Retry sweep
  // ────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweepFailedGenerations(): Promise<void> {
    await this.withLock(JOB_LOCKS.payslipPdfSweep, async () => {
      const staleBefore = new Date(Date.now() - 15 * 60_000);

      await this.prisma.payslip.updateMany({
        where: { pdfStatus: PayslipPdfStatus.GENERATING, updatedAt: { lt: staleBefore } },
        data: { pdfStatus: PayslipPdfStatus.FAILED, pdfError: "Generation timed out." }
      });

      const pending = await this.prisma.payslip.findMany({
        where: {
          pdfStatus: { in: [PayslipPdfStatus.PENDING, PayslipPdfStatus.FAILED] },
          pdfAttempts: { lt: MAX_PDF_ATTEMPTS }
        },
        select: { id: true },
        orderBy: { createdAt: "asc" },
        take: 25
      });

      if (pending.length === 0) return;

      this.logger.log(`Retrying ${pending.length} payslip PDF generation(s).`);
      for (const p of pending) {
        await this.generate(p.id);
      }
    });
  }

  private async withLock(name: JobLockName, run: () => Promise<void>): Promise<void> {
    try {
      await this.jobLocks.runExclusive(name, run);
    } catch (error) {
      this.logger.error("Payslip generation cron failed", error as Error);
    }
  }
}

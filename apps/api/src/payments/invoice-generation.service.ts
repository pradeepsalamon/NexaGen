import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { getApiEnv } from "@nexa-chess/config/api";
import type { CreditNoteItem, InvoiceItem } from "@nexa-chess/types";
import { InvoicePdfStatus } from "@prisma/client";
import type { Queue } from "bullmq";
import { MessagingDispatchService } from "../messaging/messaging-dispatch.service";
import { MessagingRuleService } from "../messaging/messaging-rule.service";
import { PrismaService } from "../prisma/prisma.service";
import { isQueueEnabled } from "../queue/queue.config";
import { WhatsAppService } from "../whatsapp/whatsapp.service";
import { CreditNoteService } from "./credit-note.service";
import { InvoiceAuditService } from "./invoice-audit.service";
import { InvoiceEmailService } from "./invoice-email.service";
import { InvoicePdfService } from "./invoice-pdf.service";
import {
  creditNotePdfJobId,
  INVOICE_JOBS,
  INVOICE_QUEUE,
  invoicePdfJobId
} from "./invoice-queue";
import { InvoiceStorageService } from "./invoice-storage.service";
import { InvoiceService } from "./invoice.service";

/** Enough to outlast a Cloudinary blip; beyond this a human should look. */
const MAX_PDF_ATTEMPTS = 5;

/**
 * PDF generation, retry and the invoice domain events (§20).
 *
 * The governing rule: **a failed render never touches the payment.** Money is
 * settled by the time anything here runs, so generation lives entirely outside
 * the capture transaction. A failure parks the invoice at `pdfStatus: FAILED`
 * and leaves `status: PAID` alone, and the sweep below picks it up again.
 */
@Injectable()
export class InvoiceGenerationService {
  private static readonly SWEEP_LOCK_ID = 73_002_070;

  private readonly logger = new Logger(InvoiceGenerationService.name);

  /** False when REDIS_URL is unset: every enqueue would be dropped. */
  private readonly queueEnabled = isQueueEnabled(getApiEnv());

  constructor(
    private readonly audit: InvoiceAuditService,
    private readonly creditNotes: CreditNoteService,
    private readonly email: InvoiceEmailService,
    @InjectQueue(INVOICE_QUEUE) private readonly queue: Queue,
    private readonly invoices: InvoiceService,
    private readonly messaging: MessagingDispatchService,
    private readonly messagingRules: MessagingRuleService,
    private readonly pdf: InvoicePdfService,
    private readonly prisma: PrismaService,
    private readonly storage: InvoiceStorageService,
    private readonly whatsapp: WhatsAppService
  ) {}

  // ────────────────────────────────────────────────
  // Requesting
  // ────────────────────────────────────────────────

  /**
   * Entry point called right after a capture commits.
   *
   * Queues the render rather than doing it here: the webhook that triggered it
   * must return 200 promptly and whatever happens to the PDF must not reach
   * the gateway. Never throws, for the same reason.
   *
   * The `jobId` is derived from the invoice, so two redelivered webhooks for
   * one capture collapse into a single job instead of rendering twice.
   */
  requestGeneration(invoiceId: string, options?: { sendEmail?: boolean }): void {
    void this.enqueueInvoicePdf(invoiceId, options).catch((error) => {
      this.logger.error(
        `Invoice ${invoiceId} generation could not be started: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    });
  }

  /**
   * Puts the render on the queue, or runs it inline when queues are disabled.
   *
   * The inline fallback is deliberate. `createDisabledQueue` drops the job and
   * logs it, which would leave every invoice `PENDING` until the 10-minute
   * sweep — fine in production (Redis is configured) but a poor local
   * experience, where `npm run dev:api` runs without Docker by design.
   */
  async enqueueInvoicePdf(
    invoiceId: string,
    options?: { sendEmail?: boolean; force?: boolean }
  ): Promise<void> {
    if (!this.queueEnabled) {
      await this.generateAndDeliver(invoiceId, options);
      return;
    }

    await this.queue.add(
      INVOICE_JOBS.generateInvoicePdf,
      { invoiceId, force: options?.force, sendEmail: options?.sendEmail },
      { jobId: invoicePdfJobId(invoiceId, options?.force) }
    );
  }

  async enqueueCreditNotePdf(
    creditNoteId: string,
    options?: { force?: boolean }
  ): Promise<void> {
    if (!this.queueEnabled) {
      await this.generateCreditNote(creditNoteId, options?.force);
      return;
    }

    await this.queue.add(
      INVOICE_JOBS.generateCreditNotePdf,
      { creditNoteId, force: options?.force },
      { jobId: creditNotePdfJobId(creditNoteId, options?.force) }
    );
  }

  /** Fire-and-forget credit-note render, for the refund path. */
  requestCreditNoteGeneration(creditNoteId: string): void {
    void this.enqueueCreditNotePdf(creditNoteId).catch((error) => {
      this.logger.error(
        `Credit note ${creditNoteId} generation could not be started: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    });
  }

  async generateAndDeliver(
    invoiceId: string,
    options?: { sendEmail?: boolean; force?: boolean; actorId?: string | null }
  ): Promise<void> {
    await this.audit.record({
      event: "INVOICE_GENERATION_REQUESTED",
      invoiceId,
      actorId: options?.actorId ?? null
    });

    const generated = await this.generate(invoiceId, options?.force ?? false);
    if (!generated) return;

    if (options?.sendEmail !== false) {
      await this.email.sendInvoiceIssued(invoiceId);
    }

    await this.deliverToMessaging(invoiceId);
  }

  /**
   * Sends the invoice through the messaging rules — WhatsApp and/or in-app,
   * per what the admin has enabled for INVOICE_ISSUED.
   *
   * On WhatsApp the PDF is uploaded to Meta first and attached as a document,
   * so a parent receives the actual receipt in the chat rather than a link to
   * chase. The upload only happens when the rule genuinely wants WhatsApp —
   * there is no point shipping a PDF to Meta for an in-app-only rule.
   *
   * Never throws: an invoice that exists and is paid must not be undone by a
   * messaging problem. A failed upload degrades to a link, and a failed
   * dispatch is logged.
   */
  private async deliverToMessaging(invoiceId: string): Promise<void> {
    try {
      const rule = await this.messagingRules.getRule("INVOICE_ISSUED");
      if (!rule.enabled || (!rule.whatsappEnabled && !rule.inAppEnabled)) return;

      const document = rule.whatsappEnabled
        ? await this.buildWhatsAppDocument(invoiceId)
        : undefined;

      this.messaging.dispatchInBackground({
        event: "INVOICE_ISSUED",
        invoiceId,
        document
      });
    } catch (error) {
      this.logger.warn(
        `Invoice ${invoiceId} could not be handed to messaging: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Uploads the invoice PDF to Meta and returns the handle to attach.
   *
   * Returns undefined rather than throwing when WhatsApp is unconfigured or the
   * upload fails — the message still goes out, just with the download link in
   * its body instead of the file.
   */
  private async buildWhatsAppDocument(
    invoiceId: string
  ): Promise<{ mediaId: string; filename: string } | undefined> {
    if (!this.whatsapp.isConfigured()) return undefined;

    const invoice = await this.invoices.getById(invoiceId);
    if (!invoice) return undefined;

    const filename = `${invoice.number.replace(/[^\w.-]/g, "_")}.pdf`;

    try {
      const pdf = await this.getInvoicePdf(invoice);
      const uploaded = await this.whatsapp.tryUploadMedia(pdf, filename);

      if (!uploaded.ok) {
        this.logger.warn(
          `Invoice ${invoice.number} could not be uploaded to WhatsApp (${uploaded.error.message}); sending a link instead.`
        );
        return undefined;
      }

      return { mediaId: uploaded.mediaId, filename };
    } catch (error) {
      this.logger.warn(
        `Invoice ${invoice.number} PDF was unavailable for WhatsApp: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return undefined;
    }
  }

  // ────────────────────────────────────────────────
  // Generation
  // ────────────────────────────────────────────────

  /**
   * Renders and archives one invoice's PDF.
   *
   * The GENERATING claim is a conditional update: a row is only claimed if it
   * is not already being worked on, so the cron sweep and an admin's manual
   * retry cannot render the same invoice twice at once.
   */
  async generate(invoiceId: string, force = false): Promise<boolean> {
    const invoice = await this.invoices.getById(invoiceId);
    if (!invoice) throw new NotFoundException("Invoice not found.");

    if (invoice.pdfStatus === "READY" && !force) return true;

    const claimed = await this.prisma.invoice.updateMany({
      where: {
        id: invoiceId,
        ...(force
          ? {}
          : {
              pdfStatus: {
                in: [InvoicePdfStatus.PENDING, InvoicePdfStatus.FAILED]
              }
            })
      },
      data: { pdfStatus: InvoicePdfStatus.GENERATING }
    });
    if (claimed.count === 0) return false;

    try {
      const pdf = await this.pdf.renderInvoice(invoice);
      const stored = await this.archive(
        pdf,
        invoice.number,
        new Date(invoice.invoiceDate),
        "invoices"
      );

      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          pdfStatus: InvoicePdfStatus.READY,
          pdfStorageKey: stored.storageKey,
          pdfUrl: stored.url,
          pdfBytes: stored.bytes ?? pdf.byteLength,
          pdfGeneratedAt: new Date(),
          pdfError: null,
          pdfAttempts: { increment: 1 }
        }
      });

      await this.audit.record({
        event: "INVOICE_GENERATED",
        invoiceId,
        metadata: {
          bytes: stored.bytes ?? pdf.byteLength,
          archived: stored.storageKey !== null
        }
      });

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // The payment stays PAID. Only the artifact failed.
      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          pdfStatus: InvoicePdfStatus.FAILED,
          pdfError: message.slice(0, 500),
          pdfAttempts: { increment: 1 }
        }
      });

      await this.audit.record({
        event: "INVOICE_GENERATION_FAILED",
        invoiceId,
        metadata: { error: message.slice(0, 500) }
      });

      this.logger.error(`Invoice ${invoiceId} PDF generation failed: ${message}`);
      return false;
    }
  }

  async generateCreditNote(creditNoteId: string, force = false): Promise<boolean> {
    const creditNote = await this.creditNotes.getById(creditNoteId);
    if (!creditNote) throw new NotFoundException("Credit note not found.");

    if (creditNote.pdfStatus === "READY" && !force) return true;

    try {
      const pdf = await this.pdf.renderCreditNote(creditNote);
      const stored = await this.archive(
        pdf,
        creditNote.number,
        new Date(creditNote.issuedAt),
        "credit-notes"
      );

      await this.prisma.creditNote.update({
        where: { id: creditNoteId },
        data: {
          pdfStatus: InvoicePdfStatus.READY,
          pdfStorageKey: stored.storageKey,
          pdfBytes: stored.bytes ?? pdf.byteLength,
          pdfGeneratedAt: new Date(),
          pdfError: null,
          pdfAttempts: { increment: 1 }
        }
      });

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.creditNote.update({
        where: { id: creditNoteId },
        data: {
          pdfStatus: InvoicePdfStatus.FAILED,
          pdfError: message.slice(0, 500),
          pdfAttempts: { increment: 1 }
        }
      });
      this.logger.error(
        `Credit note ${creditNoteId} PDF generation failed: ${message}`
      );
      return false;
    }
  }

  /**
   * Stores the bytes if storage is configured.
   *
   * When Cloudinary is unset this is a no-op that still reports success: the
   * PDF is simply rendered on demand at download time instead. An academy
   * running without object storage must still be able to hand a parent a
   * receipt.
   */
  private async archive(
    pdf: Buffer,
    documentNumber: string,
    issuedAt: Date,
    folder: string
  ): Promise<{ storageKey: string | null; url: string | null; bytes: number | null }> {
    if (!this.storage.isConfigured()) {
      this.storage.warnIfUnconfigured();
      return { storageKey: null, url: null, bytes: pdf.byteLength };
    }

    const key = this.storage.buildKey(documentNumber, issuedAt, folder);
    const result = await this.storage.upload(key, pdf);
    return { storageKey: result.storageKey, url: result.url, bytes: result.bytes };
  }

  // ────────────────────────────────────────────────
  // Serving
  // ────────────────────────────────────────────────

  /**
   * The bytes to hand an authorized caller.
   *
   * Tries the archive first, then falls back to rendering fresh. That fallback
   * is what makes a failed background render invisible to the customer: they
   * ask for their receipt and get one, and the retry sweep fixes the archive
   * behind the scenes.
   */
  async getInvoicePdf(invoice: InvoiceItem): Promise<Buffer> {
    const row = await this.prisma.invoice.findUnique({
      where: { id: invoice.id },
      select: { pdfStorageKey: true }
    });

    if (row?.pdfStorageKey) {
      const archived = await this.storage.download(row.pdfStorageKey);
      if (archived) return archived;
      this.logger.warn(
        `Invoice ${invoice.id} archive miss for ${row.pdfStorageKey}; re-rendering.`
      );
    }

    const pdf = await this.pdf.renderInvoice(invoice);

    // Opportunistically repair the archive, but never fail the download for it.
    if (this.storage.isConfigured()) {
      void this.generate(invoice.id, true).catch(() => undefined);
    }

    return pdf;
  }

  async getCreditNotePdf(creditNote: CreditNoteItem): Promise<Buffer> {
    const row = await this.prisma.creditNote.findUnique({
      where: { id: creditNote.id },
      select: { pdfStorageKey: true }
    });

    if (row?.pdfStorageKey) {
      const archived = await this.storage.download(row.pdfStorageKey);
      if (archived) return archived;
    }

    return this.pdf.renderCreditNote(creditNote);
  }

  // ────────────────────────────────────────────────
  // Retry sweep
  // ────────────────────────────────────────────────

  /**
   * Picks up invoices whose render failed, or that were never rendered because
   * the API restarted mid-flight.
   *
   * Also reclaims rows stuck in GENERATING for over 15 minutes — that only
   * happens if a container died holding the claim, and without this they would
   * never be retried.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweepFailedGenerations(): Promise<void> {
    await this.withLock(InvoiceGenerationService.SWEEP_LOCK_ID, async () => {
      const staleBefore = new Date(Date.now() - 15 * 60_000);

      await this.prisma.invoice.updateMany({
        where: {
          pdfStatus: InvoicePdfStatus.GENERATING,
          updatedAt: { lt: staleBefore }
        },
        data: { pdfStatus: InvoicePdfStatus.FAILED, pdfError: "Generation timed out." }
      });

      const pending = await this.prisma.invoice.findMany({
        where: {
          pdfStatus: {
            in: [InvoicePdfStatus.PENDING, InvoicePdfStatus.FAILED]
          },
          pdfAttempts: { lt: MAX_PDF_ATTEMPTS }
        },
        select: { id: true },
        orderBy: { createdAt: "asc" },
        take: 25
      });

      if (pending.length === 0) return;

      this.logger.log(`Retrying ${pending.length} invoice PDF generation(s).`);
      for (const invoice of pending) {
        // Run here rather than re-queueing: the sweep is already a background
        // context, and it is specifically the net for the case where the queue
        // did not deliver, so bouncing back through it would be circular.
        await this.generateAndDeliver(invoice.id);
      }
    });
  }

  /** Retries the invoice emails that failed after a successful render (§18). */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async sweepUnsentEmails(): Promise<void> {
    await this.withLock(InvoiceGenerationService.SWEEP_LOCK_ID + 1, async () => {
      const unsent = await this.prisma.invoice.findMany({
        where: {
          emailSent: false,
          pdfStatus: InvoicePdfStatus.READY,
          billingEmail: { not: null }
        },
        select: { id: true },
        orderBy: { createdAt: "asc" },
        take: 25
      });

      for (const invoice of unsent) {
        await this.email.sendInvoiceIssued(invoice.id);
      }
    });
  }

  private async withLock(lockId: number, run: () => Promise<void>): Promise<void> {
    try {
      const [lock] = await this.prisma.$queryRaw<[{ locked: boolean }]>`
        SELECT pg_try_advisory_lock(${lockId}) AS locked
      `;
      if (!lock?.locked) return;

      try {
        await run();
      } finally {
        await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${lockId})`;
      }
    } catch (error) {
      this.logger.error("Invoice generation cron failed", error as Error);
    }
  }
}

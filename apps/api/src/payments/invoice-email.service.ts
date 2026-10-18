import { Injectable, Logger } from "@nestjs/common";
import { formatMoney } from "@nexa-chess/types";
import { InvoicePdfStatus } from "@prisma/client";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { InvoiceAuditService } from "./invoice-audit.service";
import { InvoicePdfService } from "./invoice-pdf.service";
import { InvoiceSettingsService } from "./invoice-settings.service";
import { InvoiceStorageService } from "./invoice-storage.service";
import { InvoiceService } from "./invoice.service";

/**
 * The "your invoice is ready" email (§18).
 *
 * Two rules shape this:
 *
 *  - It is only ever sent after the payment is verified, because it is only
 *    ever triggered from the capture path.
 *  - It is sent at most once. The `emailSent` flag is claimed with a
 *    conditional update BEFORE the send, so two redelivered webhooks racing
 *    here produce one email — the loser's update matches zero rows and it
 *    returns without sending.
 */
@Injectable()
export class InvoiceEmailService {
  private readonly logger = new Logger(InvoiceEmailService.name);

  constructor(
    private readonly audit: InvoiceAuditService,
    private readonly invoices: InvoiceService,
    private readonly mail: MailService,
    private readonly pdf: InvoicePdfService,
    private readonly prisma: PrismaService,
    private readonly settings: InvoiceSettingsService,
    private readonly storage: InvoiceStorageService
  ) {}

  async sendInvoiceIssued(invoiceId: string, force = false): Promise<boolean> {
    const settings = await this.settings.get();
    if (!settings.emailOnIssue && !force) return false;

    const invoice = await this.invoices.getById(invoiceId);
    if (!invoice) return false;

    const to = invoice.billing.email ?? invoice.userEmail;
    if (!to) {
      this.logger.warn(`Invoice ${invoice.number} has no email address to send to.`);
      return false;
    }

    // Claim first. This is the duplicate guard, not a check-then-send.
    const claimed = await this.prisma.invoice.updateMany({
      where: { id: invoiceId, ...(force ? {} : { emailSent: false }) },
      data: { emailSent: true, emailSentAt: new Date() }
    });
    if (claimed.count === 0) return false;

    await this.audit.record({ event: "INVOICE_EMAIL_REQUESTED", invoiceId });

    try {
      const attachment = settings.attachPdfToEmail
        ? await this.resolveAttachment(invoiceId, invoice.number)
        : null;

      const downloadUrl =
        !attachment && invoice.pdfStatus === "READY"
          ? await this.resolveSignedLink(invoiceId)
          : null;

      await this.mail.sendInvoiceIssued({
        to,
        customerName: invoice.billing.name,
        invoiceNumber: invoice.number,
        amount: formatMoney(invoice.total, invoice.currency),
        sellerName: invoice.seller.legalName,
        supportEmail: settings.supportEmail ?? invoice.seller.email,
        downloadUrl,
        attachment
      });

      await this.audit.record({
        event: "INVOICE_EMAIL_SENT",
        invoiceId,
        metadata: { to, attached: Boolean(attachment) }
      });

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Release the claim so the sweep retries. A missing receipt email is
      // recoverable; a permanently-claimed flag is not.
      await this.prisma.invoice.updateMany({
        where: { id: invoiceId },
        data: { emailSent: false, emailSentAt: null }
      });

      await this.audit.record({
        event: "INVOICE_EMAIL_FAILED",
        invoiceId,
        metadata: { error: message.slice(0, 500) }
      });

      this.logger.error(
        `Invoice ${invoice.number} email to ${to} failed: ${message}`
      );
      return false;
    }
  }

  /** The archived PDF, or a freshly rendered one if the archive is unavailable. */
  private async resolveAttachment(
    invoiceId: string,
    invoiceNumber: string
  ): Promise<{ filename: string; content: Buffer } | null> {
    const row = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { pdfStorageKey: true, pdfStatus: true }
    });

    if (row?.pdfStorageKey) {
      const archived = await this.storage.download(row.pdfStorageKey);
      if (archived) {
        return { filename: `${safeFilename(invoiceNumber)}.pdf`, content: archived };
      }
    }

    const invoice = await this.invoices.getById(invoiceId);
    if (!invoice) return null;

    try {
      return {
        filename: `${safeFilename(invoiceNumber)}.pdf`,
        content: await this.pdf.renderInvoice(invoice)
      };
    } catch (error) {
      // An un-attachable PDF must not stop the email; the receipt link and the
      // dashboard still work.
      this.logger.warn(
        `Invoice ${invoiceNumber} could not be attached: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return null;
    }
  }

  private async resolveSignedLink(invoiceId: string): Promise<string | null> {
    const row = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { pdfStorageKey: true, pdfStatus: true }
    });
    if (!row?.pdfStorageKey || row.pdfStatus !== InvoicePdfStatus.READY) {
      return null;
    }
    // 7 days: long enough to be useful in an inbox, short enough that a
    // forwarded email eventually stops granting access to a financial document.
    return this.storage.signedUrl(row.pdfStorageKey, 7 * 24 * 60 * 60);
  }
}

function safeFilename(value: string): string {
  return value.replace(/[^\w.-]/g, "_");
}

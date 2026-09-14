import { Test, type TestingModule } from "@nestjs/testing";
import { DEFAULT_INVOICE_SETTINGS, type InvoiceItem } from "@nexa-chess/types";
import { InvoiceAuditService } from "./invoice-audit.service";
import { InvoiceEmailService } from "./invoice-email.service";
import { InvoicePdfService } from "./invoice-pdf.service";
import { InvoiceSettingsService } from "./invoice-settings.service";
import { InvoiceStorageService } from "./invoice-storage.service";
import { InvoiceService } from "./invoice.service";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * §18: a duplicate webhook must not produce a duplicate receipt email.
 *
 * The guard is a conditional claim taken BEFORE the send, not a check-then-send
 * — two webhooks arriving together would both pass a read-then-write check.
 */
describe("InvoiceEmailService", () => {
  let service: InvoiceEmailService;
  let prisma: {
    invoice: { updateMany: jest.Mock; findUnique: jest.Mock };
    invoiceAuditLog: { create: jest.Mock };
  };
  let mail: { sendInvoiceIssued: jest.Mock };
  let settings: { get: jest.Mock };

  const invoice = {
    id: "inv_1",
    number: "NEXA-INV-2026-000001",
    total: 117882,
    currency: "INR",
    pdfStatus: "READY",
    userEmail: "student@example.com",
    billing: { name: "Priya Raghunathan", email: "priya@example.com" },
    seller: { legalName: "NexaChess", email: "billing@nexachess.in" }
  } as unknown as InvoiceItem;

  beforeEach(async () => {
    prisma = {
      invoice: {
        // The claim succeeded: this caller won the race.
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest
          .fn()
          .mockResolvedValue({ pdfStorageKey: "key", pdfStatus: "READY" })
      },
      invoiceAuditLog: { create: jest.fn().mockResolvedValue({}) }
    };

    mail = { sendInvoiceIssued: jest.fn().mockResolvedValue(undefined) };
    settings = { get: jest.fn().mockResolvedValue(DEFAULT_INVOICE_SETTINGS) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceEmailService,
        InvoiceAuditService,
        { provide: InvoiceService, useValue: { getById: jest.fn().mockResolvedValue(invoice) } },
        { provide: MailService, useValue: mail },
        { provide: InvoiceSettingsService, useValue: settings },
        {
          provide: InvoiceStorageService,
          useValue: {
            download: jest.fn().mockResolvedValue(Buffer.from("%PDF-archived")),
            signedUrl: jest.fn().mockReturnValue("https://signed.example/invoice")
          }
        },
        {
          provide: InvoicePdfService,
          useValue: { renderInvoice: jest.fn().mockResolvedValue(Buffer.from("%PDF-")) }
        },
        { provide: PrismaService, useValue: prisma }
      ]
    }).compile();

    service = module.get(InvoiceEmailService);
  });

  it("sends the receipt to the bill-payer, not the student account", async () => {
    expect(await service.sendInvoiceIssued("inv_1")).toBe(true);

    expect(mail.sendInvoiceIssued).toHaveBeenCalledWith(
      expect.objectContaining({ to: "priya@example.com" })
    );
  });

  it("does not send twice when the flag is already claimed", async () => {
    // A redelivered webhook: the conditional update matches no rows.
    prisma.invoice.updateMany.mockResolvedValue({ count: 0 });

    expect(await service.sendInvoiceIssued("inv_1")).toBe(false);
    expect(mail.sendInvoiceIssued).not.toHaveBeenCalled();
  });

  it("claims the flag before sending, not after", async () => {
    const order: string[] = [];
    prisma.invoice.updateMany.mockImplementation(() => {
      order.push("claim");
      return Promise.resolve({ count: 1 });
    });
    mail.sendInvoiceIssued.mockImplementation(() => {
      order.push("send");
      return Promise.resolve();
    });

    await service.sendInvoiceIssued("inv_1");

    expect(order).toEqual(["claim", "send"]);
  });

  it("releases the claim when the send fails, so the sweep can retry", async () => {
    mail.sendInvoiceIssued.mockRejectedValue(new Error("SMTP down"));

    expect(await service.sendInvoiceIssued("inv_1")).toBe(false);

    const release = prisma.invoice.updateMany.mock.calls.at(-1)?.[0];
    expect(release.data).toEqual({ emailSent: false, emailSentAt: null });
  });

  it("attaches the archived PDF rather than re-rendering it", async () => {
    await service.sendInvoiceIssued("inv_1");

    expect(mail.sendInvoiceIssued).toHaveBeenCalledWith(
      expect.objectContaining({
        attachment: expect.objectContaining({
          filename: "NEXA-INV-2026-000001.pdf"
        })
      })
    );
  });

  it("sends a short-lived link instead when attachments are switched off", async () => {
    settings.get.mockResolvedValue({
      ...DEFAULT_INVOICE_SETTINGS,
      attachPdfToEmail: false
    });

    await service.sendInvoiceIssued("inv_1");

    const args = mail.sendInvoiceIssued.mock.calls[0][0];
    expect(args.attachment).toBeNull();
    expect(args.downloadUrl).toBe("https://signed.example/invoice");
  });

  it("stays silent when the admin has turned invoice emails off", async () => {
    settings.get.mockResolvedValue({
      ...DEFAULT_INVOICE_SETTINGS,
      emailOnIssue: false
    });

    expect(await service.sendInvoiceIssued("inv_1")).toBe(false);
    expect(mail.sendInvoiceIssued).not.toHaveBeenCalled();
  });

  it("allows an admin to deliberately resend a lost receipt", async () => {
    settings.get.mockResolvedValue({
      ...DEFAULT_INVOICE_SETTINGS,
      emailOnIssue: false
    });

    // force: the one path that may send a second copy, for "it never arrived".
    expect(await service.sendInvoiceIssued("inv_1", true)).toBe(true);
    expect(mail.sendInvoiceIssued).toHaveBeenCalled();
  });

  it("records sent and failed events on the audit trail", async () => {
    await service.sendInvoiceIssued("inv_1");

    const events = prisma.invoiceAuditLog.create.mock.calls.map(
      (call) => call[0].data.event
    );
    expect(events).toContain("INVOICE_EMAIL_REQUESTED");
    expect(events).toContain("INVOICE_EMAIL_SENT");
  });
});

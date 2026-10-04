import { getQueueToken } from "@nestjs/bullmq";
import { Test, type TestingModule } from "@nestjs/testing";
import type { InvoiceItem } from "@nexa-chess/types";
import { CreditNoteService } from "./credit-note.service";
import { InvoiceAuditService } from "./invoice-audit.service";
import { InvoiceEmailService } from "./invoice-email.service";
import { InvoiceGenerationService } from "./invoice-generation.service";
import { InvoicePdfService } from "./invoice-pdf.service";
import { InvoiceStorageService } from "./invoice-storage.service";
import { INVOICE_QUEUE } from "./invoice-queue";
import { InvoiceService } from "./invoice.service";
import { MessagingDispatchService } from "../messaging/messaging-dispatch.service";
import { MessagingRuleService } from "../messaging/messaging-rule.service";
import { JobLockService } from "../prisma/job-lock.service";
import { createJobLockStub } from "../prisma/job-lock.testing";
import { PrismaService } from "../prisma/prisma.service";
import { WhatsAppService } from "../whatsapp/whatsapp.service";

/**
 * §20's central rule: **PDF generation failing must never undo a payment.**
 *
 * These tests exist because the tempting implementation — generating inside the
 * capture transaction — would roll back a successful payment over a storage
 * blip. Generation therefore runs after the commit, and a failure is a state on
 * the artifact, not on the money.
 */
describe("InvoiceGenerationService", () => {
  let service: InvoiceGenerationService;
  let prisma: {
    invoice: {
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findMany: jest.Mock;
    };
    creditNote: { findUnique: jest.Mock; update: jest.Mock };
    invoiceAuditLog: { create: jest.Mock };
    $queryRaw: jest.Mock;
  };
  let pdf: { renderInvoice: jest.Mock; renderCreditNote: jest.Mock };
  let storage: {
    isConfigured: jest.Mock;
    buildKey: jest.Mock;
    upload: jest.Mock;
    download: jest.Mock;
    warnIfUnconfigured: jest.Mock;
  };
  let email: { sendInvoiceIssued: jest.Mock };
  let jobLocks: ReturnType<typeof createJobLockStub>;
  let queue: { add: jest.Mock };
  let messaging: { dispatchInBackground: jest.Mock };
  let rules: { getRule: jest.Mock };
  let whatsapp: {
    isConfigured: jest.Mock;
    tryUploadMedia: jest.Mock;
  };

  const invoice = { id: "inv_1", number: "NEXA-INV-2026-000001", pdfStatus: "PENDING", invoiceDate: "2026-09-14T10:32:00.000Z" } as unknown as InvoiceItem;

  beforeEach(async () => {
    prisma = {
      invoice: {
        findUnique: jest.fn().mockResolvedValue({ pdfStorageKey: null }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([])
      },
      creditNote: {
        findUnique: jest.fn().mockResolvedValue({ pdfStorageKey: null }),
        update: jest.fn().mockResolvedValue({})
      },
      invoiceAuditLog: { create: jest.fn().mockResolvedValue({}) },
      $queryRaw: jest.fn().mockResolvedValue([{ locked: true }])
    };

    pdf = {
      renderInvoice: jest.fn().mockResolvedValue(Buffer.from("%PDF-1.3 fake")),
      renderCreditNote: jest.fn().mockResolvedValue(Buffer.from("%PDF-1.3 fake"))
    };

    storage = {
      isConfigured: jest.fn().mockReturnValue(true),
      buildKey: jest.fn().mockReturnValue("nexa_chess/invoices/2026/09/NEXA-INV-2026-000001"),
      upload: jest.fn().mockResolvedValue({
        storageKey: "nexa_chess/invoices/2026/09/NEXA-INV-2026-000001",
        bytes: 13,
        url: "https://res.cloudinary.com/private"
      }),
      download: jest.fn().mockResolvedValue(null),
      warnIfUnconfigured: jest.fn()
    };

    email = { sendInvoiceIssued: jest.fn().mockResolvedValue(true) };
    queue = { add: jest.fn().mockResolvedValue({ id: "job_1" }) };
    messaging = { dispatchInBackground: jest.fn() };
    // Default: the admin has NOT switched WhatsApp on for this rule.
    rules = {
      getRule: jest.fn().mockResolvedValue({
        event: "INVOICE_ISSUED",
        enabled: true,
        whatsappEnabled: false,
        inAppEnabled: true
      })
    };
    whatsapp = {
      isConfigured: jest.fn().mockReturnValue(true),
      tryUploadMedia: jest
        .fn()
        .mockResolvedValue({ ok: true, mediaId: "media_abc123" })
    };

    jobLocks = createJobLockStub();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceGenerationService,
        InvoiceAuditService,
        { provide: JobLockService, useValue: jobLocks },
        { provide: InvoiceService, useValue: { getById: jest.fn().mockResolvedValue(invoice) } },
        { provide: CreditNoteService, useValue: { getById: jest.fn() } },
        { provide: InvoicePdfService, useValue: pdf },
        { provide: InvoiceStorageService, useValue: storage },
        { provide: InvoiceEmailService, useValue: email },
        { provide: getQueueToken(INVOICE_QUEUE), useValue: queue },
        { provide: MessagingDispatchService, useValue: messaging },
        { provide: MessagingRuleService, useValue: rules },
        { provide: WhatsAppService, useValue: whatsapp },
        { provide: PrismaService, useValue: prisma }
      ]
    }).compile();

    service = module.get(InvoiceGenerationService);
  });

  it("renders, archives privately, and marks the invoice READY", async () => {
    const ok = await service.generate("inv_1");

    expect(ok).toBe(true);
    expect(storage.upload).toHaveBeenCalled();
    expect(prisma.invoice.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pdfStatus: "READY",
          pdfStorageKey: "nexa_chess/invoices/2026/09/NEXA-INV-2026-000001"
        })
      })
    );
  });

  it("leaves the payment alone when the render fails", async () => {
    pdf.renderInvoice.mockRejectedValue(new Error("renderer exploded"));

    const ok = await service.generate("inv_1");

    expect(ok).toBe(false);

    const data = prisma.invoice.update.mock.calls[0][0].data;
    expect(data.pdfStatus).toBe("FAILED");
    expect(data.pdfError).toContain("renderer exploded");

    // The invoice's financial status is untouched: it is still a paid invoice.
    expect(data).not.toHaveProperty("status");
    expect(data).not.toHaveProperty("total");
    expect(data).not.toHaveProperty("amountRefunded");
  });

  it("leaves the payment alone when archiving fails", async () => {
    storage.upload.mockRejectedValue(new Error("cloudinary 503"));

    expect(await service.generate("inv_1")).toBe(false);
    expect(prisma.invoice.update.mock.calls[0][0].data.pdfStatus).toBe("FAILED");
  });

  it("records generation events on the audit trail", async () => {
    await service.generate("inv_1");

    expect(prisma.invoiceAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ event: "INVOICE_GENERATED" })
      })
    );
  });

  it("records a failure event rather than swallowing it", async () => {
    pdf.renderInvoice.mockRejectedValue(new Error("boom"));
    await service.generate("inv_1");

    expect(prisma.invoiceAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ event: "INVOICE_GENERATION_FAILED" })
      })
    );
  });

  it("skips an invoice another worker already claimed", async () => {
    // The conditional claim matched no rows, so something else has it.
    prisma.invoice.updateMany.mockResolvedValue({ count: 0 });

    expect(await service.generate("inv_1")).toBe(false);
    expect(pdf.renderInvoice).not.toHaveBeenCalled();
  });

  it("does not re-render an invoice that is already READY", async () => {
    const module = await Test.createTestingModule({
      providers: [
        InvoiceGenerationService,
        InvoiceAuditService,
        {
          provide: InvoiceService,
          useValue: {
            getById: jest
              .fn()
              .mockResolvedValue({ ...invoice, pdfStatus: "READY" })
          }
        },
        { provide: CreditNoteService, useValue: { getById: jest.fn() } },
        { provide: InvoicePdfService, useValue: pdf },
        { provide: InvoiceStorageService, useValue: storage },
        { provide: InvoiceEmailService, useValue: email },
        { provide: getQueueToken(INVOICE_QUEUE), useValue: queue },
        { provide: MessagingDispatchService, useValue: messaging },
        { provide: MessagingRuleService, useValue: rules },
        { provide: WhatsAppService, useValue: whatsapp },
        { provide: JobLockService, useValue: createJobLockStub() },
        { provide: PrismaService, useValue: prisma }
      ]
    }).compile();

    expect(await module.get(InvoiceGenerationService).generate("inv_1")).toBe(true);
    expect(pdf.renderInvoice).not.toHaveBeenCalled();
  });

  it("still produces a PDF when object storage is unconfigured", async () => {
    storage.isConfigured.mockReturnValue(false);

    expect(await service.generate("inv_1")).toBe(true);
    expect(storage.upload).not.toHaveBeenCalled();
    // Marked READY with no storage key: it renders on demand instead.
    expect(prisma.invoice.update.mock.calls[0][0].data.pdfStorageKey).toBeNull();
  });

  it("serves an archived PDF without re-rendering", async () => {
    prisma.invoice.findUnique.mockResolvedValue({ pdfStorageKey: "key" });
    storage.download.mockResolvedValue(Buffer.from("%PDF-archived"));

    const result = await service.getInvoicePdf(invoice);

    expect(result.toString()).toBe("%PDF-archived");
    expect(pdf.renderInvoice).not.toHaveBeenCalled();
  });

  it("falls back to rendering when the archive is missing", async () => {
    prisma.invoice.findUnique.mockResolvedValue({ pdfStorageKey: "key" });
    storage.download.mockResolvedValue(null);

    // A failed background render must be invisible to the customer: they ask
    // for their receipt and they get one.
    const result = await service.getInvoicePdf(invoice);

    expect(result.toString()).toContain("%PDF-");
    expect(pdf.renderInvoice).toHaveBeenCalled();
  });

  it("retries failed generations on the sweep", async () => {
    prisma.invoice.findMany.mockResolvedValue([{ id: "inv_1" }, { id: "inv_2" }]);

    await service.sweepFailedGenerations();

    expect(pdf.renderInvoice).toHaveBeenCalledTimes(2);
  });

  it("reclaims generations stuck mid-flight so they are retried", async () => {
    await service.sweepFailedGenerations();

    expect(prisma.invoice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ pdfStatus: "GENERATING" }),
        data: expect.objectContaining({ pdfStatus: "FAILED" })
      })
    );
  });

  it("does not sweep when another container holds the lock", async () => {
    jobLocks.runExclusive.mockResolvedValueOnce({ acquired: false });

    await service.sweepFailedGenerations();

    expect(prisma.invoice.findMany).not.toHaveBeenCalled();
  });
});

/**
 * The queue is a nudge, not the source of truth. `pdfStatus` plus the sweep is
 * what guarantees an invoice eventually gets a PDF; BullMQ just means a
 * container restarted mid-render does not lose the work.
 */
describe("InvoiceGenerationService queueing", () => {
  const ORIGINAL_REDIS = process.env.REDIS_URL;

  afterEach(() => {
    if (ORIGINAL_REDIS === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = ORIGINAL_REDIS;
    jest.resetModules();
  });

  function build(redisUrl: string | undefined) {
    if (redisUrl) process.env.REDIS_URL = redisUrl;
    else delete process.env.REDIS_URL;

    // The service reads queue-enablement at construction, and getApiEnv caches
    // its parse, so the module graph has to be rebuilt for each variant.
    // `require` rather than `import()`: this suite runs as CJS under ts-jest.
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { InvoiceGenerationService: Service } = require("./invoice-generation.service");

    const queue = { add: jest.fn().mockResolvedValue({ id: "job_1" }) };
    const pdf = {
      renderInvoice: jest.fn().mockResolvedValue(Buffer.from("%PDF-")),
      renderCreditNote: jest.fn().mockResolvedValue(Buffer.from("%PDF-"))
    };

    const prisma = {
      invoice: {
        findUnique: jest.fn().mockResolvedValue({ pdfStorageKey: null }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([])
      },
      creditNote: {
        findUnique: jest.fn().mockResolvedValue({ pdfStorageKey: null }),
        update: jest.fn().mockResolvedValue({})
      },
      invoiceAuditLog: { create: jest.fn().mockResolvedValue({}) },
      $queryRaw: jest.fn().mockResolvedValue([{ locked: true }])
    };

    const service = new Service(
      { record: jest.fn(), recordTx: jest.fn(), recordInBackground: jest.fn() } as never,
      { getById: jest.fn() } as never,
      { sendInvoiceIssued: jest.fn().mockResolvedValue(true) } as never,
      queue as never,
      {
        getById: jest.fn().mockResolvedValue({
          id: "inv_1",
          number: "NEXA-INV-2026-000001",
          pdfStatus: "PENDING",
          invoiceDate: "2026-09-14T10:32:00.000Z"
        })
      } as never,
      createJobLockStub() as never,
      { dispatchInBackground: jest.fn() } as never,
      {
        getRule: jest.fn().mockResolvedValue({
          enabled: false,
          whatsappEnabled: false,
          inAppEnabled: false
        })
      } as never,
      pdf as never,
      prisma as never,
      {
        isConfigured: jest.fn().mockReturnValue(false),
        warnIfUnconfigured: jest.fn()
      } as never,
      { isConfigured: jest.fn().mockReturnValue(false) } as never
    );

    return { service, queue, pdf };
  }

  it("enqueues the render instead of blocking the webhook", async () => {
    const { service, queue, pdf } = build("redis://localhost:6379");

    await service.enqueueInvoicePdf("inv_1");

    expect(queue.add).toHaveBeenCalledWith(
      "generate-invoice-pdf",
      expect.objectContaining({ invoiceId: "inv_1" }),
      // Derived from the row, so two redelivered webhooks collapse to one job.
      expect.objectContaining({ jobId: "invoice-pdf--inv_1" })
    );
    expect(pdf.renderInvoice).not.toHaveBeenCalled();
  });

  it("gives a forced retry its own job id so BullMQ cannot swallow it", async () => {
    const { service, queue } = build("redis://localhost:6379");

    await service.enqueueInvoicePdf("inv_1", { force: true });

    const jobId = queue.add.mock.calls[0][2].jobId as string;
    expect(jobId).toMatch(/^invoice-pdf--inv_1--\d+$/);
  });

  it("renders inline when REDIS_URL is unset, rather than dropping the job", async () => {
    const { service, queue, pdf } = build(undefined);

    await service.enqueueInvoicePdf("inv_1");

    // createDisabledQueue would have logged and discarded it, leaving the
    // invoice PENDING until the 10-minute sweep — wrong for local dev.
    expect(queue.add).not.toHaveBeenCalled();
    expect(pdf.renderInvoice).toHaveBeenCalled();
  });
});

/**
 * "Invoice sent to WhatsApp" means the parent gets the actual PDF in the chat,
 * not a link to chase. These guard the two things that make that safe: the
 * upload only happens when the rule wants it, and nothing here can fail a
 * payment that has already settled.
 */
describe("InvoiceGenerationService WhatsApp delivery", () => {
  let service: InvoiceGenerationService;
  let messaging: { dispatchInBackground: jest.Mock };
  let rules: { getRule: jest.Mock };
  let whatsapp: { isConfigured: jest.Mock; tryUploadMedia: jest.Mock };
  let storage: { isConfigured: jest.Mock; download: jest.Mock; warnIfUnconfigured: jest.Mock };

  const invoice = {
    id: "inv_1",
    number: "NEXA-INV-2026-000001",
    pdfStatus: "READY",
    invoiceDate: "2026-09-14T10:32:00.000Z"
  } as unknown as InvoiceItem;

  function buildWith(ruleOverrides: Record<string, unknown>) {
    messaging = { dispatchInBackground: jest.fn() };
    rules = {
      getRule: jest.fn().mockResolvedValue({
        enabled: true,
        whatsappEnabled: false,
        inAppEnabled: true,
        ...ruleOverrides
      })
    };
    whatsapp = {
      isConfigured: jest.fn().mockReturnValue(true),
      tryUploadMedia: jest
        .fn()
        .mockResolvedValue({ ok: true, mediaId: "media_abc123" })
    };
    storage = {
      isConfigured: jest.fn().mockReturnValue(false),
      download: jest.fn().mockResolvedValue(null),
      warnIfUnconfigured: jest.fn()
    };

    const prisma = {
      invoice: {
        findUnique: jest.fn().mockResolvedValue({ pdfStorageKey: null }),
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([])
      },
      creditNote: { findUnique: jest.fn(), update: jest.fn() },
      invoiceAuditLog: { create: jest.fn().mockResolvedValue({}) },
      $queryRaw: jest.fn().mockResolvedValue([{ locked: true }])
    };

    service = new InvoiceGenerationService(
      { record: jest.fn(), recordTx: jest.fn(), recordInBackground: jest.fn() } as never,
      { getById: jest.fn() } as never,
      { sendInvoiceIssued: jest.fn().mockResolvedValue(true) } as never,
      { add: jest.fn() } as never,
      { getById: jest.fn().mockResolvedValue(invoice) } as never,
      createJobLockStub() as never,
      messaging as never,
      rules as never,
      {
        renderInvoice: jest.fn().mockResolvedValue(Buffer.from("%PDF-")),
        renderCreditNote: jest.fn()
      } as never,
      prisma as never,
      storage as never,
      whatsapp as never
    );
  }

  it("attaches the PDF as a document when the rule enables WhatsApp", async () => {
    buildWith({ whatsappEnabled: true });

    await service.generateAndDeliver("inv_1", { sendEmail: false });

    expect(whatsapp.tryUploadMedia).toHaveBeenCalledWith(
      expect.any(Buffer),
      "NEXA-INV-2026-000001.pdf"
    );
    expect(messaging.dispatchInBackground).toHaveBeenCalledWith({
      event: "INVOICE_ISSUED",
      invoiceId: "inv_1",
      document: { mediaId: "media_abc123", filename: "NEXA-INV-2026-000001.pdf" }
    });
  });

  it("does not ship a PDF to Meta for an in-app-only rule", async () => {
    buildWith({ whatsappEnabled: false, inAppEnabled: true });

    await service.generateAndDeliver("inv_1", { sendEmail: false });

    expect(whatsapp.tryUploadMedia).not.toHaveBeenCalled();
    expect(messaging.dispatchInBackground).toHaveBeenCalledWith(
      expect.objectContaining({ event: "INVOICE_ISSUED", document: undefined })
    );
  });

  it("still sends the message when the upload fails, minus the attachment", async () => {
    buildWith({ whatsappEnabled: true });
    whatsapp.tryUploadMedia.mockResolvedValue({
      ok: false,
      error: { message: "rate limited", status: 429, retryable: true }
    });

    await service.generateAndDeliver("inv_1", { sendEmail: false });

    // Degrades to the link in the body rather than dropping the receipt.
    expect(messaging.dispatchInBackground).toHaveBeenCalledWith(
      expect.objectContaining({ document: undefined })
    );
  });

  it("skips WhatsApp entirely when it is not configured", async () => {
    buildWith({ whatsappEnabled: true });
    whatsapp.isConfigured.mockReturnValue(false);

    await service.generateAndDeliver("inv_1", { sendEmail: false });

    expect(whatsapp.tryUploadMedia).not.toHaveBeenCalled();
    expect(messaging.dispatchInBackground).toHaveBeenCalled();
  });

  it("sends nothing when an admin has disabled the rule", async () => {
    buildWith({ enabled: false });

    await service.generateAndDeliver("inv_1", { sendEmail: false });

    expect(messaging.dispatchInBackground).not.toHaveBeenCalled();
  });

  it("never lets a messaging failure escape into the payment path", async () => {
    buildWith({ whatsappEnabled: true });
    rules.getRule.mockRejectedValue(new Error("messaging is down"));

    // The invoice exists and the payment is settled; neither may be undone by
    // a messaging problem.
    await expect(
      service.generateAndDeliver("inv_1", { sendEmail: false })
    ).resolves.toBeUndefined();
  });
});

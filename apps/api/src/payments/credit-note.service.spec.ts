import { BadRequestException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { DEFAULT_INVOICE_SETTINGS } from "@nexa-chess/types";
import { CreditNoteService } from "./credit-note.service";
import { InvoiceAuditService } from "./invoice-audit.service";
import { InvoiceSettingsService } from "./invoice-settings.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Credit notes (§19).
 *
 * The guarantee: a refund produces its own numbered document and never edits
 * the invoice it reverses, and however many times a settled refund is
 * re-processed there is still exactly one credit note for it.
 */
describe("CreditNoteService", () => {
  let service: CreditNoteService;
  let tx: {
    $queryRaw: jest.Mock;
    invoice: { findUnique: jest.Mock };
    creditNote: {
      findUnique: jest.Mock;
      create: jest.Mock;
      aggregate: jest.Mock;
    };
    creditNoteSequence: { upsert: jest.Mock };
    invoiceAuditLog: { create: jest.Mock };
  };

  const invoice = {
    id: "inv_1",
    number: "NEXA-INV-2026-000001",
    userId: "usr_1",
    currency: "INR",
    subtotal: 100000,
    taxableAmount: 100000,
    cgstAmount: 9000,
    sgstAmount: 9000,
    igstAmount: 0,
    taxTotal: 18000,
    total: 118000,
    lines: [
      {
        productId: "plan_1",
        description: "NexaChess Premium Plan",
        quantity: 1,
        unitAmount: 100000,
        discountAmount: 0,
        taxRate: 18,
        taxAmount: 18000,
        amount: 100000
      }
    ],
    billingName: "Priya Raghunathan",
    billingEmail: "priya@example.com",
    billingPhone: null,
    billingLine1: null,
    billingLine2: null,
    billingCity: "Bengaluru",
    billingState: "Karnataka",
    billingStateCode: "29",
    billingPostalCode: "560038",
    billingCountry: "IN",
    customerGstin: null,
    businessName: null,
    seller: { legalName: "NexaChess", country: "IN" }
  };

  beforeEach(async () => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      invoice: { findUnique: jest.fn().mockResolvedValue(invoice) },
      creditNote: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: "cn_1", ...data })),
        aggregate: jest.fn().mockResolvedValue({ _sum: { total: 0 } })
      },
      creditNoteSequence: {
        upsert: jest.fn().mockResolvedValue({ year: 2026, lastNumber: 1 })
      },
      invoiceAuditLog: { create: jest.fn().mockResolvedValue({}) }
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditNoteService,
        InvoiceAuditService,
        {
          provide: InvoiceSettingsService,
          useValue: {
            get: jest.fn().mockResolvedValue(DEFAULT_INVOICE_SETTINGS)
          }
        },
        { provide: PrismaService, useValue: {} }
      ]
    }).compile();

    service = module.get(CreditNoteService);
  });

  function created() {
    return tx.creditNote.create.mock.calls[0][0].data;
  }

  const fullRefund = {
    invoiceId: "inv_1",
    refundId: "ref_1",
    amount: 118000
  };

  it("issues a numbered credit note for a full refund", async () => {
    await service.issueForRefund(tx as never, fullRefund);

    expect(created().number).toBe("CN/26-27/00001");
    expect(created().total).toBe(118000);
    expect(created().isFullCredit).toBe(true);
  });

  it("reverses tax in the proportion it was charged on a partial refund", async () => {
    await service.issueForRefund(tx as never, { ...fullRefund, amount: 59000 });

    const data = created();
    expect(data.total).toBe(59000);
    expect(data.cgstAmount).toBe(4500);
    expect(data.sgstAmount).toBe(4500);
    expect(data.subtotal).toBe(50000);
    expect(data.isFullCredit).toBe(false);
  });

  it("returns the existing note when a settled refund is re-processed", async () => {
    const existing = { id: "cn_1", number: "NEXA-CN-2026-000001" };
    tx.creditNote.findUnique.mockResolvedValue(existing);

    const result = await service.issueForRefund(tx as never, fullRefund);

    expect(result).toBe(existing);
    expect(tx.creditNote.create).not.toHaveBeenCalled();
  });

  it("copies the invoice's billing and seller details rather than joining", async () => {
    await service.issueForRefund(tx as never, fullRefund);

    // The credit note must still render correctly if the buyer later edits
    // their billing profile.
    expect(created().billing.name).toBe("Priya Raghunathan");
    expect(created().seller.legalName).toBe("NexaChess");
  });

  it("itemises a full credit but summarises a partial one", async () => {
    await service.issueForRefund(tx as never, fullRefund);
    expect(created().lines).toHaveLength(1);
    expect(created().lines[0].description).toBe("NexaChess Premium Plan");

    tx.creditNote.create.mockClear();
    await service.issueForRefund(tx as never, {
      ...fullRefund,
      refundId: "ref_2",
      amount: 59000
    });
    // A partial refund cannot honestly claim which item came back.
    expect(created().lines[0].description).toBe(
      "Partial refund against the original invoice"
    );
  });

  it("refuses to credit more than the invoice was worth", async () => {
    await expect(
      service.issueForRefund(tx as never, { ...fullRefund, amount: 200000 })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("counts earlier credits so repeated partials cannot over-credit", async () => {
    tx.creditNote.aggregate.mockResolvedValue({ _sum: { total: 100000 } });

    // 100000 already credited of 118000 leaves 18000.
    await expect(
      service.issueForRefund(tx as never, { ...fullRefund, amount: 20000 })
    ).rejects.toBeInstanceOf(BadRequestException);

    await service.issueForRefund(tx as never, { ...fullRefund, amount: 18000 });
    expect(created().isFullCredit).toBe(true);
  });

  it("refuses once the invoice is fully credited", async () => {
    tx.creditNote.aggregate.mockResolvedValue({ _sum: { total: 118000 } });

    await expect(
      service.issueForRefund(tx as never, { ...fullRefund, amount: 1 })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("writes an audit entry for the credit note", async () => {
    await service.issueForRefund(tx as never, fullRefund);

    expect(tx.invoiceAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event: "CREDIT_NOTE_CREATED",
          invoiceId: "inv_1"
        })
      })
    );
  });
});

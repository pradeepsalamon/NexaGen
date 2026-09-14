import { Test, type TestingModule } from "@nestjs/testing";
import {
  DEFAULT_INVOICE_SETTINGS,
  type InvoiceLine,
  type InvoiceSettings
} from "@nexa-chess/types";
import { BillingProfileService } from "./billing-profile.service";
import { InvoiceSettingsService } from "./invoice-settings.service";
import { InvoiceService, type IssueInvoiceInput } from "./invoice.service";
import { describePurchase } from "./payment.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Invoice issuance.
 *
 * The two properties worth guarding: one captured order produces exactly one
 * invoice however many times the capture path runs (§1, §22), and every figure
 * printed comes from the order row rather than anything a client sent (§6).
 */
describe("InvoiceService.issue", () => {
  let service: InvoiceService;
  let tx: {
    invoice: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
    invoiceSequence: { upsert: jest.Mock };
    user: { findUnique: jest.Mock };
  };

  const settings: InvoiceSettings = {
    ...DEFAULT_INVOICE_SETTINGS,
    legalName: "NexaChess Learning Private Limited",
    tradeName: "NexaChess",
    country: "IN",
    // Karnataka, so a Karnataka buyer is intra-state and a Kerala one is not.
    gstin: "29AABCU9603R1ZM",
    taxLabel: "GST"
  };

  const buyer = {
    id: "usr_1",
    role: "STUDENT",
    email: "student@example.com",
    phoneNumber: "+91 98450 11223",
    firstName: "Arjun",
    lastName: "Menon",
    billingProfile: null,
    studentProfile: {
      parentName: "Priya Raghunathan",
      parentEmail: "priya@example.com",
      parentPhone: "+91 98450 11223"
    }
  };

  const input: IssueInvoiceInput = {
    orderId: "ord_1",
    paymentId: "pay_1",
    userId: "usr_1",
    items: [
      {
        productId: "plan_1",
        description: "NexaChess Premium Plan",
        quantity: 1,
        unitAmount: 99900
      }
    ],
    discountAmount: 0,
    discountCode: null,
    taxPercent: 18,
    currency: "INR",
    paidAt: new Date("2026-09-14T10:32:00.000Z"),
    provider: "RAZORPAY",
    paymentMethod: "UPI",
    methodDetail: "upi/googlepay",
    transactionId: "pay_QrS7xKmN2Lp"
  };

  let sequenceCounter: number;

  beforeEach(async () => {
    sequenceCounter = 0;

    tx = {
      invoice: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve({ id: "inv_1", ...data })),
        update: jest.fn()
      },
      invoiceSequence: {
        upsert: jest.fn().mockImplementation(() => {
          sequenceCounter += 1;
          return Promise.resolve({ year: 2026, lastNumber: sequenceCounter });
        })
      },
      user: { findUnique: jest.fn().mockResolvedValue(buyer) }
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceService,
        BillingProfileService,
        {
          provide: InvoiceSettingsService,
          useValue: { get: jest.fn().mockResolvedValue(settings) }
        },
        {
          provide: PrismaService,
          useValue: { user: { findUnique: jest.fn().mockResolvedValue(buyer) } }
        }
      ]
    }).compile();

    service = module.get(InvoiceService);
  });

  function created() {
    return tx.invoice.create.mock.calls[0][0].data;
  }

  it("issues one invoice with a sequential number", async () => {
    await service.issue(tx as never, input);

    expect(created().number).toBe("NEXA-INV-2026-000001");
    expect(tx.invoice.create).toHaveBeenCalledTimes(1);
  });

  it("returns the existing invoice when the capture is replayed", async () => {
    const existing = { id: "inv_1", number: "NEXA-INV-2026-000001" };
    tx.invoice.findUnique.mockResolvedValue(existing);

    const result = await service.issue(tx as never, input);

    // A redelivered webhook must not renumber or re-issue (§22).
    expect(result).toBe(existing);
    expect(tx.invoice.create).not.toHaveBeenCalled();
    expect(tx.invoiceSequence.upsert).not.toHaveBeenCalled();
  });

  it("bills a student account to the parent, not the student", async () => {
    await service.issue(tx as never, input);

    // §5: a student's invoice is addressed to whoever actually pays.
    expect(created().billingName).toBe("Priya Raghunathan");
    expect(created().billingEmail).toBe("priya@example.com");
  });

  it("splits CGST and SGST for a buyer in the seller's state", async () => {
    tx.user.findUnique.mockResolvedValue({
      ...buyer,
      billingProfile: {
        name: "Raghunathan Tutorials LLP",
        email: "billing@example.com",
        phone: null,
        line1: null,
        line2: null,
        city: "Bengaluru",
        state: "Karnataka",
        stateCode: "29",
        postalCode: "560038",
        country: "IN",
        gstin: "29AABCU9603R1ZM",
        businessName: "Raghunathan Tutorials LLP"
      }
    });

    await service.issue(tx as never, input);

    expect(created().taxTreatment).toBe("INTRA_STATE");
    expect(created().cgstAmount).toBe(8991);
    expect(created().sgstAmount).toBe(8991);
    expect(created().igstAmount).toBe(0);
    expect(created().taxTotal).toBe(17982);
    expect(created().total).toBe(117882);
  });

  it("charges IGST for a buyer in another state", async () => {
    tx.user.findUnique.mockResolvedValue({
      ...buyer,
      billingProfile: {
        name: "Kerala Chess Academy",
        email: "hello@example.com",
        phone: null,
        line1: null,
        line2: null,
        city: "Kochi",
        state: "Kerala",
        stateCode: "32",
        postalCode: "682001",
        country: "IN",
        gstin: "32AABCU9603R1ZM",
        businessName: "Kerala Chess Academy"
      }
    });

    await service.issue(tx as never, input);

    expect(created().taxTreatment).toBe("INTER_STATE");
    expect(created().igstAmount).toBe(17982);
    expect(created().cgstAmount).toBe(0);
    expect(created().customerGstin).toBe("32AABCU9603R1ZM");
  });

  it("taxes the discounted subtotal and records the code", async () => {
    await service.issue(tx as never, {
      ...input,
      items: [{ ...input.items[0], unitAmount: 149900 }],
      discountAmount: 50000,
      discountCode: "DIWALI25"
    });

    const data = created();
    expect(data.subtotal).toBe(149900);
    expect(data.discountAmount).toBe(50000);
    expect(data.discountCode).toBe("DIWALI25");
    // 18% of 99900, not of 149900.
    expect(data.taxableAmount).toBe(99900);
    expect(data.taxTotal).toBe(17982);
  });

  it("spreads a discount across multiple line items without losing a paisa", async () => {
    await service.issue(tx as never, {
      ...input,
      items: [
        { productId: "p1", description: "Premium plan", quantity: 1, unitAmount: 99900 },
        {
          productId: "p2",
          description: "Coaching package",
          quantity: 10,
          unitAmount: 50000
        }
      ],
      discountAmount: 50000
    });

    const data = created();
    const lines = data.lines as InvoiceLine[];

    expect(lines).toHaveLength(2);
    expect(lines.reduce((sum, line) => sum + line.discountAmount, 0)).toBe(50000);
    expect(lines.reduce((sum, line) => sum + line.amount, 0)).toBe(
      data.taxableAmount
    );
  });

  it("apportions tax across lines so they sum to the invoice tax total", async () => {
    await service.issue(tx as never, {
      ...input,
      items: [
        { productId: "p1", description: "Premium plan", quantity: 1, unitAmount: 99901 },
        { productId: "p2", description: "Coaching", quantity: 3, unitAmount: 33333 }
      ]
    });

    const data = created();
    const lines = data.lines as InvoiceLine[];

    expect(lines.reduce((sum, line) => sum + line.taxAmount, 0)).toBe(data.taxTotal);
  });

  it("charges no GST on an export and records it as such", async () => {
    tx.user.findUnique.mockResolvedValue({
      ...buyer,
      billingProfile: {
        name: "Jane Doe",
        email: "jane@example.com",
        phone: null,
        line1: null,
        line2: null,
        city: "San Francisco",
        state: "California",
        stateCode: null,
        postalCode: "94103",
        country: "US",
        gstin: null,
        businessName: null
      }
    });

    await service.issue(tx as never, { ...input, currency: "USD" });

    expect(created().taxTreatment).toBe("EXPORT");
    expect(created().taxTotal).toBe(0);
    expect(created().currency).toBe("USD");
    expect(created().total).toBe(99900);
  });

  it("freezes the payment facts onto the invoice", async () => {
    await service.issue(tx as never, input);

    const data = created();
    expect(data.paymentProvider).toBe("RAZORPAY");
    expect(data.paymentMethod).toBe("UPI");
    expect(data.transactionId).toBe("pay_QrS7xKmN2Lp");
    // A snapshot, so a later change to the payment row cannot rewrite a
    // receipt someone already downloaded.
    expect(data.seller.legalName).toBe("NexaChess Learning Private Limited");
  });

  it("issues consecutive numbers for consecutive captures", async () => {
    await service.issue(tx as never, input);
    await service.issue(tx as never, { ...input, orderId: "ord_2" });

    expect(tx.invoice.create.mock.calls[0][0].data.number).toBe(
      "NEXA-INV-2026-000001"
    );
    expect(tx.invoice.create.mock.calls[1][0].data.number).toBe(
      "NEXA-INV-2026-000002"
    );
  });
});

describe("InvoiceService.recordRefund", () => {
  let service: InvoiceService;
  let tx: { invoice: { findUnique: jest.Mock; update: jest.Mock } };

  beforeEach(async () => {
    tx = {
      invoice: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: "inv_1", status: "PAID", total: 118000 }),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({ id: "inv_1", ...data })
        )
      }
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceService,
        { provide: BillingProfileService, useValue: {} },
        { provide: InvoiceSettingsService, useValue: {} },
        { provide: PrismaService, useValue: {} }
      ]
    }).compile();

    service = module.get(InvoiceService);
  });

  it("marks a partial refund without voiding the invoice", async () => {
    await service.recordRefund(tx as never, "ord_1", 59000, false);

    const data = tx.invoice.update.mock.calls[0][0].data;
    expect(data.amountRefunded).toBe(59000);
    expect(data.status).toBe("PARTIALLY_REFUNDED");
  });

  it("marks a full refund as REFUNDED", async () => {
    await service.recordRefund(tx as never, "ord_1", 118000, true);

    expect(tx.invoice.update.mock.calls[0][0].data.status).toBe("REFUNDED");
  });

  it("never rewrites the invoice's own amounts", async () => {
    await service.recordRefund(tx as never, "ord_1", 59000, false);

    // §19: the figures on an issued invoice are immutable; only the refunded
    // total and the status move.
    const data = tx.invoice.update.mock.calls[0][0].data;
    expect(Object.keys(data).sort()).toEqual(["amountRefunded", "status"]);
  });

  it("does nothing when the order has no invoice", async () => {
    tx.invoice.findUnique.mockResolvedValue(null);

    await expect(
      service.recordRefund(tx as never, "ord_1", 100, false)
    ).resolves.toBeNull();
    expect(tx.invoice.update).not.toHaveBeenCalled();
  });
});

/**
 * What the invoice line calls the purchase.
 *
 * A batch's price is a Plan carrying that batch's id, and its name is whatever
 * the admin typed — so "Monthly fee" alone does not tell a parent what they
 * bought. The batch and the interval are what make the receipt legible.
 */
describe("describePurchase", () => {
  it("names the batch alongside the plan", () => {
    expect(
      describePurchase({
        name: "Term fee",
        interval: "MONTHLY",
        batch: { name: "Saturday Intermediate" }
      })
    ).toBe("Term fee — Saturday Intermediate (Monthly)");
  });

  it("keeps a plan name that already says the interval unchanged", () => {
    // "Monthly fee (Monthly)" reads like a bug, so the suffix is suppressed.
    expect(
      describePurchase({
        name: "Monthly fee",
        interval: "MONTHLY",
        batch: { name: "Saturday Intermediate" }
      })
    ).toBe("Monthly fee — Saturday Intermediate");
  });

  it("does not repeat a batch name the plan name already carries", () => {
    expect(
      describePurchase({
        name: "Saturday Intermediate — Term fee",
        interval: "ONE_TIME",
        batch: { name: "Saturday Intermediate" }
      })
    ).toBe("Saturday Intermediate — Term fee");
  });

  it("does not repeat an interval the plan name already states", () => {
    expect(
      describePurchase({
        name: "Monthly Coaching",
        interval: "MONTHLY",
        batch: null
      })
    ).toBe("Monthly Coaching");
  });

  it("leaves a one-time standalone plan exactly as named", () => {
    expect(
      describePurchase({
        name: "NexaChess Premium Plan",
        interval: "ONE_TIME",
        batch: null
      })
    ).toBe("NexaChess Premium Plan");
  });

  it("marks a recurring standalone plan with its interval", () => {
    expect(
      describePurchase({
        name: "NexaChess Premium",
        interval: "YEARLY",
        batch: null
      })
    ).toBe("NexaChess Premium (Yearly)");
  });

  it("falls back to a generic label when the plan is gone", () => {
    // Plan deletion is SetNull, so a very old order can have none.
    expect(describePurchase(null)).toBe("NexaChess purchase");
    expect(describePurchase(undefined)).toBe("NexaChess purchase");
  });

  /**
   * This runs inside the capture transaction, so it must not throw on a
   * partial row. A thrown label would roll back a payment that already
   * succeeded — the exact failure the invoice design exists to prevent.
   */
  it("never throws on a partial or malformed plan row", () => {
    expect(describePurchase({ name: "Term fee" })).toBe("Term fee");
    expect(describePurchase({ name: "Term fee", interval: null })).toBe("Term fee");
    expect(describePurchase({ name: "  ", interval: "MONTHLY" })).toBe(
      "NexaChess purchase"
    );
    expect(
      describePurchase({ name: "Term fee", batch: { name: null } })
    ).toBe("Term fee");
    expect(
      describePurchase({
        name: "Term fee",
        interval: "WEEKLY" as never,
        batch: null
      })
    ).toBe("Term fee");
  });
});

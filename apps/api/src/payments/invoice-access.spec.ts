import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { UserRole, type User } from "@prisma/client";
import { BillingProfileService } from "./billing-profile.service";
import { InvoiceSettingsService } from "./invoice-settings.service";
import { InvoiceService } from "./invoice.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * §14: changing the id in the URL must not reach someone else's invoice.
 *
 * The check lives in the service, not the controller, so every route that
 * returns an invoice — JSON, PDF, HTML, audit trail — is covered by the same
 * assertion rather than each remembering to do it.
 */
describe("invoice access control", () => {
  let service: InvoiceService;
  let prisma: { invoice: { findUnique: jest.Mock } };

  function user(id: string, role: UserRole = UserRole.STUDENT): User {
    return { id, role, status: "ACTIVE" } as User;
  }

  const row = {
    id: "inv_1",
    number: "NEXA-INV-2026-000001",
    userId: "usr_owner",
    orderId: "ord_1",
    paymentId: "pay_1",
    status: "PAID",
    pdfStatus: "READY",
    subtotal: 99900,
    discountAmount: 0,
    discountCode: null,
    taxableAmount: 99900,
    cgstAmount: 0,
    sgstAmount: 0,
    igstAmount: 0,
    taxTotal: 0,
    total: 99900,
    amountRefunded: 0,
    currency: "INR",
    taxTreatment: "NONE",
    taxRatePercent: 0,
    taxLabel: null,
    lines: [],
    billingName: "Priya Raghunathan",
    billingEmail: null,
    billingPhone: null,
    billingLine1: null,
    billingLine2: null,
    billingCity: null,
    billingState: null,
    billingStateCode: null,
    billingPostalCode: null,
    billingCountry: "IN",
    customerGstin: null,
    businessName: null,
    seller: { legalName: "NexaChess" },
    paymentProvider: "RAZORPAY",
    paymentMethod: "UPI",
    methodDetail: null,
    transactionId: null,
    notes: null,
    terms: null,
    footer: null,
    invoiceDate: new Date("2026-09-14T10:32:00.000Z"),
    dueDate: null,
    paidAt: new Date("2026-09-14T10:32:00.000Z"),
    emailSent: false,
    emailSentAt: null,
    createdAt: new Date("2026-09-14T10:32:00.000Z"),
    order: { orderNumber: "NEXA-2026-7F3K9Q" },
    user: { firstName: "Arjun", lastName: "Menon", email: "arjun@example.com" }
  };

  beforeEach(async () => {
    prisma = { invoice: { findUnique: jest.fn().mockResolvedValue(row) } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceService,
        { provide: BillingProfileService, useValue: {} },
        { provide: InvoiceSettingsService, useValue: {} },
        { provide: PrismaService, useValue: prisma }
      ]
    }).compile();

    service = module.get(InvoiceService);
  });

  it("lets the owner read their own invoice", async () => {
    const invoice = await service.get(user("usr_owner"), "inv_1");
    expect(invoice.number).toBe("NEXA-INV-2026-000001");
  });

  it("refuses another user's invoice", async () => {
    await expect(service.get(user("usr_other"), "inv_1")).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it("refuses a coach reading a student's invoice", async () => {
    // There is deliberately no coach view of a student's money.
    await expect(
      service.get(user("usr_coach", UserRole.COACH), "inv_1")
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("lets an admin read any invoice", async () => {
    await expect(
      service.get(user("usr_admin", UserRole.ADMIN), "inv_1")
    ).resolves.toMatchObject({ id: "inv_1" });

    await expect(
      service.get(user("usr_super", UserRole.SUPER_ADMIN), "inv_1")
    ).resolves.toMatchObject({ id: "inv_1" });
  });

  it("404s a missing invoice rather than leaking whether it exists", async () => {
    prisma.invoice.findUnique.mockResolvedValue(null);

    await expect(service.get(user("usr_owner"), "nope")).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it("never exposes raw payment credentials in the mapped invoice", async () => {
    const invoice = await service.get(user("usr_owner"), "inv_1");
    const serialized = JSON.stringify(invoice);

    // The mapped shape carries only safe, provider-supplied descriptors.
    expect(serialized).not.toMatch(/cvv/i);
    expect(serialized).not.toMatch(/\b\d{13,19}\b/);
    expect(Object.keys(invoice.payment).sort()).toEqual([
      "method",
      "methodDetail",
      "paidAt",
      "provider",
      "transactionId"
    ]);
  });
});

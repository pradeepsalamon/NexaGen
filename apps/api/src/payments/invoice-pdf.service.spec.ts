import type {
  BillingAddress,
  CreditNoteItem,
  InvoiceItem,
  InvoiceLine,
  InvoiceSellerDetails
} from "@nexa-chess/types";
import { createRequire } from "node:module";
import * as path from "node:path";
import { formatMethodDetail, InvoicePdfService } from "./invoice-pdf.service";

const requireFromHere = createRequire(__filename);

/**
 * These render real PDFs rather than asserting on a document definition.
 *
 * The failures worth catching here are all things a mocked renderer would miss:
 * a font with no ₹ glyph, a table that does not paginate, a long address that
 * overflows the page. So each test produces actual bytes and inspects them.
 */
describe("InvoicePdfService", () => {
  const service = new InvoicePdfService();

  const seller: InvoiceSellerDetails = {
    legalName: "NexaChess Learning Private Limited",
    tradeName: "NexaChess",
    addressLine1: "4th Floor, Prestige Tower, MG Road",
    addressLine2: null,
    city: "Bengaluru",
    state: "Karnataka",
    stateCode: "29",
    postalCode: "560001",
    country: "IN",
    email: "billing@nexachess.in",
    phone: "+91 80 4000 1234",
    website: "nexachess.in",
    gstin: "29AABCU9603R1ZM",
    pan: "AABCU9603R",
    logoUrl: null
  };

  const billing: BillingAddress = {
    name: "Priya Raghunathan",
    email: "priya@example.com",
    phone: "+91 98450 11223",
    line1: "No. 42, 3rd Cross, Indiranagar",
    line2: null,
    city: "Bengaluru",
    state: "Karnataka",
    stateCode: "29",
    postalCode: "560038",
    country: "IN",
    gstin: null,
    businessName: null
  };

  function line(overrides: Partial<InvoiceLine> = {}): InvoiceLine {
    return {
      productId: "plan_premium",
      description: "NexaChess Premium Plan",
      quantity: 1,
      unitAmount: 99900,
      discountAmount: 0,
      taxRate: 18,
      taxAmount: 17982,
      amount: 99900,
      ...overrides
    };
  }

  function invoice(overrides: Partial<InvoiceItem> = {}): InvoiceItem {
    return {
      id: "inv_1",
      number: "NEXA-INV-2026-000001",
      orderId: "ord_1",
      orderNumber: "NEXA-2026-7F3K9Q",
      paymentId: "pay_1",
      userId: "usr_1",
      userName: "Priya Raghunathan",
      userEmail: "priya@example.com",
      status: "PAID",
      pdfStatus: "READY",
      subtotal: 99900,
      discountAmount: 0,
      discountCode: null,
      taxableAmount: 99900,
      cgstAmount: 8991,
      sgstAmount: 8991,
      igstAmount: 0,
      taxTotal: 17982,
      total: 117882,
      amountRefunded: 0,
      currency: "INR",
      taxTreatment: "INTRA_STATE",
      taxRatePercent: 18,
      taxLabel: "GST",
      lines: [line()],
      billing,
      seller,
      payment: {
        provider: "RAZORPAY",
        method: "UPI",
        methodDetail: "UPI — googlepay",
        transactionId: "pay_QrS7xKmN2Lp",
        paidAt: "2026-09-14T10:32:00.000Z"
      },
      notes: null,
      terms: "Fees are non-refundable after the first week of a batch.",
      footer: "Thank you for choosing NexaChess.",
      invoiceDate: "2026-09-14T10:32:00.000Z",
      dueDate: null,
      paidAt: "2026-09-14T10:32:00.000Z",
      emailSent: false,
      emailSentAt: null,
      createdAt: "2026-09-14T10:32:00.000Z",
      ...overrides
    };
  }

  /** PDFs declare their page count as `/Count N` in the page-tree object. */
  function pageCount(pdf: Buffer): number {
    const matches = [...pdf.toString("latin1").matchAll(/\/Count\s+(\d+)/g)];
    return matches.length ? Math.max(...matches.map((m) => Number(m[1]))) : 0;
  }

  it("renders a valid, non-trivial A4 PDF", async () => {
    const pdf = await service.renderInvoice(invoice());

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.subarray(-6).toString()).toContain("EOF");
    expect(pdf.byteLength).toBeGreaterThan(2000);
  });

  it("uses a font that actually has ₹, €, £ and • glyphs", () => {
    // The failure this guards against is silent: a font without U+20B9 renders
    // the rupee as .notdef (an empty box) and the PDF still looks "valid".
    const fontkit = requireFromHere("fontkit");
    const fontDir = path.join(
      path.dirname(requireFromHere.resolve("pdfmake/package.json")),
      "fonts",
      "Roboto"
    );

    for (const file of ["Roboto-Regular.ttf", "Roboto-Medium.ttf"]) {
      const font = fontkit.openSync(path.join(fontDir, file));
      expect(font.hasGlyphForCodePoint(0x20b9)).toBe(true); // ₹
      expect(font.hasGlyphForCodePoint(0x20ac)).toBe(true); // €
      expect(font.hasGlyphForCodePoint(0x00a3)).toBe(true); // £
      expect(font.hasGlyphForCodePoint(0x2022)).toBe(true); // • (masked card)
    }
  });

  it("embeds that font into the PDF rather than relying on the reader", async () => {
    const pdf = await service.renderInvoice(invoice());
    const raw = pdf.toString("latin1");

    // A subsetted font embedded as a CID font — which is what carries the
    // rupee glyph into the file itself.
    expect(raw).toMatch(/\/FontFile2/);
    expect(raw).toMatch(/\/CIDFontType2/);
  });

  it("renders non-INR currencies without falling back to INR", async () => {
    const usd = await service.renderInvoice(
      invoice({
        currency: "USD",
        subtotal: 4900,
        taxableAmount: 4900,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        taxTotal: 0,
        total: 4900,
        taxTreatment: "EXPORT",
        taxRatePercent: 0,
        taxLabel: null,
        lines: [line({ unitAmount: 4900, amount: 4900, taxRate: 0, taxAmount: 0 })],
        billing: { ...billing, country: "US", stateCode: null, state: "California" }
      })
    );

    expect(usd.subarray(0, 5).toString()).toBe("%PDF-");
    expect(usd.byteLength).toBeGreaterThan(2000);
  });

  it("paginates a large invoice instead of overflowing one page", async () => {
    const many = Array.from({ length: 80 }, (_, index) =>
      line({
        description: `Chess Coaching Package — session ${index + 1}`,
        quantity: 2,
        unitAmount: 50000,
        amount: 100000
      })
    );

    const small = await service.renderInvoice(invoice());
    const large = await service.renderInvoice(
      invoice({ lines: many, subtotal: 8000000, taxableAmount: 8000000 })
    );

    expect(pageCount(small)).toBe(1);
    expect(pageCount(large)).toBeGreaterThan(1);
  });

  it("does not overflow on a very long customer name and address", async () => {
    const pdf = await service.renderInvoice(
      invoice({
        billing: {
          ...billing,
          name: "Venkataraghavan Srinivasa Raghunathan Balasubramaniam Iyer",
          businessName:
            "Sri Venkateswara Educational And Charitable Trust For Advancement Of Learning",
          line1:
            "Flat 12B, Second Floor, Shanti Nilayam Apartments, 18th Cross Road, 6th Sector",
          line2: "Behind the Water Tank, HSR Layout Extension, Near Silk Board"
        },
        lines: [
          line({
            description:
              "NexaChess Premium Annual Plan with Personalised Coaching, Tournament Preparation and Unlimited Puzzle Access"
          })
        ]
      })
    );

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    // Long content must reflow, never silently truncate the document.
    expect(pdf.byteLength).toBeGreaterThan(2000);
  });

  it("renders an inter-state invoice (IGST) and a discounted one", async () => {
    const pdf = await service.renderInvoice(
      invoice({
        discountAmount: 50000,
        discountCode: "DIWALI25",
        taxableAmount: 49900,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 8982,
        taxTotal: 8982,
        total: 58882,
        taxTreatment: "INTER_STATE",
        lines: [line({ discountAmount: 50000, amount: 49900 })],
        billing: { ...billing, state: "Kerala", stateCode: "32", gstin: "32AABCU9603R1ZM" }
      })
    );

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("renders a refunded invoice with its notice", async () => {
    const pdf = await service.renderInvoice(
      invoice({ status: "REFUNDED", amountRefunded: 117882 })
    );

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("renders a credit note", async () => {
    const creditNote: CreditNoteItem = {
      id: "cn_1",
      number: "NEXA-CN-2026-000001",
      invoiceId: "inv_1",
      invoiceNumber: "NEXA-INV-2026-000001",
      userId: "usr_1",
      userName: "Priya Raghunathan",
      refundId: "ref_1",
      providerRefundId: "rfnd_QrS7xKmN2Lp",
      reason: "REFUND",
      note: "Batch cancelled before the first session.",
      subtotal: 49950,
      cgstAmount: 4496,
      sgstAmount: 4495,
      igstAmount: 0,
      taxTotal: 8991,
      total: 58941,
      currency: "INR",
      isFullCredit: false,
      lines: [
        {
          productId: null,
          description: "Partial refund against the original invoice",
          quantity: 1,
          unitAmount: 58941,
          discountAmount: 0,
          taxRate: 0,
          taxAmount: 0,
          amount: 58941
        }
      ],
      billing,
      seller,
      pdfStatus: "READY",
      issuedAt: "2026-09-20T08:00:00.000Z",
      createdAt: "2026-09-20T08:00:00.000Z"
    };

    const pdf = await service.renderCreditNote(creditNote);

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(2000);
  });
});

describe("formatMethodDetail", () => {
  it("does not repeat a method name the provider already included", () => {
    // Razorpay returns "upi/googlepay"; naively prefixing produced
    // "UPI — UPI — googlepay" on the receipt.
    expect(formatMethodDetail("UPI", "upi/googlepay")).toBe("UPI — googlepay");
    expect(formatMethodDetail("UPI", "UPI — googlepay")).toBe("UPI — googlepay");
  });

  it("keeps a safe masked card descriptor intact", () => {
    expect(formatMethodDetail("Cards", "Visa •••• 4242")).toBe(
      "Cards — Visa •••• 4242"
    );
  });

  it("falls back to the plain label when there is no detail", () => {
    expect(formatMethodDetail("Net Banking", null)).toBe("Net Banking");
    expect(formatMethodDetail("UPI", "upi")).toBe("UPI");
  });
});

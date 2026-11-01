import {
  computeCreditBreakdown,
  computeTax,
  financialYear,
  formatDocumentNumber,
  invoiceSettingsSchema,
  isValidGstin,
  resolveTaxTreatment,
  stateCodeFromGstin,
  sumInvoiceLines,
  type InvoiceLine,
  type TaxContext
} from "@nexa-chess/types";

/**
 * The tax engine (§8).
 *
 * The rule these tests protect is "do not blindly assume CGST+SGST or IGST".
 * Getting the treatment wrong is not a rounding bug — it is charging the wrong
 * tax to the wrong authority on a document someone files.
 */
describe("resolveTaxTreatment", () => {
  const base: TaxContext = {
    sellerStateCode: "29", // Karnataka
    sellerCountry: "IN",
    buyerStateCode: "29",
    buyerCountry: "IN",
    ratePercent: 18,
    buyerHasGstin: true
  };

  it("splits CGST + SGST when buyer and seller are in the same state", () => {
    expect(resolveTaxTreatment(base)).toBe("INTRA_STATE");
  });

  it("charges IGST when the buyer is in a different state", () => {
    expect(resolveTaxTreatment({ ...base, buyerStateCode: "32" })).toBe(
      "INTER_STATE"
    );
  });

  it("treats a sale abroad as a zero-rated export, whatever the plan's rate", () => {
    expect(
      resolveTaxTreatment({ ...base, buyerCountry: "US", buyerStateCode: null })
    ).toBe("EXPORT");
  });

  it("charges no tax at all when the seller is not GST-registered", () => {
    expect(resolveTaxTreatment({ ...base, sellerStateCode: null })).toBe("NONE");
  });

  it("charges no tax when the plan carries no rate", () => {
    expect(resolveTaxTreatment({ ...base, ratePercent: 0 })).toBe("NONE");
  });

  it("defaults an addressless buyer to the seller's own state", () => {
    // Without a buyer address there is nothing proving an inter-state supply,
    // so the place of supply is the seller's state.
    expect(resolveTaxTreatment({ ...base, buyerStateCode: null })).toBe(
      "INTRA_STATE"
    );
  });
});

describe("computeTax", () => {
  const karnataka: TaxContext = {
    sellerStateCode: "29",
    sellerCountry: "IN",
    buyerStateCode: "29",
    buyerCountry: "IN",
    ratePercent: 18,
    buyerHasGstin: false
  };

  it("halves the rate across CGST and SGST", () => {
    const tax = computeTax(100000, karnataka);

    expect(tax.treatment).toBe("INTRA_STATE");
    expect(tax.cgstRate).toBe(9);
    expect(tax.sgstRate).toBe(9);
    expect(tax.cgstAmount).toBe(9000);
    expect(tax.sgstAmount).toBe(9000);
    expect(tax.igstAmount).toBe(0);
    expect(tax.taxTotal).toBe(18000);
  });

  it("puts the whole rate on IGST for an inter-state sale", () => {
    const tax = computeTax(100000, { ...karnataka, buyerStateCode: "32" });

    expect(tax.treatment).toBe("INTER_STATE");
    expect(tax.igstRate).toBe(18);
    expect(tax.igstAmount).toBe(18000);
    expect(tax.cgstAmount + tax.sgstAmount).toBe(0);
    expect(tax.taxTotal).toBe(18000);
  });

  it("always reports a tax total equal to the sum of its components", () => {
    // Odd amounts are where an independently-rounded split drifts from the
    // printed total, which is exactly the figure someone reconciles against.
    for (const amount of [1, 7, 333, 99901, 123457]) {
      const tax = computeTax(amount, karnataka);
      expect(tax.cgstAmount + tax.sgstAmount + tax.igstAmount).toBe(tax.taxTotal);
    }
  });

  it("charges nothing on an export", () => {
    const tax = computeTax(100000, {
      ...karnataka,
      buyerCountry: "US",
      buyerStateCode: null
    });

    expect(tax.treatment).toBe("EXPORT");
    expect(tax.taxTotal).toBe(0);
    expect(tax.ratePercent).toBe(0);
  });
});

describe("sumInvoiceLines", () => {
  it("taxes the discounted subtotal, not the list price", () => {
    const lines: InvoiceLine[] = [
      {
        productId: "p1",
        description: "Premium plan",
        quantity: 1,
        unitAmount: 149900,
        discountAmount: 50000,
        taxRate: 18,
        taxAmount: 0,
        amount: 99900
      }
    ];

    const totals = sumInvoiceLines(lines);

    expect(totals.subtotal).toBe(149900);
    expect(totals.discountTotal).toBe(50000);
    // Taxing 149900 instead of 99900 would overcharge the buyer.
    expect(totals.taxableAmount).toBe(99900);
  });

  it("sums multiple line items including quantities", () => {
    const lines: InvoiceLine[] = [
      {
        productId: "p1",
        description: "Premium plan",
        quantity: 1,
        unitAmount: 99900,
        discountAmount: 0,
        taxRate: 0,
        taxAmount: 0,
        amount: 99900
      },
      {
        productId: "p2",
        description: "Coaching package",
        quantity: 10,
        unitAmount: 50000,
        discountAmount: 0,
        taxRate: 0,
        taxAmount: 0,
        amount: 500000
      }
    ];

    expect(sumInvoiceLines(lines).subtotal).toBe(599900);
  });
});

describe("computeCreditBreakdown", () => {
  const invoice = {
    taxableAmount: 100000,
    cgstAmount: 9000,
    sgstAmount: 9000,
    igstAmount: 0,
    total: 118000
  };

  it("reverses the whole invoice on a full credit", () => {
    const credit = computeCreditBreakdown(invoice, 118000);

    expect(credit.total).toBe(118000);
    expect(credit.cgstAmount).toBe(9000);
    expect(credit.sgstAmount).toBe(9000);
    expect(credit.subtotal).toBe(100000);
  });

  it("splits tax proportionally on a partial credit", () => {
    const credit = computeCreditBreakdown(invoice, 59000);

    expect(credit.total).toBe(59000);
    expect(credit.cgstAmount).toBe(4500);
    expect(credit.sgstAmount).toBe(4500);
    expect(credit.subtotal).toBe(50000);
  });

  it("always re-adds to exactly the amount credited", () => {
    for (const amount of [1, 999, 33333, 117999]) {
      const credit = computeCreditBreakdown(invoice, amount);
      expect(credit.subtotal + credit.taxTotal).toBe(credit.total);
      expect(credit.total).toBe(amount);
    }
  });

  it("never credits more than the invoice was worth", () => {
    expect(computeCreditBreakdown(invoice, 500000).total).toBe(118000);
  });
});

describe("invoice numbering", () => {
  it("formats GST Rule 46 numbers within 16 characters", () => {
    expect(formatDocumentNumber("INV", 2026, 1)).toBe("INV/26-27/00001");
    expect(formatDocumentNumber("CN", 2026, 7)).toBe("CN/26-27/00007");
    expect(formatDocumentNumber("NEXA", 2099, 99_999)).toBe("NEXA/99-00/99999");
    expect(formatDocumentNumber("NEXA", 2099, 99_999).length).toBe(16);
  });

  it("does not truncate once the sequence passes five digits", () => {
    expect(formatDocumentNumber("INV", 2026, 123_456)).toBe("INV/26-27/123456");
  });

  it("shortens the year rather than pass 16 characters", () => {
    expect(formatDocumentNumber("NEXA", 2026, 100_000)).toBe("NEXA/26/100000");
    expect(formatDocumentNumber("NEXA", 2026, 99_999_999)).toBe("NEXA/26/99999999");
    expect(() => formatDocumentNumber("NEXA", 2026, 100_000_000)).toThrow(/16-character/);
  });

  it("keys the series by the Indian financial year, in IST", () => {
    expect(financialYear(new Date("2026-03-31T18:29:59Z"))).toBe(2025); // 23:59 IST 31 Mar
    expect(financialYear(new Date("2026-03-31T18:30:00Z"))).toBe(2026); // 00:00 IST 1 Apr
    expect(financialYear(new Date("2026-12-31T19:00:00Z"))).toBe(2026); // 00:30 IST 1 Jan 2027
  });

  it("accepts only short GST-safe prefixes", () => {
    const parse = (invoicePrefix: string) => invoiceSettingsSchema.shape.invoicePrefix.safeParse(invoicePrefix).success;
    expect(parse("INV")).toBe(true);
    expect(parse("NX-1")).toBe(true);
    expect(parse("NEXA-INV")).toBe(false);
    expect(parse("IN/V")).toBe(false);
  });
});

describe("GSTIN handling", () => {
  it("accepts a valid GSTIN and reads its state code", () => {
    expect(isValidGstin("29AABCU9603R1ZM")).toBe(true);
    expect(stateCodeFromGstin("29AABCU9603R1ZM")).toBe("29");
  });

  it("rejects malformed GSTINs rather than deriving a wrong state", () => {
    // A bad state code would silently flip CGST+SGST to IGST.
    expect(isValidGstin("29AABCU9603R1Z")).toBe(false);
    expect(stateCodeFromGstin("not-a-gstin")).toBeNull();
    expect(stateCodeFromGstin(null)).toBeNull();
  });
});

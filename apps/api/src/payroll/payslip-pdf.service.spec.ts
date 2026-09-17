import type { PayslipDocument } from "@nexa-chess/types";
import { PayslipPdfService } from "./payslip-pdf.service";

/**
 * Renders real PDFs rather than asserting on a document definition — mirrors
 * `payments/invoice-pdf.service.spec.ts`. The failures worth catching here
 * are things a mocked renderer would miss: a font with no ₹ glyph, a
 * document that fails to build at all for a given input shape.
 */
describe("PayslipPdfService", () => {
  const service = new PayslipPdfService();

  function payslip(overrides: Partial<PayslipDocument> = {}): PayslipDocument {
    return {
      documentNumber: "NEXA-PAY-2026-000001",
      documentKind: "PAYSLIP",
      issuedAt: "2026-10-05T00:00:00.000Z",
      period: {
        periodType: "MONTHLY",
        startDate: "2026-09-01T00:00:00.000Z",
        endDate: "2026-10-01T00:00:00.000Z"
      },
      coach: { name: "John Doe", engagementType: "EMPLOYEE" },
      currency: "INR",
      teachingSummary: {
        scheduledClassesCount: 45,
        completedClassesCount: 42,
        cancelledByCoachCount: 1,
        cancelledByStudentCount: 1,
        cancelledByAdminCount: 1,
        noShowCount: 0,
        totalTeachingSeconds: Math.round(38.5 * 3600),
        totalBoardSeconds: 1000
      },
      earningsBreakdown: {
        version: 1,
        lineItems: [
          { label: "Teaching hours", quantity: 38.5, rateMinor: 50000, amountMinor: 1925000, source: "CLASS" },
          { label: "Bonus", amountMinor: 150000, source: "RULE" }
        ]
      },
      grossEarningsMinor: 2275000,
      totalDeductionsMinor: 0,
      totalAdjustmentsMinor: 0,
      netPayableMinor: 2275000,
      payoutStatus: null,
      paidAt: null,
      ...overrides
    };
  }

  it("renders a valid PDF", async () => {
    const pdf = await service.renderPayslip(payslip());
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.subarray(-6).toString()).toContain("EOF");
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });

  it("renders for a PAYMENT_STATEMENT document kind the same as PAYSLIP", async () => {
    const pdf = await service.renderPayslip(
      payslip({ documentKind: "PAYMENT_STATEMENT", coach: { name: "Jane Doe", engagementType: "CONTRACTOR" } })
    );
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });

  it("renders with deductions and adjustments present", async () => {
    const pdf = await service.renderPayslip(
      payslip({
        earningsBreakdown: {
          version: 1,
          lineItems: [
            { label: "Teaching hours", quantity: 10, rateMinor: 50000, amountMinor: 500000, source: "CLASS" },
            { label: "Deduction", amountMinor: 30000, source: "RULE" }
          ]
        },
        totalDeductionsMinor: 30000,
        totalAdjustmentsMinor: -20000,
        grossEarningsMinor: 500000,
        netPayableMinor: 450000
      })
    );
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("renders with zero earnings without crashing", async () => {
    const pdf = await service.renderPayslip(
      payslip({
        earningsBreakdown: { version: 1, lineItems: [] },
        grossEarningsMinor: 0,
        netPayableMinor: 0
      })
    );
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("renders a long coach name and long line item labels without crashing", async () => {
    const pdf = await service.renderPayslip(
      payslip({
        coach: {
          name: "Venkataramanujan Subrahmanyaneshwaran Iyengar the Third of Bengaluru",
          engagementType: "FREELANCER"
        },
        earningsBreakdown: {
          version: 1,
          lineItems: [
            {
              label:
                "Private lessons conducted across multiple batches including weekend intensives and tournament preparation sessions",
              amountMinor: 100000,
              source: "CLASS"
            }
          ]
        }
      })
    );
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("renders a non-INR currency", async () => {
    const pdf = await service.renderPayslip(payslip({ currency: "USD", netPayableMinor: 250000 }));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("renders with a PAID payout status and date", async () => {
    const pdf = await service.renderPayslip(
      payslip({ payoutStatus: "PAID", paidAt: "2026-10-06T00:00:00.000Z" })
    );
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});

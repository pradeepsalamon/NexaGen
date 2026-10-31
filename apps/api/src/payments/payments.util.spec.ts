import {
  formatMoney,
  percentOf,
  toMajorUnits,
  toMinorUnits
} from "@nexa-chess/types";
import {
  addMonths,
  computeAccessEnd,
  generateOrderNumber,
  normalizePhone,
  priceOrder,
  supportsRecurringMethod
} from "./payments.util";

describe("money", () => {
  it("round-trips major and minor units without drift", () => {
    expect(toMinorUnits(999, "INR")).toBe(99900);
    expect(toMajorUnits(99900, "INR")).toBe(999);
    // The classic float trap: 19.99 * 100 is 1998.9999999999998.
    expect(toMinorUnits(19.99, "USD")).toBe(1999);
    expect(toMinorUnits(0.1 + 0.2, "USD")).toBe(30);
  });

  it("treats zero-decimal currencies as having no minor unit", () => {
    expect(toMinorUnits(500, "JPY")).toBe(500);
    expect(toMajorUnits(500, "JPY")).toBe(500);
  });

  it("formats money in the right locale for the currency", () => {
    // Indian grouping, not thousands-grouping.
    expect(formatMoney(12345600, "INR")).toContain("1,23,456");
    expect(formatMoney(199900, "USD")).toContain("1,999.00");
  });

  it("rounds tax to whole minor units", () => {
    expect(percentOf(99900, 18)).toBe(17982);
    expect(percentOf(100, 18)).toBe(18);
    // 0.5 of a paisa rounds up rather than silently disappearing.
    expect(percentOf(99, 18)).toBe(18);
  });
});

describe("priceOrder", () => {
  it("adds tax on top of the plan amount", () => {
    expect(priceOrder(99900, 18)).toEqual({
      subtotal: 99900,
      taxAmount: 17982,
      total: 117882
    });
  });

  it("charges no tax when the plan has none", () => {
    expect(priceOrder(99900, 0)).toEqual({
      subtotal: 99900,
      taxAmount: 0,
      total: 99900
    });
  });
});

describe("addMonths", () => {
  it("clamps to the end of a shorter month", () => {
    // 31 Jan + 1 month must be 28/29 Feb, not 2/3 March.
    expect(addMonths(new Date("2026-01-31T00:00:00Z"), 1).toISOString()).toBe(
      "2026-02-28T00:00:00.000Z"
    );
    expect(addMonths(new Date("2024-01-31T00:00:00Z"), 1).toISOString()).toBe(
      "2024-02-29T00:00:00.000Z"
    );
  });

  it("rolls the year over", () => {
    expect(addMonths(new Date("2026-11-15T10:00:00Z"), 3).toISOString()).toBe(
      "2027-02-15T10:00:00.000Z"
    );
  });
});

describe("computeAccessEnd", () => {
  const from = new Date("2026-09-14T00:00:00Z");

  it("gives a one-time plan perpetual access", () => {
    expect(
      computeAccessEnd({ interval: "ONE_TIME", accessDays: null }, from)
    ).toBeNull();
  });

  it("gives a recurring plan exactly its billing interval", () => {
    expect(
      computeAccessEnd({ interval: "MONTHLY", accessDays: null }, from)
    ).toEqual(new Date("2026-10-14T00:00:00Z"));
    expect(
      computeAccessEnd({ interval: "YEARLY", accessDays: null }, from)
    ).toEqual(new Date("2027-09-14T00:00:00Z"));
  });

  it("lets an explicit accessDays override the interval", () => {
    expect(
      computeAccessEnd({ interval: "ONE_TIME", accessDays: 30 }, from)
    ).toEqual(new Date("2026-10-14T00:00:00Z"));
  });
});

describe("normalizePhone", () => {
  it("strips separators", () => {
    expect(normalizePhone("+91 98765-43210")).toBe("919876543210");
  });

  it("expands a national number with the default country code", () => {
    expect(normalizePhone("09876543210", "91")).toBe("919876543210");
    expect(normalizePhone("9876543210", "91")).toBe("919876543210");
  });

  it("rejects anything that cannot be a phone number", () => {
    expect(normalizePhone("")).toBeUndefined();
    expect(normalizePhone(null)).toBeUndefined();
    expect(normalizePhone("123")).toBeUndefined();
  });
});

describe("order and invoice numbering", () => {
  it("produces readable, unambiguous order numbers", () => {
    const number = generateOrderNumber("NEXA", new Date("2026-09-14T00:00:00Z"));
    expect(number).toMatch(/^NEXA-2026-[2-9A-HJ-NP-Z]{6}$/);
    // The random suffix carries no 0/O/1/I, so support can read one aloud
    // without ambiguity. (The year part is literal, so it is excluded.)
    expect(number.slice("NEXA-2026-".length)).not.toMatch(/[01IO]/);
  });

  it("does not repeat itself", () => {
    const numbers = new Set(
      Array.from({ length: 200 }, () => generateOrderNumber("NEXA"))
    );
    expect(numbers.size).toBe(200);
  });

});

describe("supportsRecurringMethod", () => {
  it("allows only methods that can actually hold a mandate", () => {
    expect(supportsRecurringMethod("UPI")).toBe(true);
    expect(supportsRecurringMethod("CARD")).toBe(true);
    // Net banking and wallets cannot be mandated — §13's warning.
    expect(supportsRecurringMethod("NET_BANKING")).toBe(false);
    expect(supportsRecurringMethod("WALLET")).toBe(false);
    expect(supportsRecurringMethod(null)).toBe(false);
  });
});

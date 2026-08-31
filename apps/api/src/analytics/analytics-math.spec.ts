import {
  deltaPct,
  densifySeries,
  enumerateBuckets,
  forecastStorage,
  makeKpi,
  roundTo
} from "./analytics-math";

describe("analytics-math", () => {
  describe("deltaPct", () => {
    it("computes a normal change", () => {
      expect(deltaPct(120, 100)).toBe(20);
      expect(deltaPct(80, 100)).toBe(-20);
    });
    it("returns null without a usable baseline", () => {
      expect(deltaPct(10, 0)).toBeNull();
      expect(deltaPct(10, null)).toBeNull();
      expect(deltaPct(null, 10)).toBeNull();
    });
  });

  describe("makeKpi", () => {
    it("flags insufficient history when previous is missing or zero", () => {
      expect(makeKpi(5, null).insufficientHistory).toBe(true);
      expect(makeKpi(5, 0).insufficientHistory).toBe(true);
      expect(makeKpi(5, 4).insufficientHistory).toBe(false);
    });
  });

  describe("enumerateBuckets", () => {
    it("lists each day in the window", () => {
      const keys = enumerateBuckets(
        new Date("2026-01-01T00:00:00Z"),
        new Date("2026-01-04T00:00:00Z"),
        "day"
      );
      expect(keys).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
    });
    it("truncates weeks to Monday", () => {
      const keys = enumerateBuckets(
        new Date("2026-01-07T00:00:00Z"), // Wednesday
        new Date("2026-01-20T00:00:00Z"),
        "week"
      );
      expect(keys[0]).toBe("2026-01-05");
    });
  });

  describe("densifySeries", () => {
    it("gap-fills and carries a cumulative total", () => {
      const counts = new Map([
        ["2026-01-01", 2],
        ["2026-01-03", 5]
      ]);
      const points = densifySeries(
        counts,
        new Date("2026-01-01T00:00:00Z"),
        new Date("2026-01-04T00:00:00Z"),
        "day",
        { cumulative: true, cumulativeBase: 10 }
      );
      expect(points).toEqual([
        { date: "2026-01-01", value: 2, secondary: 12 },
        { date: "2026-01-02", value: 0, secondary: 12 },
        { date: "2026-01-03", value: 5, secondary: 17 }
      ]);
    });
  });

  describe("forecastStorage", () => {
    it("returns null without enough history", () => {
      expect(
        forecastStorage(
          [{ at: new Date(), bytes: 1 }],
          100,
          70,
          85
        )
      ).toBeNull();
    });

    it("projects days-to-threshold on a linear trend", () => {
      const points = Array.from({ length: 20 }, (_, i) => ({
        at: new Date(2026, 0, i + 1),
        bytes: i * 10 // +10 bytes/day
      }));
      const forecast = forecastStorage(points, 1000, 70, 85);
      expect(forecast).not.toBeNull();
      expect(forecast!.avgMonthlyGrowthBytes).toBe(300);
      // current ~190 bytes, warn at 700 → ~51 days
      expect(forecast!.daysUntilWarning).toBeGreaterThan(40);
      expect(forecast!.daysUntilWarning).toBeLessThan(65);
    });
  });

  it("roundTo respects decimals", () => {
    expect(roundTo(1.2345, 2)).toBe(1.23);
    expect(roundTo(1.25, 1)).toBe(1.3);
  });
});

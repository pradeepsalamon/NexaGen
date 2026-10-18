import { resolveAnalyticsRange } from "./analytics-range.util";

const TZ = "Asia/Kolkata";
// 2026-08-31 12:00 UTC → 2026-08-31 17:30 IST
const NOW = new Date("2026-08-31T12:00:00.000Z");

describe("resolveAnalyticsRange", () => {
  it("defaults to last 30 days with a previous-period comparison", () => {
    const r = resolveAnalyticsRange(undefined, TZ, NOW);
    expect(r.preset).toBe("last30");
    expect(r.compare).toBe("prevPeriod");
    const spanDays = Math.round(
      (r.end.getTime() - r.start.getTime()) / 86_400_000
    );
    expect(spanDays).toBe(30);
    expect(r.compareStart).not.toBeNull();
    expect(r.compareEnd!.getTime()).toBe(r.start.getTime());
  });

  it("resolves 'today' to the IST calendar day", () => {
    const r = resolveAnalyticsRange({ preset: "today" }, TZ, NOW);
    // IST midnight of 2026-08-31 = 2026-08-30T18:30:00Z
    expect(r.start.toISOString()).toBe("2026-08-30T18:30:00.000Z");
    expect(r.end.toISOString()).toBe("2026-08-31T18:30:00.000Z");
  });

  it("resolves 'thisMonth' to the calendar month", () => {
    const r = resolveAnalyticsRange({ preset: "thisMonth" }, TZ, NOW);
    expect(r.start.toISOString()).toBe("2026-07-31T18:30:00.000Z"); // Aug 1 IST
    expect(r.end.toISOString()).toBe("2026-08-31T18:30:00.000Z"); // Sep 1 IST
  });

  it("resolves 'prevMonth'", () => {
    const r = resolveAnalyticsRange({ preset: "prevMonth" }, TZ, NOW);
    expect(r.start.toISOString()).toBe("2026-06-30T18:30:00.000Z"); // Jul 1 IST
    expect(r.end.toISOString()).toBe("2026-07-31T18:30:00.000Z"); // Aug 1 IST
  });

  it("resolves a custom range inclusive of the end day", () => {
    const r = resolveAnalyticsRange(
      { preset: "custom", from: "2026-08-01", to: "2026-08-07" },
      TZ,
      NOW
    );
    expect(r.preset).toBe("custom");
    const spanDays = Math.round(
      (r.end.getTime() - r.start.getTime()) / 86_400_000
    );
    expect(spanDays).toBe(7);
  });

  it("picks a coarser granularity for long ranges", () => {
    expect(
      resolveAnalyticsRange({ preset: "last7" }, TZ, NOW).granularity
    ).toBe("day");
    expect(
      resolveAnalyticsRange({ preset: "thisYear" }, TZ, NOW).granularity
    ).toBe("month");
  });

  it("honours an explicit granularity override", () => {
    expect(
      resolveAnalyticsRange(
        { preset: "thisYear", granularity: "week" },
        TZ,
        NOW
      ).granularity
    ).toBe("week");
  });
});

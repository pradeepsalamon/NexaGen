import { zonedDayBounds, DEFAULT_TIME_ZONE } from "./time";

describe("zonedDayBounds", () => {
  it("returns a 24h span aligned to local midnight in the given zone", () => {
    // 2026-03-15T02:00:00Z is 2026-03-15 07:30 in Asia/Kolkata (UTC+5:30).
    const { start, end } = zonedDayBounds("Asia/Kolkata", new Date("2026-03-15T02:00:00Z"));
    expect(start.toISOString()).toBe("2026-03-14T18:30:00.000Z"); // 2026-03-15 00:00 IST
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("late evening does not bleed into tomorrow's classes", () => {
    // 2026-03-15T20:00:00Z = 2026-03-16 01:30 IST — already the next day.
    const { start, end } = zonedDayBounds("Asia/Kolkata", new Date("2026-03-15T20:00:00Z"));
    expect(start.toISOString()).toBe("2026-03-15T18:30:00.000Z"); // 2026-03-16 00:00 IST
    expect(end.toISOString()).toBe("2026-03-16T18:30:00.000Z");
  });

  it("falls back to the default zone for a bad IANA name", () => {
    const bad = zonedDayBounds("Not/AZone", new Date("2026-03-15T02:00:00Z"));
    const good = zonedDayBounds(DEFAULT_TIME_ZONE, new Date("2026-03-15T02:00:00Z"));
    expect(bad.start.toISOString()).toBe(good.start.toISOString());
  });

  it("handles a null timezone", () => {
    expect(() => zonedDayBounds(null)).not.toThrow();
  });
});

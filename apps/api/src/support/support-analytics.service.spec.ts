import { firstReplyMinutes, localDate, percentile } from "./support-analytics.service";

describe("support analytics helpers", () => {
  it("takes nearest-rank percentiles", () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([4], 0.9)).toBe(4);
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBe(9);
  });

  it("buckets by the asked time zone's calendar day", () => {
    const lateUtc = new Date("2026-11-14T20:00:00.000Z");
    expect(localDate(lateUtc, "UTC")).toBe("2026-11-14");
    expect(localDate(lateUtc, "Asia/Kolkata")).toBe("2026-11-15");
  });

  it("measures each hand-off to the first staff reply after it, in its own conversation", () => {
    const at = (minute: number) => new Date(Date.UTC(2026, 10, 14, 10, minute));
    const result = firstReplyMinutes(
      [
        { at: at(0), conversationId: "a" },
        { at: at(30), conversationId: "a" },
        { at: at(5), conversationId: "b" },
        { at: at(0), conversationId: "c" }
      ],
      [
        { at: at(12), conversationId: "a" },
        { at: at(40), conversationId: "a" },
        // A reply in another conversation never answers "c".
        { at: at(6), conversationId: "b" }
      ]
    );
    expect(result).toEqual({ minutes: [1, 10, 12], waiting: 1 });
  });
});

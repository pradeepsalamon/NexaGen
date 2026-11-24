import {
  computeDailyStreak,
  dailyPuzzleLevelFor,
  longestDailyStreak,
  resolveDailyPuzzleSource
} from "@nexa-chess/types";
import { dailyPickKey } from "./daily-puzzle.service";

// The pure rules of Puzzle of the Day (docs/PUZZLE_OF_THE_DAY.md); the service
// itself runs against real Postgres in daily-puzzle.int-spec.ts.
describe("Puzzle of the Day rules", () => {
  it("levels follow the student's puzzle rating", () => {
    expect([799, 1199, 1200, 1599, 1600, 2400].map(dailyPuzzleLevelFor)).toEqual([
      "EASY",
      "EASY",
      "MEDIUM",
      "MEDIUM",
      "HARD",
      "HARD"
    ]);
  });

  it("a batch override beats the academy's, which beats the automatic pick", () => {
    expect(resolveDailyPuzzleSource({ academy: "a", auto: "x", batch: "b" })).toEqual({ source: "BATCH", value: "b" });
    expect(resolveDailyPuzzleSource({ academy: "a", auto: "x", batch: null })).toEqual({ source: "ACADEMY", value: "a" });
    expect(resolveDailyPuzzleSource({ academy: null, auto: "x", batch: null })).toEqual({ source: "AUTO", value: "x" });
    expect(resolveDailyPuzzleSource({ academy: null, auto: null, batch: null })).toBeNull();
  });

  it("the streak runs back from today, or from yesterday while today is open", () => {
    const days = ["2026-11-18", "2026-11-19", "2026-11-20"];
    expect(computeDailyStreak(days, "2026-11-21")).toBe(3);
    expect(computeDailyStreak([...days, "2026-11-21"], "2026-11-21")).toBe(4);
    expect(computeDailyStreak(days, "2026-11-22")).toBe(0);
    expect(computeDailyStreak([], "2026-11-21")).toBe(0);
    // Across a month end.
    expect(computeDailyStreak(["2026-11-30", "2026-12-01"], "2026-12-01")).toBe(2);
  });

  it("the best streak is the longest run, duplicates ignored", () => {
    expect(longestDailyStreak(["2026-11-01", "2026-11-02", "2026-11-02", "2026-11-05", "2026-11-06", "2026-11-07"])).toBe(3);
    expect(longestDailyStreak([])).toBe(0);
  });

  it("the pick key is stable per academy, day and level", () => {
    expect(dailyPickKey("t", "2026-11-21", "EASY")).toBe(dailyPickKey("t", "2026-11-21", "EASY"));
    expect(dailyPickKey("t", "2026-11-21", "EASY")).not.toBe(dailyPickKey("t", "2026-11-22", "EASY"));
    expect(dailyPickKey("t", "2026-11-21", "EASY")).toBeGreaterThanOrEqual(0);
  });
});

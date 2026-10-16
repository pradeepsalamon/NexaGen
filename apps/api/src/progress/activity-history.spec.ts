import {
  THEME_MIN_SAMPLE,
  TREND_MIN_SAMPLE,
  accuracyStats,
  activityGranularity,
  classifyTrend,
  isAttemptedOutcome,
  pickWeakThemes,
  studentActivityHistoryQuerySchema,
  type ActivityThemeStat
} from "@nexa-chess/types";

// The pure rules behind the activity summary (shared by the API and the web).
// The SQL that feeds them is covered by activity-history.int-spec.ts.

const theme = (key: string, graded: number, correct: number): ActivityThemeStat => ({
  ...accuracyStats(graded, correct),
  key,
  kind: "THEME",
  label: key
});

describe("accuracyStats", () => {
  it("is correct over graded, rounded, and null with nothing graded", () => {
    expect(accuracyStats(3, 2)).toEqual({ accuracyPercent: 67, correctAttempts: 2, gradedAttempts: 3, incorrectAttempts: 1 });
    expect(accuracyStats(0, 0).accuracyPercent).toBeNull();
  });
});

describe("isAttemptedOutcome", () => {
  it("never counts what the student didn't do", () => {
    expect(["NOT_STARTED", "SKIPPED", "UNANSWERED"].map((o) => isAttemptedOutcome(o as never))).toEqual([false, false, false]);
    expect(["CORRECT", "PARTIAL", "INCORRECT", "UNGRADED", "INCOMPLETE"].every((o) => isAttemptedOutcome(o as never))).toBe(true);
  });
});

describe("activityGranularity", () => {
  it("uses days up to a month, weeks up to ~6 months, then months", () => {
    expect(activityGranularity("2026-10-01", "2026-10-31")).toBe("day");
    expect(activityGranularity("2026-09-30", "2026-10-31")).toBe("week");
    expect(activityGranularity("2026-01-01", "2026-10-31")).toBe("month");
    expect(activityGranularity(undefined, "2026-10-31")).toBe("month");
  });
});

describe("classifyTrend", () => {
  const n = TREND_MIN_SAMPLE;
  it("needs enough graded attempts on both sides", () => {
    expect(classifyTrend(accuracyStats(n - 1, 0), accuracyStats(n, n))).toBe("INSUFFICIENT_DATA");
  });
  it("calls a 10-point swing either way, anything less steady", () => {
    expect(classifyTrend(accuracyStats(10, 5), accuracyStats(10, 6))).toBe("IMPROVING");
    expect(classifyTrend(accuracyStats(10, 6), accuracyStats(10, 5))).toBe("DECLINING");
    expect(classifyTrend(accuracyStats(20, 10), accuracyStats(20, 11))).toBe("STEADY");
  });
});

describe("pickWeakThemes", () => {
  it("ignores small samples and flags only themes well below the overall figure", () => {
    const { comparable, weak } = pickWeakThemes(
      [
        theme("fork", 10, 3), // 30%
        theme("pin", 10, 6), // 60% — within 10 points of 65
        theme("mateIn2", THEME_MIN_SAMPLE - 1, 0), // too few to judge
        theme("skewer", 8, 2) // 25%
      ],
      65
    );
    expect(comparable).toBe(3);
    expect(weak.map((t) => t.key)).toEqual(["skewer", "fork"]);
  });
  it("shows the same tries once, under the most specific name", () => {
    const same = { ...accuracyStats(10, 2) };
    const { weak } = pickWeakThemes(
      [
        { ...same, key: "TACTICAL", kind: "TYPE", label: "Tactical" },
        { ...same, key: "f1", kind: "FOLDER", label: "Forks" },
        { ...same, key: "fork", kind: "THEME", label: "Fork" }
      ],
      60
    );
    expect(weak.map((t) => t.label)).toEqual(["Fork"]);
  });
  it("flags nothing without an overall accuracy", () => {
    expect(pickWeakThemes([theme("fork", 10, 0)], null).weak).toEqual([]);
  });
});

describe("history query", () => {
  it("rejects a reversed range and caps the page size", () => {
    expect(studentActivityHistoryQuerySchema.safeParse({ from: "2026-02-01", to: "2026-01-01" }).success).toBe(false);
    expect(studentActivityHistoryQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
    expect(studentActivityHistoryQuerySchema.safeParse({ limit: "25", status: "COMPLETED" }).success).toBe(true);
  });
});

import { buildWeeklyFacts, mondayOf, renderWeeklyReportText, weeklyReportRange, type WeeklyFactsInput } from "@nexa-chess/types";
import { weekDueForReports } from "./weekly-report.job";

// The pure weekly-report rules in @nexa-chess/types weekly-reports.ts (docs/WEEKLY_REPORTS.md).

const WEEK = "2026-11-16"; // Monday
const NOW = "2026-11-23T03:00:00.000Z"; // the following Monday, 08:30 in Kolkata

const base = (over: Partial<WeeklyFactsInput> = {}): WeeklyFactsInput => ({
  classes: [],
  dailyPuzzleDays: [],
  homework: [],
  now: NOW,
  playLastWeek: [],
  playThisWeek: [],
  puzzleAttempts: [],
  recapKeyPoints: [],
  revisionReviews: 0,
  rushRuns: [],
  timeZone: "Asia/Kolkata",
  weakSpots: null,
  weekStart: WEEK,
  ...over
});

const cls = (day: number, over: Partial<WeeklyFactsInput["classes"][number]> = {}): WeeklyFactsInput["classes"][number] => ({
  attendance: "PRESENT",
  endsAt: `2026-11-${day}T12:00:00.000Z`,
  startsAt: `2026-11-${day}T11:00:00.000Z`,
  status: "COMPLETED",
  title: "Class",
  topic: null,
  ...over
});

describe("weekly report rules", () => {
  it("finds the Monday of any day", () => {
    expect(mondayOf("2026-11-16")).toBe("2026-11-16");
    expect(mondayOf("2026-11-22")).toBe("2026-11-16"); // Sunday
    expect(mondayOf("2026-11-23")).toBe("2026-11-23");
  });

  it("builds a finished week only from 06:00 on the next Monday, academy time", () => {
    // 2026-11-23 00:15 IST: still the week before last.
    expect(weekDueForReports("Asia/Kolkata", new Date("2026-11-22T18:45:00Z"))).toBe("2026-11-09");
    expect(weekDueForReports("Asia/Kolkata", new Date("2026-11-23T00:29:00Z"))).toBe("2026-11-09");
    expect(weekDueForReports("Asia/Kolkata", new Date("2026-11-23T00:30:00Z"))).toBe("2026-11-16");
    expect(weekDueForReports("Asia/Kolkata", new Date("2026-11-26T10:00:00Z"))).toBe("2026-11-16");
  });

  it("counts held classes only, with missed ones and topics without repeats", () => {
    const facts = buildWeeklyFacts(
      base({
        classes: [
          cls(17, { topic: "Forks" }),
          cls(18, { attendance: null, topic: "forks" }),
          cls(19, { attendance: "ABSENT", title: "Endgames", topic: null }),
          cls(20, { attendance: "LATE", topic: "Pins" }),
          cls(21, { status: "CANCELLED", topic: "Skewers" }),
          // Never started: NOT_HELD, so neither held nor missed.
          cls(22, { status: "SCHEDULED", topic: "Mates" })
        ]
      })
    );
    expect(facts.classes).toEqual({
      attended: 2,
      held: 4,
      missed: [
        { startsAt: "2026-11-18T11:00:00.000Z", title: "forks" },
        { startsAt: "2026-11-19T11:00:00.000Z", title: "Endgames" }
      ],
      topics: ["Forks", "Endgames", "Pins"]
    });
  });

  it("splits homework into on time, late and not done by the shared due rule", () => {
    const facts = buildWeeklyFacts(
      base({
        homework: [
          { completedAt: "2026-11-18T10:00:00.000Z", dueDate: "2026-11-19T18:29:00.000Z", title: "A" },
          { completedAt: "2026-11-21T10:00:00.000Z", dueDate: "2026-11-19T18:29:00.000Z", title: "B" },
          { completedAt: null, dueDate: "2026-11-20T18:29:00.000Z", title: "C" }
        ]
      })
    );
    expect(facts.homework).toEqual({ done: 1, due: 3, late: 1, notDone: [{ dueDate: "2026-11-20T18:29:00.000Z", title: "C" }] });
  });

  it("sums practice and play, the streak as it stood on Sunday", () => {
    const facts = buildWeeklyFacts(
      base({
        dailyPuzzleDays: ["2026-11-13", "2026-11-14", "2026-11-15", "2026-11-20", "2026-11-21", "2026-11-22", "2026-11-23"],
        playLastWeek: [60, null],
        playThisWeek: [70, 81, null],
        puzzleAttempts: [{ solved: true }, { solved: true }, { solved: false }],
        revisionReviews: 4,
        rushRuns: [
          { mode: "STORM", score: 12 },
          { mode: "STORM", score: 19 },
          { mode: "RACER", score: 7 }
        ]
      })
    );
    expect(facts.practice).toEqual({
      dailyPuzzleDays: 3,
      // Monday the 23rd belongs to the next week.
      dailyPuzzleStreak: 3,
      puzzlesSolved: 2,
      puzzlesTried: 3,
      racer: { best: 7, runs: 1 },
      revisionReviews: 4,
      storm: { best: 19, runs: 2 }
    });
    expect(facts.play).toEqual({ accuracy: 76, previousAccuracy: 60, reviewed: 3 });
  });

  it("writes the week in plain lines, with a tip only when the facts carry one", () => {
    const weakSpot = { label: "Fork", missed: 5, motif: "FORK", opportunities: 8, tip: null };
    const facts = buildWeeklyFacts(
      base({
        classes: [cls(17, { topic: "Forks" }), cls(19, { attendance: "ABSENT", topic: "Pins" })],
        homework: [{ completedAt: "2026-11-18T10:00:00.000Z", dueDate: "2026-11-19T18:29:00.000Z", title: "A" }],
        playThisWeek: [72],
        puzzleAttempts: [{ solved: true }],
        recapKeyPoints: [["A fork hits two pieces at once."], ["A fork hits two pieces at once."]],
        weakSpots: { strengths: [{ label: "Pin", motif: "PIN" } as never], weakSpots: [weakSpot as never] }
      })
    );
    const text = renderWeeklyReportText(facts, "Asha");
    expect(text.split("\n")).toEqual([
      "Asha's week, 16–22 Nov",
      "Classes: attended 1 of 2 classes. Missed: Pins (Thu 19 Nov).",
      "Covered: Forks and Pins.",
      "From the class recaps: A fork hits two pieces at once.",
      "Homework: finished 1 of 1 on time.",
      "Practice: solved 1 of 1 puzzle.",
      "Play: 1 game or board reviewed by the engine; accuracy 72%.",
      "To work on: Fork (missed 5 of 8 chances lately).",
      "Doing well: Pin."
    ]);
    const withTip = renderWeeklyReportText({ ...facts, focus: { ...facts.focus, weakSpot: { ...weakSpot, motif: "FORK", tip: "Look for knights." } } }, "Asha");
    expect(withTip).toContain("To work on: Fork (missed 5 of 8 chances lately). Look for knights.");
  });

  it("says a quiet week is quiet, and spans months in the range", () => {
    expect(renderWeeklyReportText(buildWeeklyFacts(base()), "")).toBe("Your week, 16–22 Nov\nA quiet week: no classes, homework or practice recorded.");
    expect(weeklyReportRange("2026-11-30")).toBe("30 Nov – 6 Dec");
  });
});

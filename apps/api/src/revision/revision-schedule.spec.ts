import {
  INITIAL_REVISION_STATE,
  REVISION_POLICY,
  addLocalDays,
  allowedRevisionGrades,
  defaultRevisionGrade,
  hasLongTermRecall,
  normalizeRevisionState,
  orderRevisionQueue,
  revisionDayBounds,
  revisionDueStatus,
  revisionLocalDay,
  revisionOutcome,
  scheduleRevision,
  type RevisionGrade,
  type RevisionQueueCandidate,
  type RevisionSchedulingState
} from "@nexa-chess/types";
import { reviewStreak } from "./revision.service";

// The Smart Revision scheduler (packages/types/src/revision.ts) — pure, so the
// numbers in docs/SMART_REVISION.md are pinned here.

const IST = "Asia/Kolkata";
const NY = "America/New_York";
const DAY = 24 * 60 * 60 * 1000;
// 2026-10-16 15:00 IST
const NOW = new Date("2026-10-16T09:30:00.000Z");

function run(grades: RevisionGrade[], start: Date = NOW, tz = IST) {
  let state: RevisionSchedulingState = INITIAL_REVISION_STATE;
  let at = start;
  const out: { dueAt: Date; state: RevisionSchedulingState }[] = [];
  for (const grade of grades) {
    const r = scheduleRevision({ againsToday: 0, grade, now: at, state, timeZone: tz });
    out.push(r);
    state = r.state;
    // Review exactly when due (or 10 minutes later for an Again).
    at = new Date(Math.max(r.dueAt.getTime(), at.getTime() + 60_000));
  }
  return out;
}

describe("scheduleRevision — the four outcomes on a new item", () => {
  it("Again comes back in 10 minutes and counts a lapse", () => {
    const r = scheduleRevision({ againsToday: 0, grade: "AGAIN", now: NOW, state: null, timeZone: IST });
    expect(r.dueAt.getTime() - NOW.getTime()).toBe(10 * 60_000);
    expect(r.state).toEqual({ easeFactor: 230, intervalDays: 0, lapses: 1, repetitions: 0, reviewCount: 1 });
  });

  it.each([
    ["HARD", 1, 235],
    ["GOOD", 3, 250],
    ["EASY", 7, 265]
  ] as const)("%s schedules %i day(s) out at local midnight", (grade, days, ease) => {
    const r = scheduleRevision({ againsToday: 0, grade, now: NOW, state: null, timeZone: IST });
    expect(r.state.intervalDays).toBe(days);
    expect(r.state.easeFactor).toBe(ease);
    expect(r.state.repetitions).toBe(1);
    // Local midnight in Kolkata = 18:30 UTC the day before.
    expect(r.dueAt.toISOString()).toBe(new Date(Date.UTC(2026, 9, 16 + days - 1, 18, 30)).toISOString());
  });
});

describe("scheduleRevision — growth and lapses", () => {
  it("successive Good reviews grow the interval", () => {
    const intervals = run(["GOOD", "GOOD", "GOOD", "GOOD"]).map((r) => r.state.intervalDays);
    expect(intervals).toEqual([3, 8, 20, 50]);
    for (let i = 1; i < intervals.length; i += 1) expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
  });

  it("Easy grows faster than Good, Hard slower", () => {
    const good = run(["GOOD", "GOOD", "GOOD"]).at(-1)!.state.intervalDays;
    const easy = run(["GOOD", "GOOD", "EASY"]).at(-1)!.state.intervalDays;
    const hard = run(["GOOD", "GOOD", "HARD"]).at(-1)!.state.intervalDays;
    expect(easy).toBeGreaterThan(good);
    expect(hard).toBeLessThan(good);
  });

  it("an Again resets the interval and the next success starts over", () => {
    const r = run(["GOOD", "GOOD", "AGAIN", "GOOD"]);
    expect(r[2].state.intervalDays).toBe(0);
    expect(r[2].state.repetitions).toBe(0);
    expect(r[3].state.intervalDays).toBe(3);
  });

  it("repeated failures shorten later intervals (ease drops)", () => {
    const clean = run(["GOOD", "GOOD", "GOOD"]).at(-1)!.state;
    const shaky = run(["AGAIN", "AGAIN", "AGAIN", "GOOD", "GOOD", "GOOD"]).at(-1)!.state;
    expect(shaky.easeFactor).toBeLessThan(clean.easeFactor);
    expect(shaky.intervalDays).toBeLessThan(clean.intervalDays);
    expect(shaky.lapses).toBe(3);
  });

  it("ease and interval stay inside their bounds", () => {
    const low = run(Array<RevisionGrade>(20).fill("AGAIN")).at(-1)!.state;
    expect(low.easeFactor).toBe(REVISION_POLICY.minEase);
    const high = run(Array<RevisionGrade>(12).fill("EASY")).at(-1)!.state;
    expect(high.easeFactor).toBe(REVISION_POLICY.maxEase);
    expect(high.intervalDays).toBe(REVISION_POLICY.maxIntervalDays);
  });
});

describe("scheduleRevision — same-day retry limit", () => {
  it("the second Again of the day waits until tomorrow, not 10 minutes", () => {
    const first = scheduleRevision({ againsToday: 0, grade: "AGAIN", now: NOW, state: null, timeZone: IST });
    expect(first.dueAt.getTime() - NOW.getTime()).toBe(10 * 60_000);
    const second = scheduleRevision({
      againsToday: 1,
      grade: "AGAIN",
      now: new Date(NOW.getTime() + 11 * 60_000),
      state: first.state,
      timeZone: IST
    });
    expect(second.dueAt.toISOString()).toBe("2026-10-16T18:30:00.000Z");
    // …and a third, if somehow forced, never comes back sooner.
    const third = scheduleRevision({ againsToday: 5, grade: "AGAIN", now: NOW, state: second.state, timeZone: IST });
    expect(third.dueAt.toISOString()).toBe("2026-10-16T18:30:00.000Z");
  });
});

describe("scheduleRevision — determinism and bad state", () => {
  it("identical inputs give identical results", () => {
    const input = { againsToday: 0, grade: "GOOD" as const, now: NOW, state: { ...INITIAL_REVISION_STATE, intervalDays: 5, repetitions: 2 }, timeZone: NY };
    expect(scheduleRevision(input)).toEqual(scheduleRevision(input));
  });

  it("missing or invalid state is treated as a new item", () => {
    expect(normalizeRevisionState(undefined)).toEqual(INITIAL_REVISION_STATE);
    expect(
      normalizeRevisionState({ easeFactor: Number.NaN, intervalDays: -4, lapses: -1, repetitions: 2.6, reviewCount: Infinity })
    ).toEqual({ easeFactor: 250, intervalDays: 0, lapses: 0, repetitions: 3, reviewCount: 0 });
    expect(normalizeRevisionState({ easeFactor: 10_000, intervalDays: 9_999 })).toMatchObject({ easeFactor: 300, intervalDays: 180 });
    const r = scheduleRevision({ againsToday: 0, grade: "GOOD", now: NOW, state: { intervalDays: Number.NaN } as never, timeZone: IST });
    expect(r.state.intervalDays).toBe(3);
  });

  it("an unknown time zone falls back to UTC instead of throwing", () => {
    const r = scheduleRevision({ againsToday: 0, grade: "HARD", now: NOW, state: null, timeZone: "Mars/Olympus" });
    expect(r.dueAt.toISOString()).toBe("2026-10-17T00:00:00.000Z");
  });
});

describe("local day arithmetic", () => {
  it("day bounds follow the student's zone", () => {
    // 23:30 UTC on the 16th is already the 17th in Kolkata, still the 16th in New York.
    const late = new Date("2026-10-16T23:30:00.000Z");
    expect(revisionLocalDay(late, IST)).toBe("2026-10-17");
    expect(revisionLocalDay(late, NY)).toBe("2026-10-16");
    expect(revisionDayBounds(late, IST).start.toISOString()).toBe("2026-10-16T18:30:00.000Z");
    expect(revisionDayBounds(late, NY).start.toISOString()).toBe("2026-10-16T04:00:00.000Z");
  });

  it("is DST-correct: the day the clocks change is 25 hours long", () => {
    // US DST ends 2026-11-01.
    const { start, end } = revisionDayBounds(new Date("2026-11-01T15:00:00.000Z"), NY);
    expect(start.toISOString()).toBe("2026-11-01T04:00:00.000Z");
    expect(end.getTime() - start.getTime()).toBe(25 * 60 * 60 * 1000);
    // A 3-day interval across the change still lands on local midnight.
    expect(addLocalDays(new Date("2026-10-30T15:00:00.000Z"), 3, NY).toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });
});

describe("revisionDueStatus", () => {
  const status = (dueAt: Date, reviewCount = 1, tz = IST) => revisionDueStatus({ dueAt, reviewCount }, NOW, tz);
  it("classifies overdue / due / later today / scheduled", () => {
    expect(status(new Date("2026-10-15T10:00:00.000Z"))).toBe("OVERDUE");
    expect(status(new Date("2026-10-16T08:00:00.000Z"))).toBe("DUE");
    expect(status(new Date("2026-10-16T09:40:00.000Z"))).toBe("LATER_TODAY");
    expect(status(new Date("2026-10-16T18:30:00.000Z"))).toBe("SCHEDULED");
  });
  it("a never-reviewed item is NEW once its time has come", () => {
    expect(status(new Date("2026-10-01T00:00:00.000Z"), 0)).toBe("NEW");
    expect(status(new Date("2026-10-20T00:00:00.000Z"), 0)).toBe("SCHEDULED");
  });
  it("the same instant can be overdue in one zone and due-today in another", () => {
    const dueAt = new Date("2026-10-16T03:00:00.000Z"); // 08:30 IST on the 16th / 23:00 NY on the 15th
    expect(status(dueAt, 1, IST)).toBe("DUE");
    expect(status(dueAt, 1, NY)).toBe("OVERDUE");
  });
});

describe("grades are capped by the graded attempt", () => {
  it("derives the outcome from the attempt", () => {
    expect(revisionOutcome({ hintsUsed: 0, solved: false, wrongMoves: 0 })).toBe("FAILED");
    expect(revisionOutcome({ hintsUsed: 1, solved: true, wrongMoves: 0 })).toBe("ASSISTED");
    expect(revisionOutcome({ hintsUsed: 0, solved: true, wrongMoves: 2 })).toBe("ASSISTED");
    expect(revisionOutcome({ hintsUsed: 0, solved: true, wrongMoves: 0 })).toBe("CLEAN");
  });
  it("a miss can only be Again; help caps it at Hard; a clean solve may be anything", () => {
    expect(allowedRevisionGrades("FAILED")).toEqual(["AGAIN"]);
    expect(allowedRevisionGrades("ASSISTED")).toEqual(["AGAIN", "HARD"]);
    expect(allowedRevisionGrades("CLEAN")).toEqual(["AGAIN", "HARD", "GOOD", "EASY"]);
    for (const o of ["FAILED", "ASSISTED", "CLEAN"] as const) {
      expect(allowedRevisionGrades(o)).toContain(defaultRevisionGrade(o));
    }
  });
});

describe("long-term recall", () => {
  it("is never earned by a single correct answer", () => {
    expect(hasLongTermRecall(run(["EASY"])[0].state)).toBe(false);
  });
  it("needs three successes in a row spaced at least 21 days", () => {
    const r = run(["GOOD", "GOOD", "GOOD"]);
    expect(r[2].state).toMatchObject({ intervalDays: 20, repetitions: 3 });
    expect(hasLongTermRecall(r[2].state)).toBe(false);
    expect(hasLongTermRecall(run(["GOOD", "GOOD", "GOOD", "GOOD"])[3].state)).toBe(true);
  });
});

describe("orderRevisionQueue", () => {
  const item = (id: string, o: Partial<RevisionQueueCandidate>): RevisionQueueCandidate => ({
    dueAt: new Date(NOW.getTime() - DAY),
    id,
    intervalDays: 3,
    lapses: 0,
    recommended: false,
    reviewCount: 1,
    skippedToday: false,
    ...o
  });

  it("serves the most overdue reviews first, then new items, never future ones", () => {
    const ids = orderRevisionQueue(
      [
        item("future", { dueAt: new Date(NOW.getTime() + DAY) }),
        item("new-a", { dueAt: new Date(NOW.getTime() - 5 * DAY), reviewCount: 0 }),
        item("slightly", { dueAt: new Date(NOW.getTime() - DAY) }),
        item("very", { dueAt: new Date(NOW.getTime() - 9 * DAY) })
      ],
      NOW,
      { limit: 20, newRemaining: 10 }
    );
    expect(ids).toEqual(["very", "slightly", "new-a"]);
  });

  it("caps new items and the session size without touching the backlog order", () => {
    const items = [
      ...Array.from({ length: 5 }, (_, i) => item(`r${i}`, { dueAt: new Date(NOW.getTime() - (i + 1) * DAY) })),
      ...Array.from({ length: 5 }, (_, i) => item(`n${i}`, { reviewCount: 0 }))
    ];
    expect(orderRevisionQueue(items, NOW, { limit: 20, newRemaining: 2 })).toEqual(["r4", "r3", "r2", "r1", "r0", "n0", "n1"]);
    expect(orderRevisionQueue(items, NOW, { limit: 3, newRemaining: 2 })).toEqual(["r4", "r3", "r2"]);
    expect(orderRevisionQueue(items, NOW, { limit: 20, newRemaining: 0 })).toHaveLength(5);
  });

  it("puts a coach's new recommendation before an older mistake, and skipped items last", () => {
    const ids = orderRevisionQueue(
      [
        item("mistake", { dueAt: new Date(NOW.getTime() - 3 * DAY), reviewCount: 0 }),
        item("coach", { recommended: true, reviewCount: 0 }),
        item("skipped", { dueAt: new Date(NOW.getTime() - 30 * DAY), skippedToday: true }),
        item("due", {})
      ],
      NOW,
      { limit: 20, newRemaining: 10 }
    );
    expect(ids).toEqual(["due", "coach", "mistake", "skipped"]);
  });

  it("is stable: ties break on id", () => {
    const items = ["c", "a", "b"].map((id) => item(id, {}));
    expect(orderRevisionQueue(items, NOW, { limit: 20, newRemaining: 0 })).toEqual(["a", "b", "c"]);
  });
});

describe("reviewStreak", () => {
  it("counts consecutive days ending today, or yesterday while today is open", () => {
    expect(reviewStreak(["2026-10-14", "2026-10-15", "2026-10-16"], "2026-10-16")).toBe(3);
    expect(reviewStreak(["2026-10-14", "2026-10-15"], "2026-10-16")).toBe(2);
    expect(reviewStreak(["2026-10-13", "2026-10-15", "2026-10-16"], "2026-10-16")).toBe(2);
    expect(reviewStreak(["2026-10-13"], "2026-10-16")).toBe(0);
    expect(reviewStreak([], "2026-10-16")).toBe(0);
  });
});

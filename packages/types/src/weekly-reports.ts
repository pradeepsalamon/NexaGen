// ──────────────────────────────────────────────────────────────
// Weekly progress reports (docs/WEEKLY_REPORTS.md). Phase A: the facts of one
// academy week (Monday–Sunday in the academy's time zone), a plain template
// text made from them, and the student's own Reports page. Nothing is sent and
// no AI writes anything; nothing reaches a parent contact (docs/PARENT_REPORTS.md).
// Pure and shared: the API freezes the facts, the web shows them.
// ──────────────────────────────────────────────────────────────

import { z } from "zod";
import { resolveAssignmentDueStatus } from "./assignment-reminders";
import { resolveClassDisplayStatus } from "./class-availability";
import { computeDailyStreak } from "./daily-puzzle";
import type { TacticMotif } from "./game-tactics";
import { addDays } from "./progress";
import type { WeakSpotProfile } from "./weak-spots";

/** Bump when the facts' shape or meaning changes (stored with each report). */
export const WEEKLY_FACTS_VERSION = 1;
/** A week's report is built from this hour on its following Monday (academy time), after the nightly play review. */
export const WEEKLY_REPORT_BUILD_HOUR = 6;
/** Kept this long (RETENTION_RULES, WR-5). */
export const WEEKLY_REPORT_RETENTION_DAYS = 365;

export const WEEKLY_REPORT_LIMITS = {
  missedClasses: 5,
  notDoneHomework: 5,
  recapPoints: 6,
  topics: 6
} as const;

export const WEEKLY_REPORT_STATUSES = ["DRAFT"] as const;
export type WeeklyReportStatus = (typeof WEEKLY_REPORT_STATUSES)[number];

/** A class's attendance, as stored (`AttendanceStatus`); null = no row. */
export type WeeklyAttendance = "PRESENT" | "LATE" | "PARTIAL" | "ABSENT" | null;

export type WeeklyFacts = {
  version: number;
  /** YYYY-MM-DD, the week's Monday on the academy's calendar. */
  weekStart: string;
  /** YYYY-MM-DD, its Sunday. */
  weekEnd: string;
  timeZone: string;
  classes: {
    /** Classes of the student's batches that took place (COMPLETED). */
    held: number;
    attended: number;
    /** ISO-8601 UTC start of each held class they missed, earliest first. */
    missed: { title: string; startsAt: string }[];
    /** The held classes' topics (or titles), in order, without repeats. */
    topics: string[];
  };
  /** Key points of the week's published class recaps (docs/CLASS_RECAPS.md). */
  recapPoints: string[];
  homework: {
    /** Homework due this week. */
    due: number;
    /** Finished by the due time. */
    done: number;
    /** Finished after it. */
    late: number;
    notDone: { title: string; dueDate: string }[];
  };
  practice: {
    /** Puzzles finished this week (any kind: training, homework, courses, daily…). */
    puzzlesTried: number;
    puzzlesSolved: number;
    storm: { runs: number; best: number } | null;
    racer: { runs: number; best: number } | null;
    /** Days this week with a finished Puzzle of the Day. */
    dailyPuzzleDays: number;
    /** The Puzzle of the Day streak on the week's Sunday. */
    dailyPuzzleStreak: number;
    revisionReviews: number;
  };
  play: {
    /** Games and boards the engine reviewed (docs/AI_PLAY_REVIEW.md). */
    reviewed: number;
    /** Average accuracy this week / the week before, null without reviews. */
    accuracy: number | null;
    previousAccuracy: number | null;
  };
  /** From the weak-spot profile on the week's last day (docs/WEAK_SPOTS.md). */
  focus: {
    weakSpot: { motif: TacticMotif; label: string; missed: number; opportunities: number; tip: string | null } | null;
    strength: { motif: TacticMotif; label: string } | null;
  };
};

export type WeeklyFactsInput = {
  /** YYYY-MM-DD Monday. */
  weekStart: string;
  timeZone: string;
  /** ISO-8601 UTC: when the facts are built (decides "held" and "not done"). */
  now: string;
  /** Classes of the student's batches that started this week. */
  classes: {
    title: string | null;
    topic: string | null;
    status: string;
    startsAt: string;
    endsAt: string;
    attendance: WeeklyAttendance;
  }[];
  /** Published recaps of those classes. */
  recapKeyPoints: string[][];
  /** The student's homework due this week. */
  homework: { title: string; dueDate: string; completedAt: string | null }[];
  /** Puzzle attempts finished this week. */
  puzzleAttempts: { solved: boolean }[];
  /** Finished Storm / Racer runs this week. */
  rushRuns: { mode: "STORM" | "RACER"; score: number }[];
  /** YYYY-MM-DD days (academy calendar) with a finished Puzzle of the Day, up to the week's Sunday. */
  dailyPuzzleDays: string[];
  revisionReviews: number;
  /** Accuracy of each reviewed item this week / the week before (null = no number). */
  playThisWeek: (number | null)[];
  playLastWeek: (number | null)[];
  /** Student view (only tips their academy read); null when not available. */
  weakSpots: Pick<WeakSpotProfile, "weakSpots" | "strengths"> | null;
};

const ATTENDED = new Set<string>(["PRESENT", "LATE", "PARTIAL"]);

function average(values: (number | null)[]): number | null {
  const numbers = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return numbers.length ? Math.round(numbers.reduce((a, b) => a + b, 0) / numbers.length) : null;
}

/** YYYY-MM-DD of the Monday on or before `day`. */
export function mondayOf(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(day, -((weekday + 6) % 7));
}

/** The facts of one week. Pure: every rule it needs is the shared one (class timing, due status, streak). */
export function buildWeeklyFacts(input: WeeklyFactsInput): WeeklyFacts {
  const now = new Date(input.now);
  const weekEnd = addDays(input.weekStart, 6);

  const held = input.classes
    .filter((c) => resolveClassDisplayStatus(c, now) === "COMPLETED")
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const attended = held.filter((c) => c.attendance !== null && ATTENDED.has(c.attendance));
  const topics: string[] = [];
  for (const c of held) {
    const topic = (c.topic ?? c.title ?? "").trim();
    if (topic && !topics.some((t) => t.toLowerCase() === topic.toLowerCase())) topics.push(topic);
  }
  const recapPoints: string[] = [];
  for (const point of input.recapKeyPoints.flat()) {
    const text = point.trim();
    if (text && !recapPoints.includes(text)) recapPoints.push(text);
  }

  let done = 0;
  let late = 0;
  const notDone: WeeklyFacts["homework"]["notDone"] = [];
  for (const h of [...input.homework].sort((a, b) => Date.parse(a.dueDate) - Date.parse(b.dueDate))) {
    const status = resolveAssignmentDueStatus({ completed: h.completedAt !== null, dueDate: h.dueDate }, now, input.timeZone);
    if (status === "COMPLETED") {
      if (h.completedAt && Date.parse(h.completedAt) > Date.parse(h.dueDate)) late += 1;
      else done += 1;
    } else {
      notDone.push({ dueDate: h.dueDate, title: h.title });
    }
  }

  const rush = (mode: "STORM" | "RACER") => {
    const runs = input.rushRuns.filter((r) => r.mode === mode);
    return runs.length ? { best: Math.max(...runs.map((r) => r.score)), runs: runs.length } : null;
  };
  const dailyDays = new Set(input.dailyPuzzleDays.filter((d) => d <= weekEnd));

  const weak = input.weakSpots?.weakSpots[0] ?? null;
  const strength = input.weakSpots?.strengths[0] ?? null;

  return {
    classes: {
      attended: attended.length,
      held: held.length,
      missed: held
        .filter((c) => !attended.includes(c))
        .slice(0, WEEKLY_REPORT_LIMITS.missedClasses)
        .map((c) => ({ startsAt: c.startsAt, title: (c.topic ?? c.title ?? "Class").trim() || "Class" })),
      topics: topics.slice(0, WEEKLY_REPORT_LIMITS.topics)
    },
    focus: {
      strength: strength ? { label: strength.label, motif: strength.motif } : null,
      weakSpot: weak
        ? { label: weak.label, missed: weak.missed, motif: weak.motif, opportunities: weak.opportunities, tip: weak.tip }
        : null
    },
    homework: {
      done,
      due: input.homework.length,
      late,
      notDone: notDone.slice(0, WEEKLY_REPORT_LIMITS.notDoneHomework)
    },
    play: {
      accuracy: average(input.playThisWeek),
      previousAccuracy: average(input.playLastWeek),
      reviewed: input.playThisWeek.length
    },
    practice: {
      dailyPuzzleDays: [...dailyDays].filter((d) => d >= input.weekStart).length,
      dailyPuzzleStreak: computeDailyStreak(dailyDays, weekEnd),
      puzzlesSolved: input.puzzleAttempts.filter((a) => a.solved).length,
      puzzlesTried: input.puzzleAttempts.length,
      racer: rush("RACER"),
      revisionReviews: input.revisionReviews,
      storm: rush("STORM")
    },
    recapPoints: recapPoints.slice(0, WEEKLY_REPORT_LIMITS.recapPoints),
    timeZone: input.timeZone,
    version: WEEKLY_FACTS_VERSION,
    weekEnd,
    weekStart: input.weekStart
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function listOf(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function dayMonth(day: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
}

/** "17–23 Nov" / "28 Nov – 4 Dec" (date-only values format in UTC). */
export function weeklyReportRange(weekStart: string): string {
  const end = addDays(weekStart, 6);
  const sameMonth = weekStart.slice(0, 7) === end.slice(0, 7);
  return sameMonth ? `${Number(weekStart.slice(8, 10))}–${dayMonth(end)}` : `${dayMonth(weekStart)} – ${dayMonth(end)}`;
}

/** "Thu 19 Nov" in the academy's zone, built from parts so every runtime writes it the same. */
function weekdayOf(iso: string, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone, weekday: "short" }).formatToParts(
      new Date(iso)
    );
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${part("weekday")} ${part("day")} ${part("month")}`;
  } catch {
    return iso.slice(0, 10);
  }
}

/**
 * The report in plain words, one line per section, from the facts only (no
 * other student, no engine numbers beyond accuracy, no puzzle answers).
 */
export function renderWeeklyReportText(facts: WeeklyFacts, firstName: string): string {
  const name = firstName.trim() || "Your";
  const lines: string[] = [`${name === "Your" ? "Your" : `${name}'s`} week, ${weeklyReportRange(facts.weekStart)}`];
  const { classes, homework, practice, play, focus } = facts;

  if (classes.held > 0) {
    const missed = classes.missed.length
      ? ` Missed: ${classes.missed.map((m) => `${m.title} (${weekdayOf(m.startsAt, facts.timeZone)})`).join("; ")}.`
      : "";
    lines.push(`Classes: attended ${classes.attended} of ${plural(classes.held, "class", "classes")}.${missed}`);
    if (classes.topics.length) lines.push(`Covered: ${listOf(classes.topics)}.`);
  }
  if (facts.recapPoints.length) lines.push(`From the class recaps: ${facts.recapPoints.join(" · ")}`);

  if (homework.due > 0) {
    const parts = [`finished ${homework.done} of ${homework.due} on time`];
    if (homework.late) parts.push(`${homework.late} late`);
    const open = homework.notDone.length ? ` Still to do: ${homework.notDone.map((h) => h.title).join("; ")}.` : "";
    lines.push(`Homework: ${parts.join(", ")}.${open}`);
  }

  const practiceParts: string[] = [];
  if (practice.puzzlesTried) practiceParts.push(`solved ${practice.puzzlesSolved} of ${plural(practice.puzzlesTried, "puzzle")}`);
  if (practice.dailyPuzzleDays) {
    practiceParts.push(
      `Puzzle of the Day on ${plural(practice.dailyPuzzleDays, "day")}` +
        (practice.dailyPuzzleStreak > 1 ? ` (a ${practice.dailyPuzzleStreak}-day streak)` : "")
    );
  }
  if (practice.storm) practiceParts.push(`best Puzzle Storm score ${practice.storm.best}`);
  if (practice.racer) practiceParts.push(`best Puzzle Racer score ${practice.racer.best}`);
  if (practice.revisionReviews) practiceParts.push(plural(practice.revisionReviews, "Smart Revision review"));
  if (practiceParts.length) lines.push(`Practice: ${practiceParts.join(", ")}.`);

  if (play.reviewed > 0) {
    const accuracy =
      play.accuracy === null
        ? ""
        : `; accuracy ${play.accuracy}%` + (play.previousAccuracy === null ? "" : ` (the week before: ${play.previousAccuracy}%)`);
    lines.push(`Play: ${plural(play.reviewed, "game or board", "games and boards")} reviewed by the engine${accuracy}.`);
  }

  if (focus.weakSpot) {
    lines.push(
      `To work on: ${focus.weakSpot.label} (missed ${focus.weakSpot.missed} of ${focus.weakSpot.opportunities} chances lately).` +
        (focus.weakSpot.tip ? ` ${focus.weakSpot.tip}` : "")
    );
  }
  if (focus.strength) lines.push(`Doing well: ${focus.strength.label}.`);

  if (lines.length === 1) lines.push("A quiet week: no classes, homework or practice recorded.");
  return lines.join("\n");
}

// ── Contract ──

export const weeklyReportListQuerySchema = z.object({
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(8)
});
export type WeeklyReportListQuery = z.infer<typeof weeklyReportListQuerySchema>;

export type WeeklyReportView = {
  id: string;
  /** YYYY-MM-DD. */
  weekStart: string;
  weekEnd: string;
  status: WeeklyReportStatus;
  text: string;
  facts: WeeklyFacts;
  /** ISO-8601 UTC. */
  createdAt: string;
};

export type WeeklyReportListResponse = { items: WeeklyReportView[]; nextCursor: string | null };

/** Staff: this week so far (built on request, not stored). */
export type WeeklyReportPreviewResponse = {
  weekStart: string;
  weekEnd: string;
  text: string;
  facts: WeeklyFacts;
  /** ISO-8601 UTC. */
  builtAt: string;
};

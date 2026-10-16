import { z } from "zod";

// ──────────────────────────────────────────────────────────────
// Smart Revision — spaced repetition over existing library content.
//
// A revision ITEM is one thing a student should keep remembering: a puzzle
// (often one they got wrong) or a puzzle folder a coach recommended as a
// concept, reviewed by solving one of its puzzles. Every review is an ordinary
// server-graded PuzzleAttempt (context REVISION); the student then rates their
// recall, capped by what the attempt shows (a failed solve is always Again).
//
// Everything below is pure: the API schedules with it, the specs pin it, and
// docs/SMART_REVISION.md explains it. Tune the numbers in REVISION_POLICY.
// ──────────────────────────────────────────────────────────────

export const REVISION_GRADES = ["AGAIN", "HARD", "GOOD", "EASY"] as const;
export const revisionGradeSchema = z.enum(REVISION_GRADES);
export type RevisionGrade = z.infer<typeof revisionGradeSchema>;

export const REVISION_GRADE_LABELS: Record<RevisionGrade, string> = {
  AGAIN: "Again",
  EASY: "Easy",
  GOOD: "Good",
  HARD: "Hard"
};

export const REVISION_GRADE_DESCRIPTIONS: Record<RevisionGrade, string> = {
  AGAIN: "Couldn't solve or remember it",
  EASY: "Solved it confidently",
  GOOD: "Solved it with reasonable effort",
  HARD: "Solved it, but it was a struggle"
};

/** What the graded attempt itself shows, before the student says anything. */
export const REVISION_OUTCOMES = ["CLEAN", "ASSISTED", "FAILED"] as const;
export type RevisionOutcome = (typeof REVISION_OUTCOMES)[number];

export const REVISION_OUTCOME_LABELS: Record<RevisionOutcome, string> = {
  ASSISTED: "Solved with a hint or a wrong move",
  CLEAN: "Solved cleanly",
  FAILED: "Not solved"
};

export const REVISION_ITEM_KINDS = ["PUZZLE", "TOPIC"] as const;
export type RevisionItemKind = (typeof REVISION_ITEM_KINDS)[number];

/** MISTAKE = seeded from the student's own graded attempt; COACH = recommended. */
export const REVISION_ITEM_SOURCES = ["MISTAKE", "COACH"] as const;
export type RevisionItemSource = (typeof REVISION_ITEM_SOURCES)[number];

export const REVISION_POLICY = {
  /** Again: back after this long… */
  againDelayMinutes: 10,
  /** …but from this many Agains on one item in one local day, it waits until tomorrow. */
  maxAgainsPerDay: 2,
  /** First successful review (or the first after a lapse). */
  firstIntervalDays: { EASY: 7, GOOD: 3, HARD: 1 } as Record<Exclude<RevisionGrade, "AGAIN">, number>,
  /** Later reviews: Hard grows the interval by this factor, Good by the ease, Easy by ease × bonus. */
  hardFactor: 1.2,
  easyBonus: 1.3,
  /** Ease is stored ×100 (250 = 2.5×). */
  initialEase: 250,
  minEase: 130,
  maxEase: 300,
  easeDelta: { AGAIN: -20, EASY: 15, GOOD: 0, HARD: -15 } as Record<RevisionGrade, number>,
  maxIntervalDays: 180,
  /** A session serves at most this many items… */
  sessionLimit: 20,
  /** …and introduces at most this many never-reviewed items per local day. */
  newPerDay: 10,
  /** Estimate for a puzzle with no `estimatedSeconds`. */
  defaultItemSeconds: 90,
  /** "Long-term recall": this many successful reviews in a row, now spaced at least this far apart. */
  longTermRepetitions: 3,
  longTermIntervalDays: 21
} as const;

export type RevisionPolicy = typeof REVISION_POLICY;

export type RevisionSchedulingState = {
  /** Current interval in whole days; 0 while (re)learning. */
  intervalDays: number;
  /** ×100. */
  easeFactor: number;
  /** Successful reviews in a row since the last Again. */
  repetitions: number;
  /** Times graded Again. */
  lapses: number;
  /** Reviews in all. */
  reviewCount: number;
};

export const INITIAL_REVISION_STATE: RevisionSchedulingState = {
  easeFactor: REVISION_POLICY.initialEase,
  intervalDays: 0,
  lapses: 0,
  repetitions: 0,
  reviewCount: 0
};

const wholeAtLeast = (value: unknown, min: number, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.round(value)) : fallback;

/** Missing, NaN or negative fields fall back to a fresh item's values; ease is clamped. */
export function normalizeRevisionState(
  state: Partial<RevisionSchedulingState> | null | undefined,
  policy: RevisionPolicy = REVISION_POLICY
): RevisionSchedulingState {
  const s = state ?? {};
  return {
    easeFactor: Math.min(policy.maxEase, wholeAtLeast(s.easeFactor, policy.minEase, policy.initialEase)),
    intervalDays: Math.min(policy.maxIntervalDays, wholeAtLeast(s.intervalDays, 0, 0)),
    lapses: wholeAtLeast(s.lapses, 0, 0),
    repetitions: wholeAtLeast(s.repetitions, 0, 0),
    reviewCount: wholeAtLeast(s.reviewCount, 0, 0)
  };
}

/** The attempt's own evidence: a miss, a solve that needed help, or a clean solve. */
export function revisionOutcome(attempt: { solved: boolean; wrongMoves: number; hintsUsed: number }): RevisionOutcome {
  if (!attempt.solved) return "FAILED";
  return attempt.wrongMoves > 0 || attempt.hintsUsed > 0 ? "ASSISTED" : "CLEAN";
}

/**
 * Grades the student may pick. A self-report can lower the grade but never
 * raise it past the evidence: a miss is Again, help caps it at Hard.
 */
export function allowedRevisionGrades(outcome: RevisionOutcome): RevisionGrade[] {
  if (outcome === "FAILED") return ["AGAIN"];
  if (outcome === "ASSISTED") return ["AGAIN", "HARD"];
  return ["AGAIN", "HARD", "GOOD", "EASY"];
}

/** The grade the rating buttons focus first — a UI default only; the server never records it on its own. */
export function defaultRevisionGrade(outcome: RevisionOutcome): RevisionGrade {
  return outcome === "FAILED" ? "AGAIN" : outcome === "ASSISTED" ? "HARD" : "GOOD";
}

// ── Local-day arithmetic (the student's own timezone) ──

const DAY_MS = 24 * 60 * 60 * 1000;

function zonedYmd(timeZone: string, at: Date): [number, number, number] {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric"
  }).format(at);
  const [y, m, d] = parts.split("-").map(Number);
  return [y, m, d];
}

function safeZone(timeZone: string | null | undefined): string {
  if (!timeZone) return "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return timeZone;
  } catch {
    return "UTC";
  }
}

/** UTC instant of local midnight on a calendar date in `timeZone`, DST-correct. */
function localMidnight(timeZone: string, y: number, m: number, d: number): Date {
  const guess = Date.UTC(y, m - 1, d);
  // Two passes: the offset at the guess, then at the corrected instant (DST edges).
  let at = guess;
  for (let i = 0; i < 2; i += 1) {
    const [ly, lm, ld] = zonedYmd(timeZone, new Date(at));
    const local = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      timeZone
    }).format(new Date(at));
    const [hh, mm] = local.split(":").map(Number);
    const shownAsUtc = Date.UTC(ly, lm - 1, ld, hh, mm);
    at = at - (shownAsUtc - guess);
  }
  return new Date(at);
}

/** Start (inclusive) and end (exclusive) of the local day `at` falls on. */
export function revisionDayBounds(at: Date, timeZone: string | null | undefined): { start: Date; end: Date } {
  const tz = safeZone(timeZone);
  const [y, m, d] = zonedYmd(tz, at);
  const start = localMidnight(tz, y, m, d);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const end = localMidnight(tz, next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  return { end, start };
}

/** Local midnight `days` calendar days after the day `at` falls on. */
export function addLocalDays(at: Date, days: number, timeZone: string | null | undefined): Date {
  const tz = safeZone(timeZone);
  const [y, m, d] = zonedYmd(tz, at);
  const target = new Date(Date.UTC(y, m - 1, d + days));
  return localMidnight(tz, target.getUTCFullYear(), target.getUTCMonth() + 1, target.getUTCDate());
}

/** `YYYY-MM-DD` of `at` in `timeZone`. */
export function revisionLocalDay(at: Date, timeZone: string | null | undefined): string {
  const [y, m, d] = zonedYmd(safeZone(timeZone), at);
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export type RevisionScheduleResult = {
  state: RevisionSchedulingState;
  dueAt: Date;
};

/**
 * The next state and due time after one review. Deterministic: the same
 * inputs always give the same answer.
 *
 * - Again: interval and streak reset, ease −20, back in 10 minutes — or at
 *   tomorrow's local midnight once it is the item's 2nd Again of the day.
 * - Hard / Good / Easy, first success (or first after a lapse): 1 / 3 / 7 days.
 * - Later: Hard ×1.2, Good ×ease, Easy ×ease×1.3 (Good and Easy always grow
 *   by at least a day); ease −15 / 0 / +15; capped at 180 days.
 * - A day-scale interval lands on local midnight, so "due today" means the
 *   whole of that day in the student's timezone.
 *
 * `againsToday` = earlier Agains on this item in the student's current local day.
 */
export function scheduleRevision(input: {
  state: Partial<RevisionSchedulingState> | null | undefined;
  grade: RevisionGrade;
  now: Date;
  timeZone: string | null | undefined;
  againsToday: number;
  policy?: RevisionPolicy;
}): RevisionScheduleResult {
  const policy = input.policy ?? REVISION_POLICY;
  const prev = normalizeRevisionState(input.state, policy);
  const ease = Math.min(policy.maxEase, Math.max(policy.minEase, prev.easeFactor + policy.easeDelta[input.grade]));
  const reviewCount = prev.reviewCount + 1;

  if (input.grade === "AGAIN") {
    const exhausted = Math.max(0, Math.floor(input.againsToday)) + 1 >= policy.maxAgainsPerDay;
    return {
      dueAt: exhausted
        ? addLocalDays(input.now, 1, input.timeZone)
        : new Date(input.now.getTime() + policy.againDelayMinutes * 60_000),
      state: { easeFactor: ease, intervalDays: 0, lapses: prev.lapses + 1, repetitions: 0, reviewCount }
    };
  }

  let interval: number;
  if (prev.repetitions === 0 || prev.intervalDays === 0) {
    interval = policy.firstIntervalDays[input.grade];
  } else if (input.grade === "HARD") {
    interval = Math.max(policy.firstIntervalDays.HARD, Math.round(prev.intervalDays * policy.hardFactor));
  } else if (input.grade === "GOOD") {
    interval = Math.max(prev.intervalDays + 1, Math.round((prev.intervalDays * ease) / 100));
  } else {
    interval = Math.max(prev.intervalDays + 1, Math.round(((prev.intervalDays * ease) / 100) * policy.easyBonus));
  }
  interval = Math.min(policy.maxIntervalDays, interval);

  return {
    dueAt: addLocalDays(input.now, interval, input.timeZone),
    state: {
      easeFactor: ease,
      intervalDays: interval,
      lapses: prev.lapses,
      repetitions: prev.repetitions + 1,
      reviewCount
    }
  };
}

/** Explicit, evidence-based: several successful reviews in a row, spaced weeks apart. */
export function hasLongTermRecall(
  state: Pick<RevisionSchedulingState, "repetitions" | "intervalDays">,
  policy: RevisionPolicy = REVISION_POLICY
): boolean {
  return state.repetitions >= policy.longTermRepetitions && state.intervalDays >= policy.longTermIntervalDays;
}

export const REVISION_DUE_STATUSES = ["NEW", "OVERDUE", "DUE", "LATER_TODAY", "SCHEDULED"] as const;
export type RevisionDueStatus = (typeof REVISION_DUE_STATUSES)[number];

export const REVISION_DUE_STATUS_LABELS: Record<RevisionDueStatus, string> = {
  DUE: "Due now",
  LATER_TODAY: "Later today",
  NEW: "New",
  OVERDUE: "Overdue",
  SCHEDULED: "Scheduled"
};

/**
 * NEW: never reviewed (and its first time has come). OVERDUE: due before
 * today. DUE: due now. LATER_TODAY: an Again coming back later today.
 */
export function revisionDueStatus(
  item: { dueAt: Date; reviewCount: number },
  now: Date,
  timeZone: string | null | undefined
): RevisionDueStatus {
  const { start, end } = revisionDayBounds(now, timeZone);
  const due = item.dueAt.getTime();
  if (item.reviewCount === 0) return due <= now.getTime() ? "NEW" : due < end.getTime() ? "LATER_TODAY" : "SCHEDULED";
  if (due < start.getTime()) return "OVERDUE";
  if (due <= now.getTime()) return "DUE";
  if (due < end.getTime()) return "LATER_TODAY";
  return "SCHEDULED";
}

export type RevisionQueueCandidate = {
  id: string;
  dueAt: Date;
  reviewCount: number;
  lapses: number;
  intervalDays: number;
  recommended: boolean;
  /** Skipped earlier in the student's current local day: served after everything else. */
  skippedToday: boolean;
};

/**
 * Session order. Reviews that are due come first, most urgent first — how
 * overdue relative to the interval, plus weight for lapses and a coach's
 * recommendation. Then never-reviewed items (coach picks first, oldest first),
 * at most `newRemaining` of them. Items skipped today go last. Ties on id, so
 * the order is stable. Nothing is dropped from the backlog: the cut is the
 * session size, and the rest stays due.
 */
export function orderRevisionQueue(
  items: readonly RevisionQueueCandidate[],
  now: Date,
  opts: { limit: number; newRemaining: number }
): string[] {
  const t = now.getTime();
  const urgency = (i: RevisionQueueCandidate) =>
    (t - i.dueAt.getTime()) / (Math.max(1, i.intervalDays) * DAY_MS) + i.lapses * 0.25 + (i.recommended ? 0.5 : 0);
  const byId = (a: RevisionQueueCandidate, b: RevisionQueueCandidate) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

  const ready = items.filter((i) => i.dueAt.getTime() <= t);
  const reviews = ready
    .filter((i) => i.reviewCount > 0)
    .sort((a, b) => urgency(b) - urgency(a) || byId(a, b));
  const fresh = ready
    .filter((i) => i.reviewCount === 0)
    .sort(
      (a, b) =>
        Number(b.recommended) - Number(a.recommended) || a.dueAt.getTime() - b.dueAt.getTime() || byId(a, b)
    )
    .slice(0, Math.max(0, opts.newRemaining));

  const ordered = [...reviews, ...fresh];
  const now_ = ordered.filter((i) => !i.skippedToday);
  const later = ordered.filter((i) => i.skippedToday);
  return [...now_, ...later].slice(0, Math.max(0, opts.limit)).map((i) => i.id);
}

// ── Contract ──

export const revisionReviewRequestSchema = z.object({
  attemptId: z.string().min(1).max(64),
  grade: revisionGradeSchema
});
export type RevisionReviewRequest = z.infer<typeof revisionReviewRequestSchema>;

export const revisionSkipRequestSchema = z.object({ itemId: z.string().min(1).max(64) });
export type RevisionSkipRequest = z.infer<typeof revisionSkipRequestSchema>;

export const REVISION_MAX_RECOMMEND = 20;

export const revisionRecommendRequestSchema = z
  .object({
    puzzleIds: z.array(z.string().min(1).max(64)).max(REVISION_MAX_RECOMMEND).optional(),
    topicId: z.string().min(1).max(64).optional(),
    note: z.string().trim().max(300).optional()
  })
  .refine((v) => (v.puzzleIds?.length ?? 0) > 0 || !!v.topicId, {
    message: "Pick at least one puzzle or a folder."
  });
export type RevisionRecommendRequest = z.infer<typeof revisionRecommendRequestSchema>;

export type RevisionRecommendResponse = {
  /** Items newly added. */
  added: number;
  /** Items the student already had, now marked as recommended and due now. */
  updated: number;
};

export type RevisionSummary = {
  /** Reviews due before the end of today (including overdue). */
  dueToday: number;
  /** Subset of dueToday due before today began. */
  overdue: number;
  /** Never-reviewed items whose time has come. */
  newAvailable: number;
  /** How many of those today's session may still introduce. */
  newRemainingToday: number;
  /** Reviews recorded today. */
  completedToday: number;
  /** Consecutive local days with at least one review, ending today or yesterday. */
  streakDays: number;
  /** Items the next session would serve right now. */
  sessionSize: number;
  estimatedMinutes: number;
  /** When the next item comes due, if nothing is due now. */
  nextDueAt: string | null;
  activeItems: number;
  /** Items whose content the student can no longer open (archived / deleted / out of scope). */
  unavailableItems: number;
  longTermRecall: number;
};

export type RevisionSummaryResponse = { summary: RevisionSummary };

export type RevisionQueueEntry = {
  itemId: string;
  kind: RevisionItemKind;
  source: RevisionItemSource;
  /** Folder name for a TOPIC item; null for a puzzle (its title can give the answer away). */
  topicName: string | null;
  dueStatus: RevisionDueStatus;
  recommendedByName: string | null;
  reviewCount: number;
};

/**
 * Set once the item's attempt is finished but not yet rated: what the server
 * graded and the ratings it will accept. Ratings are never inferred — a
 * finished, unrated review stays here (and stays first in the queue) until
 * the student rates it.
 */
export type RevisionPendingRating = {
  outcome: RevisionOutcome;
  allowedGrades: RevisionGrade[];
};

/** The item being reviewed. The solver itself runs on the ordinary puzzle-attempt routes. */
export type RevisionCurrent = {
  itemId: string;
  attemptId: string;
  puzzleId: string;
  kind: RevisionItemKind;
  source: RevisionItemSource;
  topicName: string | null;
  recommendedByName: string | null;
  note: string | null;
  reviewCount: number;
  dueStatus: RevisionDueStatus;
  /** Null while the puzzle is still being solved. */
  pendingRating: RevisionPendingRating | null;
};

export type RevisionSessionResponse = {
  summary: RevisionSummary;
  queue: RevisionQueueEntry[];
  /** An unfinished review to resume, if any. */
  current: RevisionCurrent | null;
};

export type RevisionNextResponse = { current: RevisionCurrent | null; summary: RevisionSummary };

export type RevisionReviewResponse = {
  itemId: string;
  grade: RevisionGrade;
  outcome: RevisionOutcome;
  intervalDays: number;
  dueAt: string;
  longTermRecall: boolean;
  /** Puzzle themes, revealed now that the item is done. */
  themes: string[];
  summary: RevisionSummary;
};

export type RevisionItemReport = {
  itemId: string;
  kind: RevisionItemKind;
  source: RevisionItemSource;
  /** Puzzle title or folder name — staff views only show titles; the student's own list shows them after a first review. */
  title: string;
  topicName: string | null;
  available: boolean;
  dueStatus: RevisionDueStatus;
  dueAt: string;
  intervalDays: number;
  reviewCount: number;
  lapses: number;
  repetitions: number;
  lastGrade: RevisionGrade | null;
  lastReviewedAt: string | null;
  longTermRecall: boolean;
  recommendedByName: string | null;
  recommendedAt: string | null;
  note: string | null;
  /** The viewer may remove this recommendation. */
  canRemove: boolean;
};

export type RevisionWeekPoint = {
  /** Local date (YYYY-MM-DD) of the week's Monday. */
  weekStart: string;
  reviews: number;
  /** Reviews graded Hard, Good or Easy. */
  recalled: number;
};

export type RevisionReportResponse = {
  summary: RevisionSummary;
  items: RevisionItemReport[];
  /** Last 8 weeks, oldest first. */
  weeks: RevisionWeekPoint[];
  /** Grades over the last 30 days. */
  gradeCounts: Record<RevisionGrade, number>;
  /** Revision attempts that were graded (solved or failed) — attempt accuracy, not recall. */
  attempts: { graded: number; solved: number; clean: number };
  /** Lichess themes on puzzles graded Again in the last 90 days, most missed first. */
  missedThemes: { theme: string; label: string; count: number }[];
  /** Folder items graded Again at least twice. */
  strugglingConcepts: { itemId: string; title: string; lapses: number }[];
};

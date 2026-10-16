import { z } from "zod";
import type { PuzzleDifficulty, PuzzleType } from "./puzzle";

// ──────────────────────────────────────────────────────────────
// Student activity history + progress summary.
//
// Nothing here is stored: the API derives every entry and metric from the
// records the features already keep (puzzle_attempts, move-poll answers,
// student_assignments + their attempts, puzzle-rush entries, live puzzle
// shares + attendance). One HISTORY ENTRY is one activity with its retries
// grouped; ACCURACY is counted per graded ATTEMPT. See docs/STUDENT_ACTIVITY_HISTORY.md.
// ──────────────────────────────────────────────────────────────

/**
 * PRACTICE_PUZZLE  a library / course puzzle (PuzzleAttempt context DIRECT)
 * TRAINING_PUZZLE  rated training (context TRAINING)
 * CLASS_PUZZLE     a puzzle shared in a live class — by hand or by the activity queue
 * HOMEWORK_PUZZLE  one puzzle of a PUZZLE_SET assignment
 * CLASS_QUESTION   a live-class "what would you play?" move poll
 * HOMEWORK         any other assignment (solve a line, play the engine, analysis, replay)
 * PUZZLE_RUSH      a Puzzle Storm / Racer round in class
 */
export const STUDENT_ACTIVITY_TYPES = [
  "PRACTICE_PUZZLE",
  "TRAINING_PUZZLE",
  "CLASS_PUZZLE",
  "HOMEWORK_PUZZLE",
  "CLASS_QUESTION",
  "HOMEWORK",
  "PUZZLE_RUSH"
] as const;
export const studentActivityTypeSchema = z.enum(STUDENT_ACTIVITY_TYPES);
export type StudentActivityType = z.infer<typeof studentActivityTypeSchema>;

export const STUDENT_ACTIVITY_TYPE_LABELS: Record<StudentActivityType, string> = {
  CLASS_PUZZLE: "Class puzzle",
  CLASS_QUESTION: "Class question",
  HOMEWORK: "Assignment",
  HOMEWORK_PUZZLE: "Homework puzzle",
  PRACTICE_PUZZLE: "Practice puzzle",
  PUZZLE_RUSH: "Puzzle Storm / Racer",
  TRAINING_PUZZLE: "Training puzzle"
};

/**
 * CORRECT      solved / the marked answer / a solve-the-line assignment fully solved
 * PARTIAL      a solve-the-line assignment passed without the full line
 * INCORRECT    failed, a wrong answer, or a class puzzle left with wrong moves when it closed
 * UNGRADED     answered or finished, but nothing marks it right or wrong
 *              (an unmarked question, an engine game, analysis, a replay, a puzzle rush)
 * INCOMPLETE   started (moves played) but not finished
 * NOT_STARTED  assigned or opened, no move played
 * SKIPPED      closed without a move (a skipped training puzzle)
 * UNANSWERED   shared in a class the student was in, and they never responded
 */
export const STUDENT_ACTIVITY_OUTCOMES = [
  "CORRECT",
  "PARTIAL",
  "INCORRECT",
  "UNGRADED",
  "INCOMPLETE",
  "NOT_STARTED",
  "SKIPPED",
  "UNANSWERED"
] as const;
export const studentActivityOutcomeSchema = z.enum(STUDENT_ACTIVITY_OUTCOMES);
export type StudentActivityOutcome = z.infer<typeof studentActivityOutcomeSchema>;

export const STUDENT_ACTIVITY_OUTCOME_LABELS: Record<StudentActivityOutcome, string> = {
  CORRECT: "Correct",
  INCOMPLETE: "Incomplete",
  INCORRECT: "Incorrect",
  NOT_STARTED: "Not started",
  PARTIAL: "Partly correct",
  SKIPPED: "Skipped",
  UNANSWERED: "Unanswered",
  UNGRADED: "Ungraded"
};

/** Outcomes that mean the student actually did something (counted as attempted). */
export const ATTEMPTED_OUTCOMES: readonly StudentActivityOutcome[] = [
  "CORRECT",
  "PARTIAL",
  "INCORRECT",
  "UNGRADED",
  "INCOMPLETE"
];

export function isAttemptedOutcome(outcome: StudentActivityOutcome): boolean {
  return ATTEMPTED_OUTCOMES.includes(outcome);
}

/** The status filter: any single outcome, or COMPLETED (every finished activity). */
export const studentActivityStatusFilterSchema = z.enum([...STUDENT_ACTIVITY_OUTCOMES, "COMPLETED"]);
export type StudentActivityStatusFilter = z.infer<typeof studentActivityStatusFilterSchema>;

const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");
const idString = z.string().trim().min(1).max(64);

/** Shared by history and summary: which activities are in scope. */
export const studentActivityScopeSchema = z
  .object({
    /** Inclusive calendar days in the viewer's own timezone. */
    from: dayString.optional(),
    to: dayString.optional(),
    type: studentActivityTypeSchema.optional(),
    /** A batch the activity belongs to (its class's batch or its assignment's batch). */
    batchId: idString.optional(),
    /** One live class (CoachClass id). */
    classId: idString.optional(),
    /** One assignment deployment (AssignmentBatch id). */
    assignmentId: idString.optional()
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: "`from` must be on or before `to`.", path: ["from"] });
export type StudentActivityScope = z.infer<typeof studentActivityScopeSchema>;

export const STUDENT_ACTIVITY_PAGE_SIZE = 25;
export const STUDENT_ACTIVITY_MAX_PAGE_SIZE = 100;

export const studentActivityHistoryQuerySchema = studentActivityScopeSchema.and(
  z.object({
    status: studentActivityStatusFilterSchema.optional(),
    /** Opaque keyset cursor from the previous page's `nextCursor`. */
    cursor: z.string().max(300).optional(),
    limit: z.coerce.number().int().min(1).max(STUDENT_ACTIVITY_MAX_PAGE_SIZE).optional()
  })
);
export type StudentActivityHistoryQuery = z.infer<typeof studentActivityHistoryQuerySchema>;

export type StudentActivityEntry = {
  /** Stable per activity, e.g. `puzzle:class:<classId>:<puzzleId>`, `poll:<answerId>`. */
  id: string;
  type: StudentActivityType;
  outcome: StudentActivityOutcome;
  attempted: boolean;
  /** Finished with a result (right, wrong or ungraded) — not merely started. */
  completed: boolean;
  title: string;
  /** Last thing that happened (finish, answer, or start when unfinished). */
  occurredAt: string;
  startedAt: string | null;
  /** Tries that played at least one move (opened-and-left tries don't count). */
  attempts: number;
  /** Which of those tries got it right, when one did. */
  solvedOnAttempt: number | null;
  score: number | null;
  maxScore: number | null;
  /** As reported by the board; null when nothing was recorded. */
  durationSeconds: number | null;
  hintsUsed: number;
  wrongMoves: number;
  /**
   * Short, already-safe detail: the move a student played on a question, an
   * engine game's result (WIN / LOSS / DRAW), a rush's "12 solved · 2 errors".
   */
  detail: string | null;
  puzzle: {
    id: string;
    difficulty: PuzzleDifficulty;
    puzzleType: PuzzleType;
    /** The library folder, unless it is a hidden system folder. */
    topicName: string | null;
  } | null;
  liveClass: { id: string; title: string | null; startsAt: string } | null;
  batch: { id: string; name: string } | null;
  assignment: { id: string; title: string; dueDate: string } | null;
  /** The classroom activity queue that ran it, when one did. */
  queue: { title: string; position: number } | null;
  /** The student's own note on an assignment (there is no per-activity coach feedback). */
  studentNote: string | null;
};

export type StudentActivityHistoryResponse = {
  entries: StudentActivityEntry[];
  /** Total matching the filters (all pages). */
  total: number;
  nextCursor: string | null;
};

export type StudentActivitySummaryQuery = StudentActivityScope;

/** Below this many graded attempts an accuracy figure is flagged as a small sample. */
export const ACCURACY_MIN_SAMPLE = 10;
/** A theme needs this many graded attempts before it is compared at all. */
export const THEME_MIN_SAMPLE = 5;
/** …and must sit this many points under the student's overall accuracy to be flagged. */
export const THEME_GAP_POINTS = 10;
/** Each half of the trend window needs this many graded attempts. */
export const TREND_MIN_SAMPLE = 8;
/** A change smaller than this is "steady". */
export const TREND_DELTA_POINTS = 10;
/** With no range chosen, the trend compares the last N days with the N before. */
export const TREND_DEFAULT_HALF_DAYS = 30;

export type ActivityGranularity = "day" | "week" | "month";

export type AccuracyStats = {
  gradedAttempts: number;
  correctAttempts: number;
  incorrectAttempts: number;
  /** correct ÷ graded × 100, rounded; null with no graded attempt. */
  accuracyPercent: number | null;
};

export type StudentActivityTypeStats = AccuracyStats & {
  type: StudentActivityType;
  activities: number;
  attempted: number;
  completed: number;
};

export type StudentActivitySeriesPoint = {
  /** `YYYY-MM-DD` — the first day of the bucket in the viewer's timezone. */
  bucket: string;
  activities: number;
  gradedAttempts: number;
  correctAttempts: number;
  accuracyPercent: number | null;
};

export type ActivityTrendStatus = "IMPROVING" | "DECLINING" | "STEADY" | "INSUFFICIENT_DATA";

export type ActivityTrend = {
  status: ActivityTrendStatus;
  /** ISO instant where the earlier half ends and the recent one begins. */
  splitAt: string;
  earlier: AccuracyStats;
  recent: AccuracyStats;
};

export type ActivityThemeStat = AccuracyStats & {
  kind: "TYPE" | "THEME" | "FOLDER";
  key: string;
  label: string;
};

export type RepeatedMistake = {
  puzzleId: string;
  title: string;
  incorrectAttempts: number;
  gradedAttempts: number;
  /** Got it right at some point (in any setting), as of now. */
  eventuallySolved: boolean;
  lastAt: string;
};

export type StudentActivitySummary = {
  studentId: string;
  studentName: string;
  timeZone: string;
  granularity: ActivityGranularity;
  totals: {
    activities: number;
    attempted: number;
    completed: number;
    incomplete: number;
    notStarted: number;
    skipped: number;
    unanswered: number;
  };
  /** Attempt-based: every graded try counts once. */
  accuracy: AccuracyStats & { smallSample: boolean };
  /** Activity-based: graded activities, and how many were right on the first try. */
  firstTry: { gradedActivities: number; firstTryCorrect: number; percent: number | null };
  /** Distinct puzzles, whatever the setting or number of tries. */
  puzzles: { uniqueAttempted: number; uniqueSolved: number };
  lastActivityAt: string | null;
  byType: StudentActivityTypeStats[];
  series: StudentActivitySeriesPoint[];
  insights: {
    repeatedMistakes: RepeatedMistake[];
    /** Themes / types / folders well under the overall accuracy, weakest first. */
    weakThemes: ActivityThemeStat[];
    /** How many themes had enough graded attempts to be compared at all. */
    comparableThemes: number;
    trend: ActivityTrend;
  };
  /** Filter options: only what this student has history in. */
  facets: {
    batches: { id: string; name: string }[];
    classes: { id: string; title: string | null; startsAt: string }[];
    assignments: { id: string; title: string }[];
  };
};

export type StudentActivitySummaryResponse = { summary: StudentActivitySummary };

// ── Pure helpers (shared by the API and its specs) ──

export function accuracyStats(gradedAttempts: number, correctAttempts: number): AccuracyStats {
  return {
    accuracyPercent: gradedAttempts > 0 ? Math.round((correctAttempts / gradedAttempts) * 100) : null,
    correctAttempts,
    gradedAttempts,
    incorrectAttempts: gradedAttempts - correctAttempts
  };
}

/** Day buckets up to a month, weeks up to ~6 months, months beyond (or with no start). */
export function activityGranularity(fromDay: string | undefined, toDay: string): ActivityGranularity {
  if (!fromDay) return "month";
  const days = (Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86_400_000 + 1;
  if (days <= 31) return "day";
  if (days <= 186) return "week";
  return "month";
}

export function classifyTrend(earlier: AccuracyStats, recent: AccuracyStats): ActivityTrendStatus {
  if (
    earlier.gradedAttempts < TREND_MIN_SAMPLE ||
    recent.gradedAttempts < TREND_MIN_SAMPLE ||
    earlier.accuracyPercent === null ||
    recent.accuracyPercent === null
  ) {
    return "INSUFFICIENT_DATA";
  }
  const delta = recent.accuracyPercent - earlier.accuracyPercent;
  if (delta >= TREND_DELTA_POINTS) return "IMPROVING";
  if (delta <= -TREND_DELTA_POINTS) return "DECLINING";
  return "STEADY";
}

const KIND_SPECIFICITY: Record<ActivityThemeStat["kind"], number> = { FOLDER: 1, THEME: 0, TYPE: 2 };

/**
 * Themes with enough graded attempts whose accuracy sits at least
 * THEME_GAP_POINTS under the overall figure, weakest first.
 */
export function pickWeakThemes(
  themes: ActivityThemeStat[],
  overallAccuracy: number | null,
  limit = 5
): { weak: ActivityThemeStat[]; comparable: number } {
  const comparable = themes.filter((t) => t.gradedAttempts >= THEME_MIN_SAMPLE && t.accuracyPercent !== null);
  if (overallAccuracy === null) return { comparable: comparable.length, weak: [] };
  // A theme tag, its folder and its puzzle type often measure the very same
  // tries; show that evidence once, under its most specific name.
  const seen = new Set<string>();
  const weak = [...comparable]
    .sort((a, b) => KIND_SPECIFICITY[a.kind] - KIND_SPECIFICITY[b.kind])
    .filter((t) => {
      const signature = `${t.gradedAttempts}:${t.correctAttempts}`;
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    })
    .filter((t) => (t.accuracyPercent as number) <= overallAccuracy - THEME_GAP_POINTS)
    .sort(
      (a, b) =>
        (a.accuracyPercent as number) - (b.accuracyPercent as number) || b.gradedAttempts - a.gradedAttempts
    )
    .slice(0, limit);
  return { comparable: comparable.length, weak };
}

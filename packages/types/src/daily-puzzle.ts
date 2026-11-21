import { z } from "zod";
import { addDays } from "./progress";

// ──────────────────────────────────────────────────────────────
// Puzzle of the Day (docs/PUZZLE_OF_THE_DAY.md). Three levels a day per
// academy, picked automatically; an admin (academy) or a coach (their batch)
// may override any day and level, or turn it off. Days are calendar days in
// the academy's time zone, as `YYYY-MM-DD`.
// ──────────────────────────────────────────────────────────────

export const dailyPuzzleLevelSchema = z.enum(["EASY", "MEDIUM", "HARD"]);
export type DailyPuzzleLevel = z.infer<typeof dailyPuzzleLevelSchema>;
export const DAILY_PUZZLE_LEVELS: DailyPuzzleLevel[] = ["EASY", "MEDIUM", "HARD"];

export const DAILY_PUZZLE_LEVEL_LABELS: Record<DailyPuzzleLevel, string> = {
  EASY: "Easy",
  HARD: "Hard",
  MEDIUM: "Medium"
};

/** Puzzle rating band of each level, `[min, max)`. */
export const DAILY_PUZZLE_BANDS: Record<DailyPuzzleLevel, readonly [number, number]> = {
  EASY: [800, 1200],
  HARD: [1600, 2000],
  MEDIUM: [1200, 1600]
};

/** Days the admin / coach schedule shows from its start day. */
export const DAILY_PUZZLE_SCHEDULE_DAYS = 14;

/** A student's level from their puzzle rating (1200 before any rated puzzle = Medium). */
export function dailyPuzzleLevelFor(rating: number): DailyPuzzleLevel {
  if (rating < DAILY_PUZZLE_BANDS.MEDIUM[0]) return "EASY";
  if (rating < DAILY_PUZZLE_BANDS.HARD[0]) return "MEDIUM";
  return "HARD";
}

export type DailyPuzzleSource = "AUTO" | "ACADEMY" | "BATCH";

/**
 * The one rule for which puzzle a day and level shows: the coach's override on
 * the student's home batch, else the admin's for the academy, else the
 * automatic pick. `null` everywhere = nothing to show yet (picked on demand).
 */
export function resolveDailyPuzzleSource<T>(layers: {
  auto: T | null;
  academy: T | null;
  batch: T | null;
}): { source: DailyPuzzleSource; value: T } | null {
  if (layers.batch !== null) return { source: "BATCH", value: layers.batch };
  if (layers.academy !== null) return { source: "ACADEMY", value: layers.academy };
  if (layers.auto !== null) return { source: "AUTO", value: layers.auto };
  return null;
}

/**
 * The streak on `today`: consecutive days ending today — or yesterday, while
 * today's puzzle is still open — with at least one finished daily puzzle
 * (solved or not). Days are `YYYY-MM-DD` in the academy's time zone.
 */
export function computeDailyStreak(finishedDays: Iterable<string>, today: string): number {
  const days = new Set(finishedDays);
  let day = days.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (days.has(day)) {
    streak += 1;
    day = addDays(day, -1);
  }
  return streak;
}

/** The longest run of consecutive finished days. */
export function longestDailyStreak(finishedDays: Iterable<string>): number {
  const sorted = [...new Set(finishedDays)].sort();
  let best = 0;
  let run = 0;
  sorted.forEach((day, index) => {
    run = index > 0 && addDays(sorted[index - 1], 1) === day ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

export const startDailyPuzzleRequestSchema = z.object({ level: dailyPuzzleLevelSchema }).strict();
export type StartDailyPuzzleRequest = z.infer<typeof startDailyPuzzleRequestSchema>;

export const setDailyPuzzleOverrideRequestSchema = z
  .object({
    /** Omitted = the academy's override (admin only). */
    batchId: z.string().min(1).optional(),
    day: daySchema,
    level: dailyPuzzleLevelSchema,
    /** null clears the override (back to the next layer). */
    puzzleId: z.string().min(1).nullable()
  })
  .strict();
export type SetDailyPuzzleOverrideRequest = z.infer<typeof setDailyPuzzleOverrideRequestSchema>;

export const updateDailyPuzzleSettingsRequestSchema = z.object({ enabled: z.boolean() }).strict();
export type UpdateDailyPuzzleSettingsRequest = z.infer<typeof updateDailyPuzzleSettingsRequestSchema>;

export const updateBatchDailyPuzzleRequestSchema = z.object({ enabled: z.boolean() }).strict();
export type UpdateBatchDailyPuzzleRequest = z.infer<typeof updateBatchDailyPuzzleRequestSchema>;

/** A puzzle as the student sees it before solving: never the solution. */
export type DailyPuzzleCard = {
  level: DailyPuzzleLevel;
  puzzleId: string;
  title: string;
  rating: number | null;
  /** The student's result today at this level. */
  result: "SOLVED" | "FAILED" | "IN_PROGRESS" | null;
};

export type DailyPuzzleTodayResponse = {
  /** False: the academy or every one of the student's batches has it off. */
  enabled: boolean;
  /** `YYYY-MM-DD` in the academy's time zone. */
  day: string;
  /** The student's own level (from their puzzle rating). */
  myLevel: DailyPuzzleLevel;
  /** Today's puzzles; a level with nothing to show (no catalogue) is missing. */
  puzzles: DailyPuzzleCard[];
  /** Today's daily puzzle finished at any level (keeps the streak). */
  doneToday: boolean;
  streak: number;
  bestStreak: number;
};

export type StartDailyPuzzleResponse = {
  puzzleId: string;
  attemptId: string;
};

export type DailyPuzzleScheduleSlot = {
  day: string;
  level: DailyPuzzleLevel;
  /** What students see; null = not picked yet (picked on the day). */
  puzzle: { id: string; title: string; rating: number | null } | null;
  source: DailyPuzzleSource | null;
  /** Whether the viewer's scope (academy or this batch) overrides it. */
  overridden: boolean;
};

export type DailyPuzzleScheduleResponse = {
  /** null = the academy's schedule. */
  batchId: string | null;
  /** Academy switch, and the batch's when `batchId` is set. */
  academyEnabled: boolean;
  batchEnabled: boolean | null;
  today: string;
  slots: DailyPuzzleScheduleSlot[];
};

export type DailyPuzzleSettingsResponse = { enabled: boolean };

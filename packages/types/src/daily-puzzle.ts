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

/** The most wrong replies an academy may allow on WhatsApp. */
export const DAILY_PUZZLE_MAX_WHATSAPP_TRIES = 10;

/**
 * Step 3 (picture + answering by WhatsApp reply), set by an academy admin: the
 * pictured level, the wrong replies allowed, and after how many wrong ones a
 * HINT and the ANSWER may be asked for (hint ≤ answer ≤ max).
 */
export const dailyPuzzleWhatsAppSettingsSchema = z
  .object({
    level: dailyPuzzleLevelSchema,
    maxTries: z.number().int().min(1).max(DAILY_PUZZLE_MAX_WHATSAPP_TRIES),
    hintAfter: z.number().int().min(0).max(DAILY_PUZZLE_MAX_WHATSAPP_TRIES),
    answerAfter: z.number().int().min(0).max(DAILY_PUZZLE_MAX_WHATSAPP_TRIES)
  })
  .strict()
  .refine((v) => v.hintAfter <= v.answerAfter && v.answerAfter <= v.maxTries, {
    message: "A hint can't come after the answer, and the answer can't need more wrong tries than allowed.",
    path: ["answerAfter"]
  });
export type DailyPuzzleWhatsAppSettings = z.infer<typeof dailyPuzzleWhatsAppSettingsSchema>;

export const DEFAULT_DAILY_PUZZLE_WHATSAPP_SETTINGS: DailyPuzzleWhatsAppSettings = {
  answerAfter: 3,
  hintAfter: 1,
  level: "MEDIUM",
  maxTries: 3
};

export const updateDailyPuzzleSettingsRequestSchema = z
  .object({ enabled: z.boolean().optional(), whatsapp: dailyPuzzleWhatsAppSettingsSchema.optional() })
  .strict();
export type UpdateDailyPuzzleSettingsRequest = z.infer<typeof updateDailyPuzzleSettingsRequestSchema>;

/**
 * A WhatsApp reply to the day's picture (step 3): HINT, ANSWER, or something
 * shaped like a chess move (SAN or UCI, `+`/`#`/`!`/`?` optional, castling with
 * O or 0). Only the shape: whether it is legal, or right, is the game engine's
 * call. Null = not about the puzzle (the support bot takes it).
 */
export type DailyPuzzleReply = { kind: "HINT" } | { kind: "ANSWER" } | { kind: "MOVE"; text: string };

const SAN_MOVE = /^(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=?[QRBN])?|O-O(?:-O)?)$/i;
const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/i;

export function parseDailyPuzzleReply(text: string): DailyPuzzleReply | null {
  const word = text.trim().replace(/[.!]+$/, "").toLowerCase();
  if (word === "hint") return { kind: "HINT" };
  if (word === "answer" || word === "solution") return { kind: "ANSWER" };
  const move = text
    .trim()
    .replace(/0/g, "O")
    .replace(/[+#!?.]+$/, "");
  if (move.length < 2 || move.length > 8) return null;
  return SAN_MOVE.test(move) || UCI_MOVE.test(move) ? { kind: "MOVE", text: move } : null;
}

/** What the board picture route draws (a public, signed link; no solution, no student data). */
export type DailyPuzzlePictureResponse = {
  fen: string;
  /** Black to move: drawn from Black's side. */
  flip: boolean;
  boardTheme: string;
  pieceSet: string;
};

/** The student's own WhatsApp switch (step 2). */
export const updateDailyPuzzleWhatsAppRequestSchema = z.object({ on: z.boolean() }).strict();
export type UpdateDailyPuzzleWhatsAppRequest = z.infer<typeof updateDailyPuzzleWhatsAppRequestSchema>;

/**
 * Puzzle of the Day on WhatsApp for the signed-in student (step 2): it goes to
 * the account's own phone, on by default; this switch is the only on/off.
 */
export type DailyPuzzleWhatsAppStatus = {
  /** The academy sends it (messaging rule on, WhatsApp connected). */
  available: boolean;
  /** The student's switch (on unless they turned it off). */
  on: boolean;
  /** The account phone it goes to, masked ("••••3210"); null = no usable number. */
  phoneMasked: string | null;
  /** When it goes out, e.g. "Weekdays at 7:00 am"; null while not available. */
  schedule: string | null;
  /** Another student account has the same phone: the message is the link only. */
  sharedPhone: boolean;
};

/** Academy view of the WhatsApp send, for the admin schedule page (cost visibility). */
export type DailyPuzzleWhatsAppSummary = {
  /** The messaging rule is on with WhatsApp, and the academy's WhatsApp is connected. */
  sending: boolean;
  schedule: string;
  /** Students it reaches (Puzzle of the Day on, switch on, usable phone). */
  students: number;
  /** Numbers it goes to (one message each per send day). */
  numbers: number;
  /** Of those, numbers on 2+ student accounts (link only). */
  sharedNumbers: number;
  /** Students who switched it off. */
  turnedOff: number;
  /** Students with no, or no usable, phone on their account. */
  noPhone: number;
  /** Step 3: pictured level and the reply limits. */
  settings: DailyPuzzleWhatsAppSettings;
};

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
  whatsapp: DailyPuzzleWhatsAppStatus;
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
  /** Academy scope for admins only; null for a batch. */
  whatsapp: DailyPuzzleWhatsAppSummary | null;
};

export type DailyPuzzleSettingsResponse = { enabled: boolean; whatsapp: DailyPuzzleWhatsAppSettings };

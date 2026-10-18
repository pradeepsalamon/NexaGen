import { z } from "zod";
import { LICHESS_THEMES, lichessThemeLabel } from "./lichess-themes";

// ──────────────────────────────────────────────────────────────
// Student puzzle training — Lichess-style rated practice
// (docs/PUZZLE_CATALOGUE_IMPLEMENTATION_SPEC.md §12)
// ──────────────────────────────────────────────────────────────
// The server serves one puzzle at a time near the student's own puzzle rating.
// The pick is a healthy mix, not a random one: a fixed slot cycle alternates
// the student's weakest themes, themes they rarely meet, a general mixed pick
// and a review of a puzzle they failed. Everything here is pure and shared, so
// the policy is unit-tested once and the page can explain each pick.

export const puzzleTrainingSlots = ["WEAK", "EXPLORE", "MIXED", "REVIEW"] as const;
export type PuzzleTrainingSlot = (typeof puzzleTrainingSlots)[number];

/** Indexed by `trainingCount mod 10`: half weak-theme practice, the rest spread out. */
export const TRAINING_SLOT_CYCLE: readonly PuzzleTrainingSlot[] = [
  "WEAK",
  "WEAK",
  "MIXED",
  "WEAK",
  "EXPLORE",
  "WEAK",
  "REVIEW",
  "MIXED",
  "WEAK",
  "EXPLORE"
];

/**
 * Rating offset per slot, so the difficulty varies too: weak themes are
 * practised slightly below the target, a mixed pick stretches slightly above.
 */
export const TRAINING_SLOT_RATING_OFFSET: Record<PuzzleTrainingSlot, number> = {
  EXPLORE: 0,
  MIXED: 50,
  REVIEW: 0,
  WEAK: -50
};

export const TRAINING_SLOT_LABELS: Record<PuzzleTrainingSlot, string> = {
  EXPLORE: "Something new",
  MIXED: "Mixed",
  REVIEW: "Second chance",
  WEAK: "Practise a weak spot"
};

export const TRAINING_MIN_RATING = 400;
export const TRAINING_MAX_RATING = 2800;
/** Recent results that move the target up or down. */
export const TRAINING_FORM_WINDOW = 10;
/** A WEAK theme needs at least this many recent attempts to be judged. */
export const TRAINING_WEAK_MIN_ATTEMPTS = 5;

/** One finished attempt, as the policy needs it. */
export type TrainingResult = {
  solved: boolean;
  wrongMoves: number;
  hintsUsed: number;
  /** Lichess theme keys of the puzzle (its `tags`). */
  themes: readonly string[];
  /** ISO time it finished. */
  completedAt: string;
};

export const isCleanSolve = (r: Pick<TrainingResult, "solved" | "wrongMoves" | "hintsUsed">) =>
  r.solved && r.wrongMoves === 0 && r.hintsUsed === 0;

/**
 * The rating to serve at: the student's own, nudged by their form over the
 * last ten training puzzles (≥ 8 clean → +75, ≤ 4 clean → −75), so a student
 * on a streak is stretched and one who is struggling gets breathing room.
 * `recentTraining` is most recent first.
 */
export function trainingTargetRating(rating: number, recentTraining: readonly TrainingResult[]): number {
  const window = recentTraining.slice(0, TRAINING_FORM_WINDOW);
  let target = rating;
  if (window.length >= TRAINING_FORM_WINDOW) {
    const clean = window.filter(isCleanSolve).length;
    if (clean >= 8) target = rating + 75;
    else if (clean <= 4) target = rating - 75;
  }
  return clamp(target);
}

function clamp(rating: number): number {
  return Math.round(Math.min(TRAINING_MAX_RATING, Math.max(TRAINING_MIN_RATING, rating)));
}

/** Themes the recommender may target: mate patterns and tactical motifs. */
const TARGETABLE = LICHESS_THEMES.filter((t) => t.group === "mate" || t.group === "motif");

function eligibleThemes(target: number) {
  return TARGETABLE.filter((t) => t.minRating === null || t.minRating <= target);
}

/**
 * WEAK: among themes seen at least five times recently, the one with the
 * lowest smoothed clean rate `(clean + 1) / (attempts + 2)`; ties go to the
 * theme met least recently. Null when nothing has enough history yet.
 * `recent` is most recent first.
 */
export function weakestTheme(target: number, recent: readonly TrainingResult[]): string | null {
  type Stat = { attempts: number; clean: number; lastIndex: number };
  const stats = new Map<string, Stat>();
  recent.forEach((r, index) => {
    for (const key of r.themes) {
      const stat = stats.get(key) ?? { attempts: 0, clean: 0, lastIndex: index };
      stat.attempts += 1;
      if (isCleanSolve(r)) stat.clean += 1;
      stat.lastIndex = Math.min(stat.lastIndex, index);
      stats.set(key, stat);
    }
  });
  let best: { key: string; rate: number; lastIndex: number } | null = null;
  for (const theme of eligibleThemes(target)) {
    const stat = stats.get(theme.key);
    if (!stat || stat.attempts < TRAINING_WEAK_MIN_ATTEMPTS) continue;
    const rate = (stat.clean + 1) / (stat.attempts + 2);
    if (!best || rate < best.rate || (rate === best.rate && stat.lastIndex > best.lastIndex)) {
      best = { key: theme.key, lastIndex: stat.lastIndex, rate };
    }
  }
  return best?.key ?? null;
}

/** EXPLORE: the eligible theme met least often recently; ties go to catalogue order. */
export function leastSeenTheme(target: number, recent: readonly TrainingResult[]): string | null {
  const counts = new Map<string, number>();
  for (const r of recent) for (const key of r.themes) counts.set(key, (counts.get(key) ?? 0) + 1);
  let best: { key: string; count: number } | null = null;
  for (const theme of eligibleThemes(target)) {
    const count = counts.get(theme.key) ?? 0;
    if (!best || count < best.count) best = { count, key: theme.key };
  }
  return best?.key ?? null;
}

export type TrainingPlan = {
  slot: PuzzleTrainingSlot;
  /** The theme to look for; null = any (a MIXED or REVIEW pick). */
  theme: string | null;
  /** Where to look: the target rating plus the slot's offset. */
  targetRating: number;
};

/**
 * The next pick. `requestedTheme` (a "practise forks" button) overrides the
 * cycle. REVIEW with nothing due falls through to WEAK; WEAK with too little
 * history to EXPLORE; anything without a theme becomes MIXED.
 */
export function planTrainingPick(input: {
  rating: number;
  trainingCount: number;
  /** TRAINING results only, most recent first. */
  recentTraining: readonly TrainingResult[];
  /** Every finished puzzle attempt (any context), most recent first, up to 200. */
  recentAll: readonly TrainingResult[];
  reviewDue: boolean;
  requestedTheme?: string | null;
}): TrainingPlan {
  const base = trainingTargetRating(input.rating, input.recentTraining);
  const at = (slot: PuzzleTrainingSlot) => clamp(base + TRAINING_SLOT_RATING_OFFSET[slot]);

  if (input.requestedTheme) {
    return { slot: "MIXED", targetRating: base, theme: input.requestedTheme };
  }

  let slot = TRAINING_SLOT_CYCLE[((input.trainingCount % 10) + 10) % 10];
  if (slot === "REVIEW") {
    if (input.reviewDue) return { slot, targetRating: at(slot), theme: null };
    slot = "WEAK";
  }
  if (slot === "WEAK") {
    const theme = weakestTheme(base, input.recentAll);
    if (theme) return { slot, targetRating: at(slot), theme };
    slot = "EXPLORE";
  }
  if (slot === "EXPLORE") {
    const theme = leastSeenTheme(base, input.recentAll);
    if (theme) return { slot, targetRating: at(slot), theme };
  }
  return { slot: "MIXED", targetRating: at("MIXED"), theme: null };
}

/** Rating band (50 points wide) the catalogue walk starts in, then its neighbours. */
export function trainingBandOrder(targetRating: number): number[] {
  const band = Math.floor(targetRating / 50);
  return [band, band + 1, band - 1, band + 2, band - 2].filter((b) => b >= 0);
}

/** Display labels for a puzzle's theme keys, mate patterns and motifs first. */
export function trainingThemeLabels(themes: readonly string[]): string[] {
  const order = new Map(LICHESS_THEMES.map((t, i) => [t.key, i]));
  return [...themes]
    .filter((key) => {
      const group = LICHESS_THEMES.find((t) => t.key === key)?.group;
      return group === "mate" || group === "motif" || group === "special" || group === "phase";
    })
    .sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999))
    .map(lichessThemeLabel);
}

// ── Contract ──

export const puzzleTrainingNextRequestSchema = z.object({
  /** Optional: practise one theme (a Lichess key) instead of the mix. */
  theme: z
    .string()
    .refine((key) => LICHESS_THEMES.some((t) => t.key === key), { message: "Unknown puzzle theme." })
    .optional()
});
export type PuzzleTrainingNextRequest = z.infer<typeof puzzleTrainingNextRequestSchema>;

/** The puzzle being trained on — the solver itself runs on the ordinary attempt routes. */
export type PuzzleTrainingPick = {
  puzzleId: string;
  attemptId: string;
  slot: PuzzleTrainingSlot | null;
  /** The theme the pick aimed at, if any (shown only once the puzzle is over). */
  theme: string | null;
  themeLabel: string | null;
  /** The puzzle's own rating (its difficulty bucket when it has none). */
  puzzleRating: number;
  /** Lichess theme keys of the puzzle, revealed after the solve. */
  themes: string[];
};

export type PuzzleTrainingNextResponse = { pick: PuzzleTrainingPick };

export type PuzzleTrainingRecentResult = {
  attemptId: string;
  puzzleId: string;
  puzzleRating: number;
  solved: boolean;
  /** null while the rating change is being recorded, or for a puzzle rated before. */
  ratingChange: number | null;
  completedAt: string;
};

export type PuzzleTrainingStatusResponse = {
  /** False when none of the student's batches allows training. */
  enabled: boolean;
  rating: number;
  peakRating: number;
  ratedPuzzles: number;
  currentStreak: number;
  /** Training puzzles finished today / overall. */
  trainedToday: number;
  trainedTotal: number;
  /** An unfinished training puzzle to resume, if any. */
  current: PuzzleTrainingPick | null;
  /** Last training results, most recent first. */
  recent: PuzzleTrainingRecentResult[];
};

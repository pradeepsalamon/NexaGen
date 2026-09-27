import { z } from "zod";

// ──────────────────────────────────────────────────────────────
// Puzzle points & leaderboard rules — shared contract
// ──────────────────────────────────────────────────────────────
// How a live-class puzzle turns a student's attempt into points, and how the
// leaderboard shows them. Resolved in layers, last non-empty field wins:
//
//   system defaults (below)
//     → admin platform default   (`PuzzleScoringSettings` singleton)
//       → the puzzle's own override (`Puzzle.scoringJson`, set in the puzzle form)
//         → what the coach picks when sharing (`AssignLivePuzzleRequest.scoring`)
//
// The resolved result is frozen onto the assignment at share time
// (`LiveClassPuzzleAssignment.scoringJson` / `.leaderboardJson`), so an admin
// changing the default mid-class never re-scores a running puzzle — only the
// coach editing that assignment does.
//
// `computePuzzlePoints` is the ONE place points are calculated. The API ranks
// with it and the share dialog previews with it, so the preview can't drift.

// ── Scoring ──

export const MAX_FIRST_SOLVE_BONUSES = 5;

export const puzzleScoringSchema = z.object({
  /** Points for a full, clean solve. */
  basePoints: z.number().int().min(0).max(10_000),
  /** Unsolved attempts earn `basePoints × score%` instead of 0. */
  partialCredit: z.boolean(),
  /** Taken off per wrong move tried (a negative mark). */
  wrongMovePenalty: z.number().int().min(0).max(1_000),
  /** Taken off per hint revealed. */
  hintPenalty: z.number().int().min(0).max(1_000),
  /** Extra points for a fast solve, shrinking to 0 over `speedBonusSeconds`. */
  speedBonusMax: z.number().int().min(0).max(10_000),
  speedBonusSeconds: z.number().int().min(10).max(3_600),
  /** Bonus for the 1st, 2nd, 3rd… student to solve it. */
  firstSolveBonuses: z.array(z.number().int().min(0).max(10_000)).max(MAX_FIRST_SOLVE_BONUSES),
  /** Let penalties push a total below 0 (otherwise it floors at 0). */
  allowNegative: z.boolean(),
  /** Attempts each student gets at this puzzle in class; null = unlimited (best counts). */
  maxAttempts: z.number().int().min(1).max(20).nullable()
});
export type PuzzleScoring = z.infer<typeof puzzleScoringSchema>;

/** A partial override — any field left out inherits from the layer below. */
export const puzzleScoringOverrideSchema = puzzleScoringSchema.partial();
export type PuzzleScoringOverride = z.infer<typeof puzzleScoringOverrideSchema>;

export const DEFAULT_PUZZLE_SCORING: PuzzleScoring = {
  allowNegative: false,
  basePoints: 10,
  firstSolveBonuses: [],
  hintPenalty: 3,
  maxAttempts: null,
  partialCredit: true,
  speedBonusMax: 0,
  speedBonusSeconds: 120,
  wrongMovePenalty: 3
};

// ── Leaderboard ──

export const LEADERBOARD_VISIBILITIES = ["LIVE", "AFTER_END", "HIDDEN"] as const;
export const leaderboardVisibilitySchema = z.enum(LEADERBOARD_VISIBILITIES);
export type LeaderboardVisibility = z.infer<typeof leaderboardVisibilitySchema>;

export const LEADERBOARD_VISIBILITY_LABELS: Record<LeaderboardVisibility, string> = {
  AFTER_END: "After the puzzle ends",
  HIDDEN: "Never (coach only)",
  LIVE: "Live, while solving"
};

export const LEADERBOARD_RANK_BY = ["POINTS", "SCORE_THEN_TIME"] as const;
export const leaderboardRankBySchema = z.enum(LEADERBOARD_RANK_BY);
export type LeaderboardRankBy = z.infer<typeof leaderboardRankBySchema>;

export const LEADERBOARD_RANK_BY_LABELS: Record<LeaderboardRankBy, string> = {
  POINTS: "Points",
  SCORE_THEN_TIME: "Score %, then fastest"
};

export const puzzleLeaderboardOptionsSchema = z.object({
  /** When students see everyone's results. Coaches always see the full board. */
  visibility: leaderboardVisibilitySchema,
  rankBy: leaderboardRankBySchema,
  /** Students see only the top N (plus their own row); null = everyone. */
  topN: z.number().int().min(1).max(100).nullable(),
  /** Students see other students as "Student 4" instead of by name. */
  anonymize: z.boolean(),
  /** Show time / hints / wrong moves next to each row. */
  showStats: z.boolean()
});
export type PuzzleLeaderboardOptions = z.infer<typeof puzzleLeaderboardOptionsSchema>;

export const puzzleLeaderboardOverrideSchema = puzzleLeaderboardOptionsSchema.partial();
export type PuzzleLeaderboardOverride = z.infer<typeof puzzleLeaderboardOverrideSchema>;

export const DEFAULT_PUZZLE_LEADERBOARD: PuzzleLeaderboardOptions = {
  anonymize: false,
  rankBy: "POINTS",
  showStats: true,
  topN: null,
  visibility: "LIVE"
};

// ── Resolution ──

function merge<T extends object>(base: T, layers: Array<Partial<T> | null | undefined>): T {
  const out = { ...base };
  for (const layer of layers) {
    if (!layer) continue;
    for (const [key, value] of Object.entries(layer)) {
      if (value !== undefined) (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

/** Parses a stored JSON override, dropping anything that no longer validates. */
export function parseScoringOverride(value: unknown): PuzzleScoringOverride | null {
  const parsed = puzzleScoringOverrideSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseLeaderboardOverride(value: unknown): PuzzleLeaderboardOverride | null {
  const parsed = puzzleLeaderboardOverrideSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function resolvePuzzleScoring(
  ...layers: Array<PuzzleScoringOverride | null | undefined>
): PuzzleScoring {
  return merge(DEFAULT_PUZZLE_SCORING, layers);
}

export function resolvePuzzleLeaderboard(
  ...layers: Array<PuzzleLeaderboardOverride | null | undefined>
): PuzzleLeaderboardOptions {
  return merge(DEFAULT_PUZZLE_LEADERBOARD, layers);
}

// ── Points ──

export type PuzzleAttemptFacts = {
  solved: boolean;
  /** 0–100, share of the student's moves in the line they got right. */
  scorePercent: number;
  wrongMoves: number;
  hintsUsed: number;
  durationSeconds: number;
  /** 1 = first student to solve it; null when unsolved. */
  solveOrder: number | null;
  /** Coach's manual +/- for this student. */
  adjustment?: number;
};

export type PuzzlePointsBreakdown = {
  base: number;
  speedBonus: number;
  firstSolveBonus: number;
  wrongMovePenalty: number;
  hintPenalty: number;
  adjustment: number;
  total: number;
};

export function computePuzzlePoints(
  scoring: PuzzleScoring,
  facts: PuzzleAttemptFacts
): PuzzlePointsBreakdown {
  const base = facts.solved
    ? scoring.basePoints
    : scoring.partialCredit
      ? Math.round((scoring.basePoints * Math.max(0, Math.min(100, facts.scorePercent))) / 100)
      : 0;

  const speedBonus =
    facts.solved && scoring.speedBonusMax > 0
      ? Math.round(
          scoring.speedBonusMax *
            Math.max(0, 1 - Math.max(0, facts.durationSeconds) / scoring.speedBonusSeconds)
        )
      : 0;

  const firstSolveBonus =
    facts.solved && facts.solveOrder !== null
      ? (scoring.firstSolveBonuses[facts.solveOrder - 1] ?? 0)
      : 0;

  const wrongMovePenalty = Math.max(0, facts.wrongMoves) * scoring.wrongMovePenalty;
  const hintPenalty = Math.max(0, facts.hintsUsed) * scoring.hintPenalty;
  const adjustment = facts.adjustment ?? 0;

  const earned = base + speedBonus + firstSolveBonus - wrongMovePenalty - hintPenalty;
  const floored = scoring.allowNegative ? earned : Math.max(0, earned);

  return {
    adjustment,
    base,
    firstSolveBonus,
    hintPenalty,
    speedBonus,
    // A coach's manual adjustment is applied after the floor — a deliberate
    // deduction should still show.
    total: floored + adjustment,
    wrongMovePenalty
  };
}

/** One-line plain-language summary of a scoring config, for previews. */
export function describePuzzleScoring(scoring: PuzzleScoring): string[] {
  const lines = [`${scoring.basePoints} points for solving it.`];
  if (scoring.partialCredit) lines.push("Partial points for getting part of the line.");
  if (scoring.speedBonusMax > 0) {
    lines.push(
      `Up to +${scoring.speedBonusMax} for speed, gone after ${scoring.speedBonusSeconds}s.`
    );
  }
  if (scoring.firstSolveBonuses.some((b) => b > 0)) {
    lines.push(
      `First solvers bonus: ${scoring.firstSolveBonuses.map((b, i) => `#${i + 1} +${b}`).join(", ")}.`
    );
  }
  if (scoring.wrongMovePenalty > 0) lines.push(`−${scoring.wrongMovePenalty} per wrong move.`);
  if (scoring.hintPenalty > 0) lines.push(`−${scoring.hintPenalty} per hint.`);
  if (scoring.allowNegative) lines.push("Totals can go below zero.");
  lines.push(
    scoring.maxAttempts === null
      ? "Unlimited tries — the best one counts."
      : `${scoring.maxAttempts} ${scoring.maxAttempts === 1 ? "try" : "tries"} per student.`
  );
  return lines;
}

// ── Admin platform default ──

export type PuzzleScoringSettingsDto = {
  scoring: PuzzleScoring;
  leaderboard: PuzzleLeaderboardOptions;
  updatedAt: string | null;
  updatedByName: string | null;
};
export type PuzzleScoringSettingsResponse = { settings: PuzzleScoringSettingsDto };

export const updatePuzzleScoringSettingsRequestSchema = z.object({
  scoring: puzzleScoringSchema,
  leaderboard: puzzleLeaderboardOptionsSchema
});
export type UpdatePuzzleScoringSettingsRequest = z.infer<
  typeof updatePuzzleScoringSettingsRequestSchema
>;

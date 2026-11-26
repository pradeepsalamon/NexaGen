import { z } from "zod";
import { resolveBatchType, type BatchType } from "./batch-type";

// ──────────────────────────────────────────────────────────────
// Puzzle Storm & Puzzle Racer — the Lichess timed puzzle modes, as two
// live-class Interactives.
// ──────────────────────────────────────────────────────────────
// The coach starts a round; every student plays the same run of Lichess
// catalogue puzzles that get harder as they go (Lichess' own StormSelector
// rating ladder, which Racer shares). Moves are checked in the browser, the
// way Lichess does it, and each student's running totals are reported to the
// API, which clamps them to what the run makes possible and ranks the class.
//
// Storm:  3:00 on a clock that starts with your first move. A wrong move costs
//         10 seconds, breaks the combo and moves on to the next puzzle. Combos
//         of 5 / 12 / 20 / 30 (then every 10) correct moves add 3 / 5 / 7 / 10
//         seconds. Score = puzzles solved.
// Racer:  everyone races the same puzzles for 90 seconds after a countdown.
//         Every correct move is a point, combos of 5 / 12 / 20 / 30 (then
//         every 10) add 1 / 2 / 3 / 4 bonus points, a wrong move skips the
//         puzzle, and once per race you may skip a move without losing the combo.

export const LIVE_CLASS_PUZZLE_RUSH_TOPIC = "puzzle_rush";

export const puzzleRushModeSchema = z.enum(["STORM", "RACER"]);
export type PuzzleRushMode = z.infer<typeof puzzleRushModeSchema>;

/** [combo reached, bonus] — Storm's bonus is seconds, Racer's is points. */
export type ComboLevels = ReadonlyArray<readonly [number, number]>;

export const PUZZLE_STORM_CONFIG = {
  /** Seconds on the clock at the first move. */
  initialSeconds: 3 * 60,
  /** Seconds lost on a wrong move. */
  malusSeconds: 10,
  combo: [
    [0, 0],
    [5, 3],
    [12, 5],
    [20, 7],
    [30, 10]
  ] as ComboLevels
} as const;

export const PUZZLE_RACER_CONFIG = {
  /** Race length once the countdown ends. */
  durationSeconds: 90,
  /** "The race starts in…" after the coach presses Start. */
  countdownSeconds: 10,
  /** Moves a player may skip per race (the combo survives a skip). */
  skips: 1,
  combo: [
    [0, 0],
    [5, 1],
    [12, 2],
    [20, 3],
    [30, 4]
  ] as ComboLevels
} as const;

/**
 * Lichess' Storm/Racer rating ladder (lila `StormSelector`): this many puzzles
 * around each rating, in this order, so a run starts easy and climbs. Puzzles
 * whose rating is still uncertain (deviation above the cap) are left out.
 */
export const PUZZLE_RUSH_RATING_BUCKETS: ReadonlyArray<readonly [rating: number, count: number]> = [
  [1000, 7],
  [1150, 7],
  [1300, 8],
  [1450, 9],
  [1600, 10],
  [1750, 11],
  [1900, 13],
  [2050, 15],
  [2199, 17],
  [2349, 19],
  [2499, 21]
];
export const PUZZLE_RUSH_MAX_RATING_DEVIATION = 85;
export const PUZZLE_RUSH_POOL_SIZE = PUZZLE_RUSH_RATING_BUCKETS.reduce((sum, [, n]) => sum + n, 0);

/** Slack on every server time check (network + a slow phone). */
export const PUZZLE_RUSH_GRACE_SECONDS = 5;

// ── Combo maths (Lichess `ComboBar`) ──

/** Index of the level the combo has reached (0 = none). */
export function comboLevel(levels: ComboLevels, combo: number): number {
  let level = 0;
  levels.forEach(([threshold], index) => {
    if (threshold <= combo) level = index;
  });
  return level;
}

/** Progress (0–100) towards the next level. Past the last level it repeats every 10. */
export function comboPercent(levels: ComboLevels, combo: number): number {
  const level = comboLevel(levels, combo);
  const last = levels.length - 1;
  if (level >= last) {
    const range = levels[last][0] - levels[last - 1][0];
    return (((combo - levels[last][0]) / range) * 100) % 100;
  }
  const lo = levels[level][0];
  const hi = levels[level + 1][0];
  return ((combo - lo) / (hi - lo)) * 100;
}

/** Bonus earned by the move that took the combo to `combo` (0 if it crossed no level). */
export function comboBonus(levels: ComboLevels, combo: number): number {
  if (combo <= 0 || comboPercent(levels, combo) !== 0) return 0;
  return levels[comboLevel(levels, combo)][1];
}

/** The most bonus `moves` correct moves in a row could earn (the server's upper bound). */
export function maxComboBonus(levels: ComboLevels, moves: number): number {
  let total = 0;
  for (let combo = 1; combo <= moves; combo++) total += comboBonus(levels, combo);
  return total;
}

// ── Puzzles ──

/** One catalogue puzzle, as Lichess publishes it: `moves[0]` is the opponent's setup move. */
export type PuzzleRushPuzzle = {
  id: string;
  fen: string;
  /** UCI, setup move first. The player answers moves[1], moves[3], … */
  moves: string[];
  rating: number;
};

/** Moves the player makes in a puzzle (setup and replies excluded). */
export function puzzleRushPlayerMoves(puzzle: Pick<PuzzleRushPuzzle, "moves">): number {
  return Math.floor(puzzle.moves.length / 2);
}

// ── API contract ──

export type PuzzleRushStatus = "COUNTDOWN" | "RUNNING" | "ENDED";

export type PuzzleRushStanding = {
  /** The player's user id — a student, or the class's coach playing along. */
  studentId: string;
  name: string;
  /** The class's coach playing along (labelled, still ranked). */
  isCoach?: boolean;
  /** Storm: puzzles solved. Racer: points (moves + combo bonus). */
  score: number;
  /** Correct moves played. */
  moves: number;
  errors: number;
  solved: number;
  bestCombo: number;
  /** Rating of the hardest puzzle solved, null before the first. */
  highestRating: number | null;
  /** Puzzles finished (solved or failed) — where a refreshed run resumes. */
  puzzleIndex: number;
  skipsUsed: number;
  startedAt: string | null;
  /** Storm: when this player's clock runs out (moves with bonuses / penalties). */
  clockEndsAt: string | null;
  finishedAt: string | null;
  rank: number;
};

export type PuzzleRush = {
  id: string;
  mode: PuzzleRushMode;
  status: PuzzleRushStatus;
  createdAt: string;
  /** Racer: the race start (after the countdown). Storm: when the round opened. */
  startsAt: string;
  /** Racer: the race end. Storm: null — each player's own clock decides. */
  endsAt: string | null;
  endedAt: string | null;
  /** Empty during a Racer countdown — nobody gets a head start. */
  puzzles: PuzzleRushPuzzle[];
  standings: PuzzleRushStanding[];
};

export type PuzzleRushStateResponse = {
  rush: PuzzleRush | null;
  /** ISO server time — clients derive clock skew from it. */
  serverTime: string;
};

export const startPuzzleRushRequestSchema = z.object({ mode: puzzleRushModeSchema });
export type StartPuzzleRushRequest = z.infer<typeof startPuzzleRushRequestSchema>;

const count = z.number().int().min(0).max(10_000);

/** Finished puzzles a report may carry (a run is well under this). */
export const PUZZLE_RUSH_MAX_PLAYED = 300;

/** One finished puzzle: the player's own moves (a Racer skip is marked), in order. */
export const rushPlayedPuzzleSchema = z.object({
  /** Index of the puzzle in the run. */
  i: z.number().int().min(0).max(1000),
  moves: z
    .array(
      z.object({
        uci: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/),
        skipped: z.boolean().optional()
      })
    )
    .max(30),
  solved: z.boolean()
});
export type RushPlayedPuzzle = z.infer<typeof rushPlayedPuzzleSchema>;

/**
 * What the server stores per finished puzzle (`movesJson` on a run / entry):
 * the puzzle's position and the whole line as played from it — the setup
 * move, each move the player tried, and the replies — rebuilt server-side.
 */
export type RushPlayedRecord = {
  i: number;
  puzzleId: string;
  fen: string;
  rating: number;
  solved: boolean;
  line: { uci: string; san: string; by: "SETUP" | "STUDENT" | "SKIP" | "REPLY"; correct: boolean | null }[];
};

export const reportPuzzleRushProgressRequestSchema = z.object({
  rushId: z.string().min(1).max(64),
  score: count,
  moves: count,
  errors: count,
  solved: count,
  bestCombo: count,
  highestRating: z.number().int().min(0).max(4000).nullable(),
  puzzleIndex: count,
  skipsUsed: z.number().int().min(0).max(10),
  /** Storm only: when the player's clock runs out; null before the first move. */
  clockEndsAt: z.string().datetime().nullable(),
  finished: z.boolean(),
  /**
   * The moves the player tried in each puzzle they finished (docs/AI_PLAY_REVIEW.md
   * gap A). Optional: older clients send totals only. The server checks every
   * entry against the run's own puzzles and only ever adds to what it has.
   */
  played: z.array(rushPlayedPuzzleSchema).max(PUZZLE_RUSH_MAX_PLAYED).optional()
});
export type ReportPuzzleRushProgressRequest = z.infer<typeof reportPuzzleRushProgressRequestSchema>;

export type ReportPuzzleRushProgressResponse = { standing: PuzzleRushStanding };

// ── Data-channel message (server-injected) ──

const standingSchema = z.object({
  studentId: z.string(),
  name: z.string(),
  isCoach: z.boolean().optional(),
  score: z.number(),
  moves: z.number(),
  errors: z.number(),
  solved: z.number(),
  bestCombo: z.number(),
  highestRating: z.number().nullable(),
  puzzleIndex: z.number(),
  skipsUsed: z.number(),
  startedAt: z.string().nullable(),
  clockEndsAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  rank: z.number()
});

export const puzzleRushMessageSchema = z.discriminatedUnion("type", [
  /** A round started or ended — refetch. */
  z.object({ type: z.literal("RUSH_CHANGED"), rushId: z.string() }),
  /** One player's totals moved. */
  z.object({ type: z.literal("RUSH_PROGRESS"), rushId: z.string(), standing: standingSchema })
]);
export type PuzzleRushMessage = z.infer<typeof puzzleRushMessageSchema>;

export function encodePuzzleRushMessage(msg: PuzzleRushMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(msg));
}

export function decodePuzzleRushMessage(payload: Uint8Array): PuzzleRushMessage | null {
  try {
    const parsed = puzzleRushMessageSchema.safeParse(JSON.parse(new TextDecoder().decode(payload)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// ── Ranking ──

type Rankable = Pick<PuzzleRushStanding, "score" | "errors" | "moves" | "finishedAt" | "name">;

/** Highest score first; then fewer errors, more moves, and whoever finished first (finished before unfinished). */
export function comparePuzzleRushStandings(a: Rankable, b: Rankable): number {
  return (
    b.score - a.score ||
    a.errors - b.errors ||
    b.moves - a.moves ||
    compareFinishedAt(a.finishedAt, b.finishedAt) ||
    a.name.localeCompare(b.name)
  );
}

function compareFinishedAt(a: string | null | undefined, b: string | null | undefined): number {
  if (a && b) return a.localeCompare(b);
  if (a) return -1;
  if (b) return 1;
  return 0;
}

/** Sorts and numbers the standings; ties on score + errors share a rank. */
export function rankPuzzleRushStandings<T extends Rankable>(rows: readonly T[]): (T & { rank: number })[] {
  const sorted = [...rows].sort(comparePuzzleRushStandings);
  let rank = 0;
  return sorted.map((row, index) => {
    const prev = sorted[index - 1];
    if (!prev || prev.score !== row.score || prev.errors !== row.errors) rank = index + 1;
    return { ...row, rank };
  });
}

// ── Solo play (the student's practice page) ──
// The same modes and numbers as a live-class round, played alone: the run is
// frozen onto a `SoloPuzzleRushRun`, moves are checked in the browser, the
// server clamps the reported totals, and a batch leaderboard ranks each
// student's best finished run.

export const soloRushPeriodSchema = z.enum(["WEEK", "ALL"]);
export type SoloRushPeriod = z.infer<typeof soloRushPeriodSchema>;

export type SoloRushBatch = { id: string; name: string };

export type SoloRushBest = { mode: PuzzleRushMode; score: number; achievedAt: string };

export type SoloRushOverview = {
  /** Batches with training switched on — the leaderboards the student can see. */
  batches: SoloRushBatch[];
  bests: SoloRushBest[];
  enabled: boolean;
  /** Best finished score per mode in the last 7 days (the leaderboard's "this week"); empty if none. */
  weekBests: SoloRushBest[];
};

export type SoloRushRun = {
  id: string;
  mode: PuzzleRushMode;
  /** Racer: the race starts here (after the countdown). Storm: when the run opened. */
  startsAt: string;
  /** Racer: the race ends here. Storm: null — the player's own clock decides. */
  endsAt: string | null;
  puzzles: PuzzleRushPuzzle[];
  /** ISO server time — the browser derives its clock skew from it. */
  serverTime: string;
};

export type ReportSoloRushProgressRequest = Omit<ReportPuzzleRushProgressRequest, "rushId">;
export const reportSoloRushProgressRequestSchema = reportPuzzleRushProgressRequestSchema.omit({ rushId: true });

export type ReportSoloRushProgressResponse = {
  /** The run's best totals so far, after clamping. */
  score: number;
  finished: boolean;
};

export type SoloRushLeaderboardRow = {
  rank: number;
  studentId: string;
  name: string;
  score: number;
  moves: number;
  errors: number;
  bestCombo: number;
  achievedAt: string;
};

export type SoloRushLeaderboard = {
  batchId: string;
  mode: PuzzleRushMode;
  period: SoloRushPeriod;
  rows: SoloRushLeaderboardRow[];
};

// ── Batch Battles (docs/PUZZLE_RUSH_SOLO.md § "Batch Battles") ──
// Batches of one academy compete on the average of their players' best
// finished runs. Which batches take part, and whether other batches see a
// batch's top player's name, is set per batch by an admin or its coach.

/** A batch needs this many players in the period before it gets a rank. */
export const BATCH_BATTLE_MIN_PLAYERS = 3;

/**
 * Whether a batch competes in Batch Battles: the batch's own setting, else
 * automatic — group batches only (a 1:1 or buddy batch is often named after
 * its students, and one or two players can't make a fair average).
 */
export function batchTakesPartInBattles(input: {
  battlesEnabled: boolean | null;
  batchType: BatchType | null;
  studentCount: number;
}): boolean {
  if (input.battlesEnabled !== null) return input.battlesEnabled;
  return resolveBatchType({ batchDefault: input.batchType, studentCount: input.studentCount }).type === "GROUP";
}

export const updateBatchBattleSettingsSchema = z
  .object({
    /** null = automatic (group batches take part). */
    battlesEnabled: z.boolean().nullable().optional(),
    battlesShowNames: z.boolean().optional()
  })
  .strict()
  .refine((value) => value.battlesEnabled !== undefined || value.battlesShowNames !== undefined, {
    message: "Nothing to change."
  });
export type UpdateBatchBattleSettingsRequest = z.infer<typeof updateBatchBattleSettingsSchema>;

export type BatchBattleSettings = {
  batchId: string;
  battlesEnabled: boolean | null;
  battlesShowNames: boolean;
  /** `battlesEnabled` resolved (automatic → group batches). */
  takesPart: boolean;
};

export type SoloRushBatchBattleRow = {
  /** null = not ranked yet (fewer than `minPlayers` players in the period). */
  rank: number | null;
  batchId: string;
  batchName: string;
  /** Students of the batch with a finished run in the period. */
  players: number;
  /** Average of those players' best scores, one decimal. */
  avgScore: number;
  /** "Arjun K." — only for the viewer's own batch or a batch that shows names. */
  topPlayerName: string | null;
  topPlayerScore: number | null;
  isMyBatch: boolean;
};

export type SoloRushMyBattleBatch = {
  batchId: string;
  batchName: string;
  /** false: the batch isn't in Batch Battles (its coach or an admin can turn it on). */
  takesPart: boolean;
  rank: number | null;
  players: number;
  avgScore: number | null;
};

export type SoloRushBatchBattlesLeaderboard = {
  mode: PuzzleRushMode;
  period: SoloRushPeriod;
  minPlayers: number;
  /** The viewer's best finished score in the period (what they add to each batch). */
  myBest: number | null;
  myBatches: SoloRushMyBattleBatch[];
  /** Ranked batches first, then batches still short of `minPlayers`; at most 50. */
  rows: SoloRushBatchBattleRow[];
};

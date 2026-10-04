import { z } from "zod";

import { puzzleDifficultySchema, puzzleTypeSchema } from "./puzzle";
import {
  puzzleLeaderboardOptionsSchema,
  puzzleLeaderboardOverrideSchema,
  puzzleScoringOverrideSchema,
  puzzleScoringSchema,
  type PuzzleLeaderboardOptions,
  type PuzzlePointsBreakdown,
  type PuzzleScoring
} from "./puzzle-scoring";

// ──────────────────────────────────────────────────────────────
// Live-class puzzle assignment — shared contract
// ──────────────────────────────────────────────────────────────
// A coach pushes an existing published Puzzle into a live class; every student
// solves it privately on their own board (server-scored, same SOLVE_LINE engine
// as the puzzle library) and a leaderboard ranks them by score then speed.
//
// The assignment REFERENCES `puzzleId` — it never copies the puzzle. Only
// starting an attempt needs a new endpoint (to stamp `PuzzleAttempt.liveClassId`
// and gate on the assignment); move-save / submit / hint reuse the existing
// `/puzzles/:id/attempts/:attemptId/*` routes unchanged.

// ── Assignment payload (broadcast + REST; solution is never included) ──

export const livePuzzleAssignmentSchema = z.object({
  id: z.string(),
  puzzleId: z.string(),
  title: z.string(),
  topicName: z.string(),
  puzzleType: puzzleTypeSchema,
  difficulty: puzzleDifficultySchema,
  sideToMove: z.enum(["white", "black"]),
  orientation: z.enum(["white", "black"]),
  fen: z.string(),
  solutionLength: z.number().int().min(0),
  /** Kept for older clients: true when `leaderboard.visibility` is LIVE. */
  revealLeaderboard: z.boolean(),
  /** Frozen at share time; the coach can edit it while the puzzle runs. */
  scoring: puzzleScoringSchema,
  leaderboard: puzzleLeaderboardOptionsSchema,
  /** null = untimed. */
  durationSeconds: z.number().int().positive().nullable(),
  startedAt: z.string(),
  /** ISO deadline (`startedAt + durationSeconds`), or null when untimed. */
  endsAt: z.string().nullable()
});
export type LivePuzzleAssignment = z.infer<typeof livePuzzleAssignmentSchema>;

// ── Data-channel message (topic `live_class_puzzle`) ──

/**
 * Topic the API server-injects puzzle lifecycle events on. Lifecycle only — the
 * leaderboard is a polled REST resource, so a dropped packet costs a refresh
 * delay, never correctness. Mirrors `LIVE_CLASS_SETTINGS_TOPIC`.
 */
export const LIVE_CLASS_PUZZLE_TOPIC = "live_class_puzzle";

export const livePuzzleMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PUZZLE_ASSIGNED"), assignment: livePuzzleAssignmentSchema }),
  // The coach edited the running puzzle's points / leaderboard rules.
  z.object({ type: z.literal("PUZZLE_UPDATED"), assignment: livePuzzleAssignmentSchema }),
  z.object({ type: z.literal("PUZZLE_ENDED"), assignmentId: z.string() }),
  // Sent by a student's client right after it submits, so every other client
  // refetches the leaderboard immediately instead of waiting for the poll.
  z.object({ type: z.literal("LEADERBOARD_DIRTY") })
]);
export type LivePuzzleMessage = z.infer<typeof livePuzzleMessageSchema>;

export function encodeLivePuzzle(msg: LivePuzzleMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(msg));
}

export function decodeLivePuzzle(payload: Uint8Array): LivePuzzleMessage | null {
  try {
    const parsed = livePuzzleMessageSchema.safeParse(
      JSON.parse(new TextDecoder().decode(payload))
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// ── Requests ──

export const assignLivePuzzleRequestSchema = z.object({
  puzzleId: z.string().min(1),
  /** null / omitted = untimed. */
  durationSeconds: z.number().int().min(30).max(3600).nullish(),
  /** Legacy switch — `leaderboard.visibility` wins when both are sent. */
  revealLeaderboard: z.boolean().optional(),
  /** On top of the admin default + the puzzle's own override. */
  scoring: puzzleScoringOverrideSchema.optional(),
  leaderboard: puzzleLeaderboardOverrideSchema.optional()
});
export type AssignLivePuzzleRequest = z.infer<typeof assignLivePuzzleRequestSchema>;

/** Coach edits the running puzzle; points are recomputed for everyone. */
export const updateLivePuzzleRequestSchema = z.object({
  scoring: puzzleScoringOverrideSchema.optional(),
  leaderboard: puzzleLeaderboardOverrideSchema.optional()
});
export type UpdateLivePuzzleRequest = z.infer<typeof updateLivePuzzleRequestSchema>;

/** Coach's manual +/- points for one student (added to any earlier adjustment). */
export const adjustLivePuzzlePointsRequestSchema = z.object({
  studentId: z.string().min(1),
  delta: z.number().int().min(-10_000).max(10_000),
  /** Replace the running adjustment with `delta` instead of adding to it. */
  replace: z.boolean().optional()
});
export type AdjustLivePuzzlePointsRequest = z.infer<typeof adjustLivePuzzlePointsRequestSchema>;

/** Coach's manual +/- points on the whole-class leaderboard (same shape as a per-puzzle adjustment). */
export const adjustClassLeaderboardRequestSchema = adjustLivePuzzlePointsRequestSchema;
export type AdjustClassLeaderboardRequest = AdjustLivePuzzlePointsRequest;

// ── Responses ──

export type LivePuzzleStateResponse = {
  assignment: LivePuzzleAssignment | null;
};

export type LivePuzzleLeaderboardEntry = {
  studentId: string;
  studentName: string;
  rank: number;
  /** `breakdown.total` — what the board ranks on when `rankBy` is POINTS. */
  points: number;
  breakdown: PuzzlePointsBreakdown;
  scorePercent: number;
  accuracyPercent: number | null;
  durationSeconds: number;
  hintsUsed: number;
  wrongMoves: number;
  attemptsUsed: number;
  solved: boolean;
  /** True for the row belonging to the requesting student. */
  isSelf: boolean;
};

/** The requesting student's own standing — drives the grid tile and Solve button. */
export type LivePuzzleSelfStatus = {
  attemptsUsed: number;
  /** null = unlimited. */
  attemptsLeft: number | null;
  inProgress: boolean;
  solved: boolean;
  points: number | null;
  rank: number | null;
};

/** A batch-enrolled student with no completed (or, for `notStarted`, no) attempt yet. */
export type LivePuzzleRosterEntry = {
  studentId: string;
  studentName: string;
};

export type LivePuzzleLeaderboardResponse = {
  /**
   * Ranked completed attempts (best per student). When `revealLeaderboard` is
   * false and the caller is a student, this holds only their own row.
   */
  entries: LivePuzzleLeaderboardEntry[];
  /** Distinct students with an in-progress attempt. Kept for backward compat — equals `stillSolving.length`. */
  solvingCount: number;
  /** Full class roster, minus `entries` and `notStarted`. */
  stillSolving: LivePuzzleRosterEntry[];
  /** Full class roster with no attempt row at all for this assignment. */
  notStarted: LivePuzzleRosterEntry[];
  revealLeaderboard: boolean;
  /** The assignment this board is for — the active one, else the most recent. */
  assignmentId: string | null;
  title: string | null;
  active: boolean;
  scoring: PuzzleScoring | null;
  leaderboard: PuzzleLeaderboardOptions | null;
  /** False when a student is only being shown their own row (hidden / after-end / top-N). */
  showingAll: boolean;
  /** Students only. */
  self: LivePuzzleSelfStatus | null;
};

// ── Whole-class leaderboard ──
// Every puzzle shared in the class summed per student, plus the coach's
// class-level adjustment. A student's view only counts puzzles whose own board
// they may see (LIVE, or AFTER_END once ended), so it never leaks a hidden one.

export type ClassLeaderboardEntry = {
  studentId: string;
  studentName: string;
  rank: number;
  /** `puzzlePoints + adjustment`. */
  points: number;
  /** Sum of each counted puzzle's points (its own coach adjustments included). */
  puzzlePoints: number;
  /** The coach's class-level +/- for this student. */
  adjustment: number;
  solvedCount: number;
  attemptedCount: number;
  isSelf: boolean;
};

export type ClassLeaderboardResponse = {
  entries: ClassLeaderboardEntry[];
  /** Puzzles that count toward this view. */
  puzzleCount: number;
  /** Puzzles shared in the class so far, counted or not. */
  totalPuzzleCount: number;
};

// ── Coach live-board view ──
// Coach-only (never sent to students): every enrolled student's current
// position for the active assignment, read from their latest persisted
// attempt (`PuzzleAttempt.movesJson`, saved after every move — see
// `usePuzzleAttempt`). Polled, same as the leaderboard; not broadcast.

export const LIVE_PUZZLE_BOARD_STATUSES = [
  "NOT_STARTED",
  "IN_PROGRESS",
  "SOLVED",
  "FAILED",
  "ABANDONED"
] as const;
export type LivePuzzleBoardStatus = (typeof LIVE_PUZZLE_BOARD_STATUSES)[number];

export type LivePuzzleBoardEntry = {
  studentId: string;
  studentName: string;
  status: LivePuzzleBoardStatus;
  /** Current position; null only when `status` is `NOT_STARTED`. */
  fen: string | null;
  moveCount: number;
  lastMoveSan: string | null;
  /** ISO timestamp of the student's last saved move, or null when `NOT_STARTED`. */
  updatedAt: string | null;
};

export type LivePuzzleBoardsResponse = {
  assignmentId: string | null;
  /** Starting position, for rendering a `NOT_STARTED` tile. */
  puzzleFen: string;
  orientation: "white" | "black";
  boards: LivePuzzleBoardEntry[];
};

import { z } from "zod";

import { puzzleDifficultySchema, puzzleTypeSchema } from "./puzzle";

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
  revealLeaderboard: z.boolean(),
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
  revealLeaderboard: z.boolean().optional()
});
export type AssignLivePuzzleRequest = z.infer<typeof assignLivePuzzleRequestSchema>;

// ── Responses ──

export type LivePuzzleStateResponse = {
  assignment: LivePuzzleAssignment | null;
};

export type LivePuzzleLeaderboardEntry = {
  studentId: string;
  studentName: string;
  rank: number;
  scorePercent: number;
  accuracyPercent: number | null;
  durationSeconds: number;
  hintsUsed: number;
  solved: boolean;
  /** True for the row belonging to the requesting student. */
  isSelf: boolean;
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

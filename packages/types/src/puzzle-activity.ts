import { z } from "zod";
import {
  puzzleDifficultySchema,
  puzzleStatusSchema,
  type PuzzleDifficulty,
  type PuzzleStatus,
  type PuzzleVisibility
} from "./puzzle";

// ──────────────────────────────────────────────────────────────
// Unified Puzzle Library: MCQ and Playout activities.
//
// Chess puzzles stay exactly what they were (`puzzles` + PuzzleAttempt). MCQs
// and Playouts are `library_activities` rows filed in the SAME folder tree
// (`puzzle_topics`), run through the SAME activity queue. See
// docs/PUZZLE_ACTIVITIES.md.
//
// The rules here are pure, so the API and its tests share one definition of
// "goal achieved" and "score". This package has no chess.js: the API replays
// the game and hands these functions the facts about the resulting position.
// ──────────────────────────────────────────────────────────────

export const LIBRARY_ACTIVITY_KINDS = ["MCQ", "PLAYOUT"] as const;
export const libraryActivityKindSchema = z.enum(LIBRARY_ACTIVITY_KINDS);
export type LibraryActivityKind = z.infer<typeof libraryActivityKindSchema>;

/** Everything the library lists: a chess puzzle or one of the new kinds. */
export const LIBRARY_ITEM_KINDS = ["PUZZLE", "MCQ", "PLAYOUT"] as const;
export const libraryItemKindSchema = z.enum(LIBRARY_ITEM_KINDS);
export type LibraryItemKind = z.infer<typeof libraryItemKindSchema>;

export const LIBRARY_ITEM_KIND_LABELS: Record<LibraryItemKind, string> = {
  MCQ: "MCQ",
  PLAYOUT: "Playout",
  PUZZLE: "Chess puzzle"
};

export const MCQ_MIN_OPTIONS = 2;
export const MCQ_MAX_OPTIONS = 6;
export const MCQ_TEXT_MAX = 2000;
export const MCQ_OPTION_TEXT_MAX = 500;
export const ACTIVITY_TIMER_MIN_SECONDS = 10;
export const ACTIVITY_TIMER_MAX_SECONDS = 3600;
export const ACTIVITY_MAX_ATTEMPTS = 10;
/** A submission racing the timer's end is still accepted for this long. */
export const ACTIVITY_SUBMIT_GRACE_SECONDS = 5;
export const MAX_LIBRARY_ACTIVITY_TAGS = 20;
export const MAX_BULK_LIBRARY_ACTIVITIES = 100;
/** Hard stop on one game, whatever the goal: 200 moves each. */
export const PLAYOUT_MAX_PLIES = 400;
export const PLAYOUT_MAX_HINTS = 5;
export const PLAYOUT_MOVETIME_MIN_MS = 100;
export const PLAYOUT_MOVETIME_MAX_MS = 2000;

const fenSchema = z.string().trim().min(10).max(120);
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const imageUrlSchema = z.string().trim().url().max(500).nullable().optional();

// ── MCQ ──

/**
 * ON_SUBMIT       right / wrong straight away; the answer key and explanation
 *                 once the student is right or out of tries
 * ON_ACTIVITY_END nothing until the activity ends (or the coach reveals early)
 * COACH           nothing until the coach presses Reveal
 */
export const MCQ_REVEAL_MODES = ["ON_SUBMIT", "ON_ACTIVITY_END", "COACH"] as const;
export const mcqRevealModeSchema = z.enum(MCQ_REVEAL_MODES);
export type McqRevealMode = z.infer<typeof mcqRevealModeSchema>;

export const MCQ_REVEAL_MODE_LABELS: Record<McqRevealMode, string> = {
  COACH: "When the coach reveals it",
  ON_ACTIVITY_END: "When the activity ends",
  ON_SUBMIT: "Right after submitting"
};

const hasContent = (v: { text?: string | null; imageUrl?: string | null; fen?: string | null }) =>
  !!(v.text?.trim() || v.imageUrl || v.fen);

/** A question or answer can be text, an image, a board from a FEN, or any mix. */
export const mcqQuestionSchema = z
  .object({
    text: optionalText(MCQ_TEXT_MAX),
    imageUrl: imageUrlSchema,
    fen: fenSchema.nullable().optional(),
    orientation: z.enum(["white", "black"]).nullable().optional()
  })
  .refine(hasContent, { message: "Give the question some text, an image or a position." });
export type McqQuestion = z.infer<typeof mcqQuestionSchema>;

export const mcqOptionSchema = z
  .object({
    /** Stable and meaningless: never derived from the option's position or correctness. */
    id: z.string().trim().min(1).max(64),
    text: optionalText(MCQ_OPTION_TEXT_MAX),
    imageUrl: imageUrlSchema,
    fen: fenSchema.nullable().optional(),
    isCorrect: z.boolean()
  })
  .refine(hasContent, { message: "Every option needs text, an image or a position." });
export type McqOption = z.infer<typeof mcqOptionSchema>;

export const mcqConfigSchema = z
  .object({
    question: mcqQuestionSchema,
    options: z.array(mcqOptionSchema).min(MCQ_MIN_OPTIONS).max(MCQ_MAX_OPTIONS),
    allowMultiple: z.boolean().default(false),
    explanation: optionalText(MCQ_TEXT_MAX),
    marks: z.number().int().min(1).max(100).default(1),
    /** Marks lost for a wrong final answer; the score never goes below zero. */
    wrongPenalty: z.number().int().min(0).max(100).default(0),
    timeLimitSeconds: z.number().int().min(ACTIVITY_TIMER_MIN_SECONDS).max(ACTIVITY_TIMER_MAX_SECONDS).nullable().default(null),
    maxAttempts: z.number().int().min(1).max(ACTIVITY_MAX_ATTEMPTS).default(1),
    randomizeOptions: z.boolean().default(false),
    revealMode: mcqRevealModeSchema.default("ON_SUBMIT")
  })
  .superRefine((value, ctx) => {
    const correct = value.options.filter((o) => o.isCorrect).length;
    if (correct === 0) {
      ctx.addIssue({ code: "custom", message: "Mark the correct answer.", path: ["options"] });
    } else if (!value.allowMultiple && correct > 1) {
      ctx.addIssue({ code: "custom", message: "A single-answer question has exactly one correct option.", path: ["options"] });
    }
    const ids = value.options.map((o) => o.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: "custom", message: "Option ids must be unique.", path: ["options"] });
    }
  });
export type McqConfig = z.infer<typeof mcqConfigSchema>;

/** What a student may see of an option — no `isCorrect`. */
export type McqStudentOption = Omit<McqOption, "isCorrect">;

/** The right options, in stored order. */
export function mcqCorrectOptionIds(config: Pick<McqConfig, "options">): string[] {
  return config.options.filter((o) => o.isCorrect).map((o) => o.id);
}

/**
 * Marks for one submission. Multiple-correct questions are all-or-nothing:
 * exactly the right set scores, so ticking every box never earns part marks.
 */
export function scoreMcqSelection(
  config: Pick<McqConfig, "options" | "marks" | "wrongPenalty">,
  selectedOptionIds: readonly string[]
): { correct: boolean; score: number; maxScore: number; correctOptionIds: string[] } {
  const correctOptionIds = mcqCorrectOptionIds(config);
  const right = new Set(correctOptionIds);
  const picked = new Set(selectedOptionIds);
  const correct = picked.size === right.size && [...picked].every((id) => right.has(id));
  return {
    correct,
    correctOptionIds,
    maxScore: config.marks,
    // Never negative: the penalty can cost a student their marks, not put them in debt.
    score: correct ? config.marks : 0
  };
}

/** The mark a student ends with: the best try, less the penalty when no try was right. */
export function mcqFinalScore(
  config: Pick<McqConfig, "marks" | "wrongPenalty">,
  attempts: readonly { correct: boolean; score: number }[]
): number {
  if (attempts.length === 0) return 0;
  const best = Math.max(...attempts.map((a) => a.score));
  return attempts.some((a) => a.correct) ? best : Math.max(0, best - config.wrongPenalty);
}

/** A stable per-student shuffle (FNV-1a seed, Fisher–Yates): a refresh never reorders the answers. */
export function shuffleForStudent<T>(items: readonly T[], seed: string): T[] {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    hash = (Math.imul(hash, 1664525) + 1013904223) >>> 0;
    const j = hash % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** May this student see the key yet? `finished` = they got it right or are out of tries. */
export function mcqKeyVisible(
  revealMode: McqRevealMode,
  run: { revealedAt: string | Date | null },
  finished: boolean
): boolean {
  if (run.revealedAt) return true;
  return revealMode === "ON_SUBMIT" && finished;
}

/** May this student see right / wrong on a try yet? */
export function mcqVerdictVisible(revealMode: McqRevealMode, run: { revealedAt: string | Date | null }): boolean {
  return !!run.revealedAt || revealMode === "ON_SUBMIT";
}

// ── Playout ──

const fenPlacementSchema = z
  .string()
  .trim()
  .regex(/^[pnbrqkPNBRQK1-8]+(\/[pnbrqkPNBRQK1-8]+){7}$/, "Not a FEN piece placement.");
const squareSchema = z.string().regex(/^[a-h][1-8]$/, "Not a square.");
const sideSchema = z.enum(["white", "black"]);
export type PlayoutColor = z.infer<typeof sideSchema>;

export const PLAYOUT_GOAL_TYPES = [
  "CHECKMATE",
  "DRAW",
  "PROMOTE",
  "REACH_POSITION",
  "MATERIAL_ADVANTAGE",
  "PIECES_ON_SQUARES"
] as const;
export type PlayoutGoalType = (typeof PLAYOUT_GOAL_TYPES)[number];

export const PLAYOUT_GOAL_TYPE_LABELS: Record<PlayoutGoalType, string> = {
  CHECKMATE: "Checkmate the opponent",
  DRAW: "Achieve a draw",
  MATERIAL_ADVANTAGE: "Win a material advantage",
  PIECES_ON_SQUARES: "Endgame objective (pieces on squares)",
  PROMOTE: "Promote a pawn",
  REACH_POSITION: "Reach a specific position"
};

export const playoutGoalSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("CHECKMATE") }),
  z.object({ type: z.literal("DRAW") }),
  z.object({ type: z.literal("PROMOTE"), piece: z.enum(["q", "r", "b", "n"]).nullable().optional() }),
  z.object({
    type: z.literal("REACH_POSITION"),
    placement: fenPlacementSchema,
    sideToMove: sideSchema.nullable().optional()
  }),
  z.object({ type: z.literal("MATERIAL_ADVANTAGE"), points: z.number().int().min(1).max(39) }),
  z.object({
    type: z.literal("PIECES_ON_SQUARES"),
    /** Every listed piece on its square at once, e.g. Ke6 + ke8 with Black to move (the opposition). */
    placements: z
      .array(z.object({ piece: z.string().regex(/^[pnbrqkPNBRQK]$/), square: squareSchema }))
      .min(1)
      .max(8),
    sideToMove: sideSchema.nullable().optional()
  })
]);
export type PlayoutGoal = z.infer<typeof playoutGoalSchema>;

export const PLAYOUT_LOCKABLE_PIECES = ["p", "n", "b", "r", "q", "k"] as const;

export const playoutConfigSchema = z.object({
  startFen: fenSchema,
  studentColor: sideSchema,
  goal: playoutGoalSchema,
  /** Shown instead of the generated wording, e.g. "Mate with king and rook". */
  goalDescription: optionalText(300),
  engine: z
    .object({
      /** Stockfish `Skill Level`, 0–20. */
      skillLevel: z.number().int().min(0).max(20).default(5),
      movetimeMs: z.number().int().min(PLAYOUT_MOVETIME_MIN_MS).max(PLAYOUT_MOVETIME_MAX_MS).default(500)
    })
    .default({ movetimeMs: 500, skillLevel: 5 }),
  timeLimitSeconds: z.number().int().min(ACTIVITY_TIMER_MIN_SECONDS).max(ACTIVITY_TIMER_MAX_SECONDS).nullable().default(null),
  maxAttempts: z.number().int().min(1).max(ACTIVITY_MAX_ATTEMPTS).default(3),
  hints: z.array(z.string().trim().min(1).max(300)).max(PLAYOUT_MAX_HINTS).default([]),
  scoring: z
    .object({
      goalPoints: z.number().int().min(0).max(1000).default(10),
      /** Points when the game was drawn but the goal was something else. */
      drawPoints: z.number().int().min(0).max(1000).default(0),
      hintPenalty: z.number().int().min(0).max(100).default(1),
      /** Points off for each try after the first. */
      retryPenalty: z.number().int().min(0).max(100).default(0),
      /** Reach the goal in at most this many of your own moves for the bonus. */
      parMoves: z.number().int().min(1).max(200).nullable().default(null),
      parBonus: z.number().int().min(0).max(100).default(0)
    })
    .default({ drawPoints: 0, goalPoints: 10, hintPenalty: 1, parBonus: 0, parMoves: null, retryPenalty: 0 }),
  restrictions: z
    .object({
      /** The student loses the game on going past this many of their own moves. */
      maxStudentMoves: z.number().int().min(1).max(200).nullable().default(null),
      /** Piece types the student may not move. */
      lockedPieces: z.array(z.enum(PLAYOUT_LOCKABLE_PIECES)).max(5).default([])
    })
    .default({ lockedPieces: [], maxStudentMoves: null })
});
export type PlayoutConfig = z.infer<typeof playoutConfigSchema>;

export const PLAYOUT_ENGINE_PRESETS = [
  { label: "Gentle", skillLevel: 1 },
  { label: "Casual", skillLevel: 5 },
  { label: "Club", skillLevel: 10 },
  { label: "Strong", skillLevel: 15 },
  { label: "Maximum", skillLevel: 20 }
] as const;

/** The engine's strength, in the admin's words. */
export function playoutEngineLabel(skillLevel: number): string {
  const preset = PLAYOUT_ENGINE_PRESETS.find((p) => p.skillLevel === skillLevel);
  return preset ? `${preset.label} (level ${skillLevel})` : `Level ${skillLevel}`;
}

const PIECE_NAMES: Record<string, string> = { b: "bishop", k: "king", n: "knight", p: "pawn", q: "queen", r: "rook" };

/** The goal in plain words. */
export function describePlayoutGoal(goal: PlayoutGoal): string {
  switch (goal.type) {
    case "CHECKMATE":
      return "Checkmate the computer.";
    case "DRAW":
      return "Hold the game to a draw.";
    case "PROMOTE":
      return goal.piece ? `Promote a pawn to a ${PIECE_NAMES[goal.piece]}.` : "Promote a pawn.";
    case "REACH_POSITION":
      return "Reach the target position.";
    case "MATERIAL_ADVANTAGE":
      return `Get ahead by ${goal.points} ${goal.points === 1 ? "point" : "points"} of material.`;
    case "PIECES_ON_SQUARES":
      return `Get ${goal.placements
        .map((p) => `the ${p.piece === p.piece.toUpperCase() ? "white" : "black"} ${PIECE_NAMES[p.piece.toLowerCase()]} to ${p.square}`)
        .join(" and ")}.`;
  }
}

const PIECE_POINTS: Record<string, number> = { b: 3, k: 0, n: 3, p: 1, q: 9, r: 5 };

/** Material on the board, counted from a FEN placement. */
export function materialFromPlacement(placement: string): { white: number; black: number } {
  let white = 0;
  let black = 0;
  for (const ch of placement) {
    const value = PIECE_POINTS[ch.toLowerCase()];
    if (value === undefined) continue;
    if (ch === ch.toUpperCase()) white += value;
    else black += value;
  }
  return { black, white };
}

/** The piece letter on a square of a FEN placement, or null when it is empty. */
export function pieceOnSquare(placement: string, square: string): string | null {
  const rows = placement.split("/");
  const row = rows[8 - Number(square[1])];
  if (!row) return null;
  const file = square.charCodeAt(0) - 97;
  let col = 0;
  for (const ch of row) {
    if (/\d/.test(ch)) {
      col += Number(ch);
    } else {
      if (col === file) return ch;
      col += 1;
    }
    if (col > file) return null;
  }
  return null;
}

/** What the API read off the position after a move. */
export type PlayoutFacts = {
  placement: string;
  turn: PlayoutColor;
  studentColor: PlayoutColor;
  /** Who played the move that produced this position (null before the first move). */
  lastMover: "STUDENT" | "COMPUTER" | null;
  isCheckmate: boolean;
  isStalemate: boolean;
  /** Threefold repetition, the fifty-move rule or insufficient material. */
  isOtherDraw: boolean;
  /** Pieces the student has promoted to in this game. */
  promotions: readonly string[];
};

/**
 * Has the goal been met? Decided only from the position and the game's events,
 * never from a move count. A checkmate goal needs a real mate given by the
 * student; a draw goal a real draw on the board.
 */
export function isPlayoutGoalMet(goal: PlayoutGoal, facts: PlayoutFacts): boolean {
  const studentMated = facts.isCheckmate && facts.lastMover === "COMPUTER";
  if (studentMated) return false;
  switch (goal.type) {
    case "CHECKMATE":
      return facts.isCheckmate && facts.lastMover === "STUDENT";
    case "DRAW":
      return facts.isStalemate || facts.isOtherDraw;
    case "PROMOTE":
      return goal.piece ? facts.promotions.includes(goal.piece) : facts.promotions.length > 0;
    case "REACH_POSITION":
      return facts.placement === goal.placement && (!goal.sideToMove || goal.sideToMove === facts.turn);
    case "MATERIAL_ADVANTAGE": {
      const material = materialFromPlacement(facts.placement);
      const ahead = facts.studentColor === "white" ? material.white - material.black : material.black - material.white;
      return ahead >= goal.points;
    }
    case "PIECES_ON_SQUARES":
      return (
        goal.placements.every((p) => pieceOnSquare(facts.placement, p.square) === p.piece) &&
        (!goal.sideToMove || goal.sideToMove === facts.turn)
      );
  }
}

/** One short line for the student and the coach's card, e.g. "Material +2 of +5". */
export function playoutGoalProgress(goal: PlayoutGoal, facts: PlayoutFacts): string | null {
  switch (goal.type) {
    case "MATERIAL_ADVANTAGE": {
      const material = materialFromPlacement(facts.placement);
      const ahead = facts.studentColor === "white" ? material.white - material.black : material.black - material.white;
      return `Material ${ahead >= 0 ? "+" : ""}${ahead} of +${goal.points}`;
    }
    case "PIECES_ON_SQUARES": {
      const placed = goal.placements.filter((p) => pieceOnSquare(facts.placement, p.square) === p.piece).length;
      return `${placed} of ${goal.placements.length} in place`;
    }
    case "PROMOTE":
      return facts.promotions.length > 0 ? `Promoted to ${facts.promotions.map((p) => PIECE_NAMES[p]).join(", ")}` : "No promotion yet";
    default:
      return null;
  }
}

export const playoutGameStatusSchema = z.enum(["IN_PROGRESS", "COMPLETED", "ABANDONED"]);
export type PlayoutGameStatus = z.infer<typeof playoutGameStatusSchema>;

/** NONE: the goal or the clock ended the game before the board did. */
export const playoutResultSchema = z.enum(["WIN", "LOSS", "DRAW", "NONE"]);
export type PlayoutResult = z.infer<typeof playoutResultSchema>;

export const PLAYOUT_RESULT_LABELS: Record<PlayoutResult, string> = {
  DRAW: "Draw",
  LOSS: "Loss",
  NONE: "Game not finished",
  WIN: "Win"
};

export const playoutEndReasonSchema = z.enum([
  "GOAL_ACHIEVED",
  "CHECKMATE",
  "STALEMATE",
  "DRAW",
  "TIME_UP",
  "MOVE_LIMIT",
  "RESIGNED",
  "RETRIED",
  "ACTIVITY_ENDED"
]);
export type PlayoutEndReason = z.infer<typeof playoutEndReasonSchema>;

export const PLAYOUT_END_REASON_LABELS: Record<PlayoutEndReason, string> = {
  ACTIVITY_ENDED: "The activity ended",
  CHECKMATE: "Checkmate",
  DRAW: "Draw",
  GOAL_ACHIEVED: "Goal achieved",
  MOVE_LIMIT: "Move limit reached",
  RESIGNED: "Gave up",
  RETRIED: "Restarted",
  STALEMATE: "Stalemate",
  TIME_UP: "Time's up"
};

export type PlayoutOutcome = {
  endReason: PlayoutEndReason;
  result: PlayoutResult;
  goalAchieved: boolean;
};

/** Is the game over after this position, and how? null = keep playing. */
export function decidePlayoutOutcome(goal: PlayoutGoal, facts: PlayoutFacts): PlayoutOutcome | null {
  const goalAchieved = isPlayoutGoalMet(goal, facts);
  if (facts.isCheckmate) {
    return {
      endReason: goalAchieved ? "GOAL_ACHIEVED" : "CHECKMATE",
      goalAchieved,
      result: facts.lastMover === "STUDENT" ? "WIN" : "LOSS"
    };
  }
  if (facts.isStalemate || facts.isOtherDraw) {
    return {
      endReason: goalAchieved ? "GOAL_ACHIEVED" : facts.isStalemate ? "STALEMATE" : "DRAW",
      goalAchieved,
      result: "DRAW"
    };
  }
  return goalAchieved ? { endReason: "GOAL_ACHIEVED", goalAchieved: true, result: "NONE" } : null;
}

/** The most this activity can award, for "7 / 10". */
export function playoutMaxScore(scoring: PlayoutConfig["scoring"]): number {
  return scoring.goalPoints + (scoring.parMoves ? scoring.parBonus : 0);
}

export function scorePlayout(
  scoring: PlayoutConfig["scoring"],
  game: { goalAchieved: boolean; result: PlayoutResult; hintsUsed: number; attemptNumber: number; studentMoves: number }
): number {
  let score = 0;
  if (game.goalAchieved) {
    score = scoring.goalPoints;
    if (scoring.parMoves && game.studentMoves <= scoring.parMoves) score += scoring.parBonus;
  } else if (game.result === "DRAW") {
    score = scoring.drawPoints;
  }
  if (score === 0) return 0;
  const penalties = game.hintsUsed * scoring.hintPenalty + (game.attemptNumber - 1) * scoring.retryPenalty;
  return Math.max(0, score - penalties);
}

// ── Library: requests ──

const tagsSchema = z.array(z.string().trim().min(1).max(40)).max(MAX_LIBRARY_ACTIVITY_TAGS);

const activityFieldsShape = {
  topicId: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1, "Give it a title.").max(200),
  description: optionalText(2000),
  difficulty: puzzleDifficultySchema,
  /** Free-text subject ("Endgames", "Notation"); the folder is where it is filed. */
  topic: optionalText(80),
  tags: tagsSchema.default([]),
  thumbnailUrl: imageUrlSchema,
  status: puzzleStatusSchema.optional()
};

export const createLibraryActivityRequestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("MCQ"), ...activityFieldsShape, config: mcqConfigSchema }),
  z.object({ kind: z.literal("PLAYOUT"), ...activityFieldsShape, config: playoutConfigSchema })
]);
export type CreateLibraryActivityRequest = z.infer<typeof createLibraryActivityRequestSchema>;

/** Every field but the kind; `config` is checked against the row's own kind. */
export const updateLibraryActivityRequestSchema = z.object({
  topicId: activityFieldsShape.topicId.optional(),
  title: activityFieldsShape.title.optional(),
  description: activityFieldsShape.description,
  difficulty: puzzleDifficultySchema.optional(),
  topic: activityFieldsShape.topic,
  tags: tagsSchema.optional(),
  thumbnailUrl: activityFieldsShape.thumbnailUrl,
  status: puzzleStatusSchema.optional(),
  config: z.unknown().optional()
});
export type UpdateLibraryActivityRequest = z.infer<typeof updateLibraryActivityRequestSchema>;

export const LIBRARY_ACTIVITY_BULK_ACTIONS = ["PUBLISH", "ARCHIVE", "DELETE", "MOVE"] as const;
export const bulkLibraryActivityRequestSchema = z
  .object({
    ids: z.array(z.string().trim().min(1).max(64)).min(1).max(MAX_BULK_LIBRARY_ACTIVITIES),
    action: z.enum(LIBRARY_ACTIVITY_BULK_ACTIONS),
    topicId: z.string().trim().min(1).max(64).optional()
  })
  .refine((v) => v.action !== "MOVE" || !!v.topicId, { message: "Pick a folder to move them to.", path: ["topicId"] });
export type BulkLibraryActivityRequest = z.infer<typeof bulkLibraryActivityRequestSchema>;

export const LIBRARY_LIST_MAX_PAGE_SIZE = 100;

export const libraryListQuerySchema = z.object({
  kind: libraryItemKindSchema.optional(),
  topicId: z.string().trim().min(1).max(64).optional(),
  topicScope: z.enum(["direct", "subtree"]).optional(),
  difficulty: puzzleDifficultySchema.optional(),
  status: puzzleStatusSchema.optional(),
  /** An activity's subject, a puzzle's type or either's tag. */
  topic: z.string().trim().min(1).max(80).optional(),
  search: z.string().trim().max(100).optional(),
  sort: z.enum(["title", "createdAt", "updatedAt"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().min(1).max(100_000).optional(),
  pageSize: z.coerce.number().int().min(1).max(LIBRARY_LIST_MAX_PAGE_SIZE).optional()
});
export type LibraryListQuery = z.infer<typeof libraryListQuerySchema>;

// ── Library: responses ──

/** One row of the unified library. Never carries an answer key or solution. */
export type LibraryItemSummary = {
  kind: LibraryItemKind;
  id: string;
  title: string;
  description: string | null;
  difficulty: PuzzleDifficulty;
  topicId: string;
  topicName: string;
  /** Activity subject / puzzle type. */
  topic: string | null;
  tags: string[];
  status: PuzzleStatus;
  visibility: PuzzleVisibility;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  /** A position to draw as the thumbnail, when there is one. */
  previewFen: string | null;
  thumbnailUrl: string | null;
};

export type LibraryListResponse = {
  items: LibraryItemSummary[];
  /** Subjects to offer in the Topic filter. */
  topics: string[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

export type LibraryActivityDto = Omit<LibraryItemSummary, "kind"> & {
  kind: LibraryActivityKind;
  /** Staff only: this holds the answer key. */
  config: McqConfig | PlayoutConfig;
  canManage: boolean;
  publishedAt: string | null;
  archivedAt: string | null;
};

export type LibraryActivityResponse = { activity: LibraryActivityDto };

export type BulkLibraryActivityResponse = {
  done: string[];
  skipped: { id: string; reason: string }[];
};

// ── Running in a class ──

export const LIVE_CLASS_ACTIVITY_RUN_TOPIC = "activity_run";

export const activityRunStatusSchema = z.enum(["ACTIVE", "ENDED"]);
export type ActivityRunStatus = z.infer<typeof activityRunStatusSchema>;

export type ActivityRunSummary = {
  id: string;
  classId: string;
  kind: LibraryActivityKind;
  title: string;
  description: string | null;
  status: ActivityRunStatus;
  startedAt: string;
  endedAt: string | null;
  /** MCQ with a timer: when submissions close, for the whole class. */
  endsAt: string | null;
  revealedAt: string | null;
};

export type McqAttemptView = {
  attemptNumber: number;
  selectedOptionIds: string[];
  submittedAt: string;
  /** null until the student may know. */
  correct: boolean | null;
  score: number | null;
};

export type StudentMcqState = {
  question: McqQuestion;
  /** In this student's own (stable) order, with no `isCorrect`. */
  options: McqStudentOption[];
  allowMultiple: boolean;
  marks: number;
  maxAttempts: number;
  revealMode: McqRevealMode;
  attempts: McqAttemptView[];
  canSubmit: boolean;
  /** null until the key may be shown. */
  correctOptionIds: string[] | null;
  explanation: string | null;
  /** null until the student may know. */
  finalScore: number | null;
};

export type PlayoutMoveView = {
  ply: number;
  by: "STUDENT" | "COMPUTER";
  san: string;
  uci: string;
};

export type PlayoutGameView = {
  id: string;
  runId: string;
  attemptNumber: number;
  studentColor: PlayoutColor;
  startFen: string;
  fen: string;
  ply: number;
  turn: "STUDENT" | "COMPUTER";
  moves: PlayoutMoveView[];
  pgn: string;
  status: PlayoutGameStatus;
  endReason: PlayoutEndReason | null;
  result: PlayoutResult | null;
  goalAchieved: boolean;
  /** The hints asked for so far. */
  hints: string[];
  hintsUsed: number;
  score: number | null;
  maxScore: number;
  studentMoves: number;
  progress: string | null;
  startedAt: string;
  finishedAt: string | null;
  /** This student's own clock, when the activity has a timer. */
  endsAt: string | null;
  durationSeconds: number;
};

/** The admin's activity as a student sees it: goal and rules, never engine internals beyond its strength. */
export type StudentPlayoutState = {
  goalText: string;
  startFen: string;
  studentColor: PlayoutColor;
  computerLabel: string;
  timeLimitSeconds: number | null;
  maxAttempts: number;
  attemptsUsed: number;
  canRetry: boolean;
  hintsAvailable: number;
  maxStudentMoves: number | null;
  lockedPieces: string[];
  game: PlayoutGameView | null;
};

export type ActivityRunStateResponse = {
  run: ActivityRunSummary | null;
  serverTime: string;
  mcq: StudentMcqState | null;
  playout: StudentPlayoutState | null;
};

export const submitMcqAnswerRequestSchema = z.object({
  selectedOptionIds: z.array(z.string().trim().min(1).max(64)).min(1).max(MCQ_MAX_OPTIONS),
  /** The try this is (1-based). A retried request with the same number returns the stored answer. */
  attemptNumber: z.number().int().min(1).max(ACTIVITY_MAX_ATTEMPTS)
});
export type SubmitMcqAnswerRequest = z.infer<typeof submitMcqAnswerRequestSchema>;

export const playoutMoveRequestSchema = z.object({
  uci: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/, "Not a UCI move."),
  /** The ply the student saw. A stale one is a 409; a repeat of the same move returns the game. */
  ply: z.number().int().min(0).max(PLAYOUT_MAX_PLIES)
});
export type PlayoutMoveRequest = z.infer<typeof playoutMoveRequestSchema>;

export type PlayoutGameResponse = {
  game: PlayoutGameView;
  serverTime: string;
  /** True when the computer owes a move it couldn't make yet: ask `playoutContinue` shortly. */
  engineRetry: boolean;
  canRetry: boolean;
  attemptsUsed: number;
};

export type McqAnswerResponse = { mcq: StudentMcqState; serverTime: string };

// ── Monitoring (coach-owner / admin; every route is read-only) ──

export type PlayoutMonitorEntryStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";

export type PlayoutMonitorEntry = {
  studentId: string;
  studentName: string;
  status: PlayoutMonitorEntryStatus;
  gameId: string | null;
  fen: string | null;
  ply: number;
  turn: "STUDENT" | "COMPUTER" | null;
  lastMoveUci: string | null;
  lastMoveSan: string | null;
  studentMoves: number;
  attemptNumber: number;
  goalAchieved: boolean;
  result: PlayoutResult | null;
  endReason: PlayoutEndReason | null;
  progress: string | null;
  score: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  endsAt: string | null;
};

export type PlayoutMonitorResponse = {
  kind: "PLAYOUT";
  run: ActivityRunSummary;
  goalText: string;
  startFen: string;
  studentColor: PlayoutColor;
  computerLabel: string;
  maxScore: number;
  entries: PlayoutMonitorEntry[];
  serverTime: string;
};

export type McqMonitorStudent = {
  studentId: string;
  studentName: string;
  status: "PENDING" | "ANSWERED";
  attempts: number;
  selectedOptionIds: string[];
  correct: boolean | null;
  score: number | null;
  submittedAt: string | null;
  durationSeconds: number | null;
};

export type McqMonitorResponse = {
  kind: "MCQ";
  run: ActivityRunSummary;
  question: McqQuestion;
  /** Counts per option; `isCorrect` only once revealed, so a shared screen can't give it away. */
  options: (McqStudentOption & { count: number; isCorrect: boolean | null })[];
  allowMultiple: boolean;
  marks: number;
  revealMode: McqRevealMode;
  totals: {
    students: number;
    answered: number;
    pending: number;
    correct: number;
    incorrect: number;
    /** null with no answers yet. */
    accuracyPercent: number | null;
  };
  students: McqMonitorStudent[];
  serverTime: string;
};

export type ActivityRunMonitorResponse = PlayoutMonitorResponse | McqMonitorResponse;

/** One student's game, opened from the gallery. Read-only by construction: this is a GET. */
export type PlayoutGameDetailResponse = {
  studentName: string;
  game: PlayoutGameView;
  computerLabel: string;
  goalText: string;
};

// ── Data-channel messages ──

/**
 * Lifecycle nudges go to the whole room and carry no game data. Game updates go
 * only to the class's managers (`destinationIdentities`), so one student's board
 * is never on another student's wire. Receivers drop any packet with a `from`:
 * only the API sends on this topic.
 */
export const activityRunMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("RUN_CHANGED"), runId: z.string() }),
  z.object({ type: z.literal("MCQ_ANSWERED"), runId: z.string() }),
  z.object({
    type: z.literal("PLAYOUT_UPDATE"),
    runId: z.string(),
    entry: z.object({
      studentId: z.string(),
      gameId: z.string(),
      fen: z.string(),
      ply: z.number(),
      turn: z.enum(["STUDENT", "COMPUTER"]),
      lastMoveUci: z.string().nullable(),
      lastMoveSan: z.string().nullable(),
      studentMoves: z.number(),
      attemptNumber: z.number(),
      status: playoutGameStatusSchema,
      goalAchieved: z.boolean(),
      result: playoutResultSchema.nullable(),
      endReason: playoutEndReasonSchema.nullable(),
      progress: z.string().nullable(),
      score: z.number().nullable(),
      startedAt: z.string(),
      finishedAt: z.string().nullable(),
      endsAt: z.string().nullable()
    })
  })
]);
export type ActivityRunMessage = z.infer<typeof activityRunMessageSchema>;
export type PlayoutMonitorUpdate = Extract<ActivityRunMessage, { type: "PLAYOUT_UPDATE" }>["entry"];

export function encodeActivityRunMessage(message: ActivityRunMessage): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(message));
}

export function decodeActivityRunMessage(payload: Uint8Array): ActivityRunMessage | null {
  try {
    const parsed = activityRunMessageSchema.safeParse(JSON.parse(new TextDecoder().decode(payload)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Merge a packet into the coach's gallery. A copy older than what is held (a
 * lower attempt, or a lower ply in the same attempt) is ignored, so a late
 * packet never rewinds a board. A finished game never reopens from an older copy.
 */
export function mergePlayoutMonitorEntry(current: PlayoutMonitorEntry, update: PlayoutMonitorUpdate): PlayoutMonitorEntry {
  if (update.attemptNumber < current.attemptNumber) return current;
  if (update.attemptNumber === current.attemptNumber) {
    if (update.ply < current.ply) return current;
    if (current.status === "COMPLETED" && update.status === "IN_PROGRESS") return current;
  }
  return {
    ...current,
    attemptNumber: update.attemptNumber,
    endReason: update.endReason,
    endsAt: update.endsAt,
    fen: update.fen,
    finishedAt: update.finishedAt,
    gameId: update.gameId,
    goalAchieved: update.goalAchieved,
    lastMoveSan: update.lastMoveSan,
    lastMoveUci: update.lastMoveUci,
    ply: update.ply,
    progress: update.progress,
    result: update.result,
    score: update.score,
    startedAt: update.startedAt,
    status: update.status === "IN_PROGRESS" ? "IN_PROGRESS" : "COMPLETED",
    studentMoves: update.studentMoves,
    turn: update.turn
  };
}

import { z } from "zod";
import {
  puzzleScoringOverrideSchema,
  type PuzzleScoringOverride
} from "./puzzle-scoring";

import {
  attemptMoveSchema,
  chessColorSchema,
  solutionMoveSchema,
  type AttemptMove,
  type AttemptReviewMove,
  type PaginationMeta,
  type SolutionMove,
  type SolveLineHint,
  type SolveLineMoveFeedback,
  type UserRole
} from "./index";

// ──────────────────────────────────────────────────────────────
// Puzzle library — shared contract
// ──────────────────────────────────────────────────────────────
// A puzzle is a reusable chess-training object: position + solution line + topic
// + type + difficulty + ownership + lifecycle. Admin-authored puzzles are GLOBAL
// (every coach sees them); coach-authored puzzles are PRIVATE (author + admins).
// The same puzzle is referenced by a LiveClassPuzzleAssignment (see
// ./live-class-puzzle) — never copied. Server-side move evaluation reuses the
// assignment SOLVE_LINE engine.

export const puzzleTypeSchema = z.enum([
  "TACTICAL",
  "CHECKMATE",
  "BEST_MOVE",
  "CALCULATION",
  "ENDGAME",
  "OPENING",
  "CUSTOM"
]);
export type PuzzleType = z.infer<typeof puzzleTypeSchema>;

export const puzzleDifficultySchema = z.enum([
  "BEGINNER",
  "EASY",
  "INTERMEDIATE",
  "ADVANCED",
  "EXPERT"
]);
export type PuzzleDifficulty = z.infer<typeof puzzleDifficultySchema>;

export const puzzleStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
export type PuzzleStatus = z.infer<typeof puzzleStatusSchema>;

export const puzzleVisibilitySchema = z.enum(["GLOBAL", "PRIVATE"]);
export type PuzzleVisibility = z.infer<typeof puzzleVisibilitySchema>;

export const puzzleAttemptStatusSchema = z.enum([
  "IN_PROGRESS",
  "SOLVED",
  "FAILED",
  "ABANDONED"
]);
export type PuzzleAttemptStatus = z.infer<typeof puzzleAttemptStatusSchema>;

export const MAX_PUZZLE_SOLUTION_MOVES = 60;
export const MAX_PUZZLE_HINTS = 5;
export const MAX_PUZZLE_TAGS = 12;
export const MAX_PUZZLE_FEN_LENGTH = 120;

// ── Topics (admin-authored) ──

/** Deepest folder level allowed (a root folder is level 1). */
export const MAX_PUZZLE_TOPIC_DEPTH = 6;

export const createPuzzleTopicRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  icon: z.string().trim().max(40).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  parentId: z.string().min(1).nullable().optional()
});
export type CreatePuzzleTopicRequest = z.infer<typeof createPuzzleTopicRequestSchema>;

export const updatePuzzleTopicRequestSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  icon: z.string().trim().max(40).nullable().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  /** Move the folder: another folder's id, or null for the top level. */
  parentId: z.string().min(1).nullable().optional()
});
export type UpdatePuzzleTopicRequest = z.infer<typeof updatePuzzleTopicRequestSchema>;

export const reassignPuzzleTopicRequestSchema = z.object({
  toTopicId: z.string().min(1)
});
export type ReassignPuzzleTopicRequest = z.infer<typeof reassignPuzzleTopicRequestSchema>;

export type PuzzleTopicDto = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  sortOrder: number;
  parentId: string | null;
  /** Puzzles filed directly in this folder (subfolders not included). */
  puzzleCount: number;
  createdByName: string | null;
  canManage: boolean;
  createdAt: string;
  updatedAt: string;
};
export type PuzzleTopicListResponse = { topics: PuzzleTopicDto[] };
export type PuzzleTopicResponse = { topic: PuzzleTopicDto };

// ── Topic tree helpers (shared by the API and every folder picker) ──

type TopicNodeInput = { id: string; parentId: string | null };

export type PuzzleTopicTreeNode<T extends TopicNodeInput = PuzzleTopicDto> = {
  topic: T;
  depth: number;
  children: PuzzleTopicTreeNode<T>[];
  /** Puzzles in this folder and every subfolder (needs `puzzleCount`). */
  totalPuzzleCount: number;
};

/**
 * Build the folder tree from a flat list. A topic whose parent is missing
 * (e.g. archived on its own) is shown at the top level rather than lost.
 * Input order is kept among siblings.
 */
export function buildPuzzleTopicTree<T extends TopicNodeInput & { puzzleCount?: number }>(
  topics: T[]
): PuzzleTopicTreeNode<T>[] {
  const ids = new Set(topics.map((t) => t.id));
  const byParent = new Map<string | null, T[]>();
  for (const topic of topics) {
    const key = topic.parentId && ids.has(topic.parentId) ? topic.parentId : null;
    const list = byParent.get(key) ?? [];
    list.push(topic);
    byParent.set(key, list);
  }
  // A parent cycle is never reachable from a root, so this always terminates.
  const build = (parentId: string | null, depth: number): PuzzleTopicTreeNode<T>[] =>
    (byParent.get(parentId) ?? []).map((topic) => {
      const children = build(topic.id, depth + 1);
      return {
        topic,
        depth,
        children,
        totalPuzzleCount:
          (topic.puzzleCount ?? 0) + children.reduce((sum, c) => sum + c.totalPuzzleCount, 0)
      };
    });
  return build(null, 0);
}

/** Depth-first flattening of a tree, parents before children. */
export function flattenPuzzleTopicTree<T extends TopicNodeInput>(
  nodes: PuzzleTopicTreeNode<T>[]
): PuzzleTopicTreeNode<T>[] {
  return nodes.flatMap((node) => [node, ...flattenPuzzleTopicTree(node.children)]);
}

/** The topic's id plus every descendant's id. */
export function collectPuzzleTopicSubtreeIds(topics: TopicNodeInput[], rootId: string): string[] {
  const byParent = new Map<string, string[]>();
  for (const topic of topics) {
    if (!topic.parentId) continue;
    const list = byParent.get(topic.parentId) ?? [];
    list.push(topic.id);
    byParent.set(topic.parentId, list);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    stack.push(...(byParent.get(id) ?? []));
  }
  return out;
}

/** Ancestors root-first, ending with the topic itself. */
export function puzzleTopicPath<T extends TopicNodeInput>(topics: T[], id: string): T[] {
  const byId = new Map(topics.map((t) => [t.id, t]));
  const path: T[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

/** "Tactics / Forks / Knight forks" */
export function puzzleTopicPathLabel(
  topics: (TopicNodeInput & { name: string })[],
  id: string
): string {
  return puzzleTopicPath(topics, id)
    .map((t) => t.name)
    .join(" / ");
}

// ── Puzzle CRUD ──

const puzzleTitleSchema = z.string().trim().min(1).max(200);
const puzzleFenSchema = z.string().trim().min(1).max(MAX_PUZZLE_FEN_LENGTH);
const puzzleSolutionSchema = z.array(solutionMoveSchema).max(MAX_PUZZLE_SOLUTION_MOVES);
const puzzleHintsSchema = z.array(z.string().trim().min(1).max(300)).max(MAX_PUZZLE_HINTS);
const puzzleTagsSchema = z.array(z.string().trim().min(1).max(30)).max(MAX_PUZZLE_TAGS);

export const createPuzzleRequestSchema = z
  .object({
    title: puzzleTitleSchema,
    description: z.string().trim().max(2000).optional(),
    topicId: z.string().min(1),
    puzzleType: puzzleTypeSchema,
    difficulty: puzzleDifficultySchema,
    fen: puzzleFenSchema,
    solutionMoves: puzzleSolutionSchema.default([]),
    explanation: z.string().trim().max(2000).optional(),
    hints: puzzleHintsSchema.optional(),
    tags: puzzleTagsSchema.optional(),
    estimatedSeconds: z.number().int().min(5).max(3600).optional(),
    orientation: chessColorSchema.optional(),
    /** Points / penalties for this puzzle when shared in a live class. */
    scoring: puzzleScoringOverrideSchema.nullable().optional(),
    status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
    // Coaches cannot set GLOBAL — the server forces PRIVATE for them.
    visibility: puzzleVisibilitySchema.optional()
  })
  .superRefine((v, ctx) => {
    if (v.status === "PUBLISHED" && v.solutionMoves.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["solutionMoves"],
        message: "A published puzzle needs at least one solution move."
      });
    }
  });
export type CreatePuzzleRequest = z.infer<typeof createPuzzleRequestSchema>;

export const updatePuzzleRequestSchema = z.object({
  title: puzzleTitleSchema.optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  topicId: z.string().min(1).optional(),
  puzzleType: puzzleTypeSchema.optional(),
  difficulty: puzzleDifficultySchema.optional(),
  fen: puzzleFenSchema.optional(),
  solutionMoves: puzzleSolutionSchema.optional(),
  explanation: z.string().trim().max(2000).nullable().optional(),
  hints: puzzleHintsSchema.optional(),
  tags: puzzleTagsSchema.optional(),
  estimatedSeconds: z.number().int().min(5).max(3600).nullable().optional(),
  orientation: chessColorSchema.optional(),
  /** null clears the override (the admin default applies). */
  scoring: puzzleScoringOverrideSchema.nullable().optional()
});
export type UpdatePuzzleRequest = z.infer<typeof updatePuzzleRequestSchema>;

export const setPuzzlePublishedRequestSchema = z.object({ published: z.boolean() });
export type SetPuzzlePublishedRequest = z.infer<typeof setPuzzlePublishedRequestSchema>;

export const setPuzzleArchivedRequestSchema = z.object({ archived: z.boolean() });
export type SetPuzzleArchivedRequest = z.infer<typeof setPuzzleArchivedRequestSchema>;

export const validatePuzzleRequestSchema = z.object({
  fen: puzzleFenSchema,
  solutionMoves: puzzleSolutionSchema
});
export type ValidatePuzzleRequest = z.infer<typeof validatePuzzleRequestSchema>;
export type ValidatePuzzleResponse = {
  valid: boolean;
  normalizedSolution?: SolutionMove[];
  sideToMove?: "white" | "black";
  error?: string;
};

export const bulkPuzzleActionRequestSchema = z.object({
  action: z.enum(["publish", "unpublish", "archive", "unarchive", "delete"]),
  ids: z.array(z.string().min(1)).min(1).max(100)
});
export type BulkPuzzleActionRequest = z.infer<typeof bulkPuzzleActionRequestSchema>;
export type BulkPuzzleActionResponse = { updated: number };

export const puzzleScopeSchema = z.enum(["all", "mine", "admin"]);
export type PuzzleScope = z.infer<typeof puzzleScopeSchema>;

/** Query params for the paginated puzzle-library list. */
export const puzzleListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().optional(),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).optional(),
  topicId: z.string().optional(),
  /** `subtree` (default) includes every subfolder of `topicId`. */
  topicScope: z.enum(["direct", "subtree"]).optional(),
  puzzleType: puzzleTypeSchema.optional(),
  difficulty: puzzleDifficultySchema.optional(),
  status: puzzleStatusSchema.optional(),
  visibility: puzzleVisibilitySchema.optional(),
  creatorId: z.string().optional(),
  scope: puzzleScopeSchema.optional()
});
export type PuzzleListQuery = z.infer<typeof puzzleListQuerySchema>;

// ── Puzzle response shapes (dates as ISO strings) ──

export type PuzzleSummary = {
  id: string;
  title: string;
  description: string | null;
  topicId: string;
  topicName: string;
  puzzleType: PuzzleType;
  difficulty: PuzzleDifficulty;
  status: PuzzleStatus;
  visibility: PuzzleVisibility;
  tags: string[];
  estimatedSeconds: number | null;
  /** This puzzle's own points / penalties override; null = the admin default. */
  scoring: PuzzleScoringOverride | null;
  sideToMove: "white" | "black";
  solutionLength: number;
  createdById: string | null;
  createdByName: string | null;
  createdByRole: UserRole;
  attemptCount: number;
  canManage: boolean;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  archivedAt: string | null;
};

export type PuzzleDetail = PuzzleSummary & {
  fen: string;
  orientation: "white" | "black";
  /** Null when the viewer is a student who has not solved it yet. */
  solutionMoves: SolutionMove[] | null;
  explanation: string | null;
  hints: string[];
};

export type PuzzleListResponse = { puzzles: PuzzleSummary[]; pagination?: PaginationMeta };
export type PuzzleResponse = { puzzle: PuzzleDetail };

export type PuzzleStatsResponse = {
  total: number;
  published: number;
  draft: number;
  archived: number;
  global: number;
  private: number;
  topics: number;
};

// ── Attempts (student) ──

export type PuzzleAttemptDto = {
  id: string;
  puzzleId: string;
  attemptNumber: number;
  status: PuzzleAttemptStatus;
  moves: AttemptMove[];
  scorePercent: number | null;
  accuracyPercent: number | null;
  hintsUsed: number;
  durationSeconds: number;
  result: string | null;
  startedAt: string;
  completedAt: string | null;
};

export type StartPuzzleAttemptResponse = {
  attempt: PuzzleAttemptDto;
  fen: string;
  orientation: "white" | "black";
  studentColor: "white" | "black";
  solutionLength: number;
  allowHints: boolean;
  hintCount: number;
};

export type PuzzleAttemptProgressResponse = {
  attempt: PuzzleAttemptDto;
  moveFeedback: SolveLineMoveFeedback | null;
};

export type PuzzleAttemptResultResponse = {
  attempt: PuzzleAttemptDto;
  scorePercent: number;
  accuracyPercent: number | null;
  solved: boolean;
  review: AttemptReviewMove[];
  solutionMoves: SolutionMove[];
  bestScorePercent: number;
};

export type PuzzleHintResponse = SolveLineHint;

export type PuzzleAttemptHistoryResponse = {
  attempts: PuzzleAttemptDto[];
  bestScorePercent: number | null;
};

// ── Student browse ──

export type StudentPuzzleSummary = PuzzleSummary & {
  solved: boolean;
  bestScorePercent: number | null;
  attemptedCount: number;
};
export type StudentPuzzleListResponse = {
  puzzles: StudentPuzzleSummary[];
  pagination?: PaginationMeta;
};
export type StudentPuzzleDetailResponse = { puzzle: PuzzleDetail };

export const studentPuzzleListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().optional(),
  sort: z.string().optional(),
  order: z.enum(["asc", "desc"]).optional(),
  topicId: z.string().optional(),
  topicScope: z.enum(["direct", "subtree"]).optional(),
  puzzleType: puzzleTypeSchema.optional(),
  difficulty: puzzleDifficultySchema.optional(),
  solved: z.enum(["yes", "no"]).optional()
});
export type StudentPuzzleListQuery = z.infer<typeof studentPuzzleListQuerySchema>;

// ── Attempt request schemas ──

export const savePuzzleAttemptRequestSchema = z.object({
  moves: z.array(attemptMoveSchema).max(400),
  durationSeconds: z.number().int().min(0).max(86_400).optional(),
  hintsUsed: z.number().int().min(0).max(200).optional()
});
export type SavePuzzleAttemptRequest = z.infer<typeof savePuzzleAttemptRequestSchema>;

export const submitPuzzleAttemptRequestSchema = savePuzzleAttemptRequestSchema;
export type SubmitPuzzleAttemptRequest = SavePuzzleAttemptRequest;

export const puzzleHintRequestSchema = z.object({
  moves: z.array(attemptMoveSchema).max(400),
  level: z.number().int().min(1).max(3)
});
export type PuzzleHintRequest = z.infer<typeof puzzleHintRequestSchema>;

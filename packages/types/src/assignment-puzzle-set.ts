import type {
  AssignmentStatus,
  ChessColor,
  PuzzleDifficulty,
  PuzzleLeaderboardOptions,
  PuzzlePointsBreakdown,
  PuzzleScoring,
  PuzzleType
} from "./index";

// ──────────────────────────────────────────────────────────────
// Puzzle-set assignments (activityType PUZZLE_SET) — shared contract
// ──────────────────────────────────────────────────────────────
// An assignment whose activity is an ordered list of library puzzles. The
// student solves them one at a time through the ordinary server-scored puzzle
// attempt flow (`PuzzleAttempt`, context ASSIGNMENT); points come from the same
// `computePuzzlePoints` the live-class leaderboard uses, with each puzzle's
// scoring frozen onto the set when it is saved.
//
// Counting rules (the API's `puzzle-set-results.util.ts` is the one
// implementation):
//   - A puzzle's result is the student's BEST finished attempt at it in this
//     assignment — a retry can raise it, never add to it, so a duplicate submit
//     or extra try cannot inflate a total.
//   - attempted = puzzles with at least one finished attempt; solved = puzzles
//     with a SOLVED one; tries = every attempt started.
//   - COMPLETED once every puzzle has a finished attempt (solved or not); a
//     student with tries left may still go back and improve.
//   - Tries per puzzle come from the assignment's own `maxAttempts` /
//     `allowRetry`, hints from `allowHints` — the same switches every other
//     evaluated assignment uses.

/** Most puzzles one assignment may hold. */
export const MAX_ASSIGNMENT_PUZZLES = 50;

// ── Homework-approved folders ──
// The Super Admin approves a puzzle folder once, academy-wide (the approval is
// stored on the folder, not per coach). A coach then assigns the whole folder
// as a PUZZLE_SET through the ordinary homework flow. The set is the folder's
// live PUBLISHED GLOBAL puzzles, filed directly in it, in title order.

export type FolderHomeworkState = {
  approved: boolean;
  isSystem: boolean;
  /** Live subfolders. */
  subfolderCount: number;
  /** Live published library (GLOBAL) puzzles with a solution, filed directly in the folder. */
  puzzleCount: number;
};

/**
 * The one rule for whether a folder may be assigned as homework — the API
 * enforces it on approve, create and every deploy; the library UI shows it.
 * Returns why not, or null when it can be assigned.
 */
export function folderHomeworkBlocker(state: FolderHomeworkState): string | null {
  if (state.isSystem) return "System folders can't be assigned as homework.";
  if (!state.approved) return "Not approved for homework by the Super Admin.";
  if (state.subfolderCount > 0) {
    return "Has subfolders — only a folder without subfolders can be assigned.";
  }
  if (state.puzzleCount === 0) return "Has no published library puzzles to assign.";
  if (state.puzzleCount > MAX_ASSIGNMENT_PUZZLES) {
    return `Holds ${state.puzzleCount} puzzles; an assignment takes at most ${MAX_ASSIGNMENT_PUZZLES}.`;
  }
  return null;
}

/** GET a folder's homework set: the puzzles a coach would assign, in order. */
export type FolderHomeworkResponse = {
  topicId: string;
  topicName: string;
  blocker: string | null;
  puzzles: Array<{
    puzzleId: string;
    title: string;
    difficulty: PuzzleDifficulty;
    tags: string[];
    topicName: string | null;
  }>;
};

/** Points a puzzle can award at most: solve + full speed bonus + the top first-solver bonus. */
export function maxPuzzlePoints(scoring: PuzzleScoring): number {
  return scoring.basePoints + scoring.speedBonusMax + Math.max(0, ...scoring.firstSolveBonuses);
}

/** One puzzle of a set, as staff and students see it (never the solution). */
export type AssignmentSetPuzzle = {
  puzzleId: string;
  /** 0-based order. */
  position: number;
  title: string;
  difficulty: PuzzleDifficulty;
  puzzleType: PuzzleType;
  topicName: string | null;
  /** The library puzzle's own tags (read live — the set references the puzzle). */
  tags: string[];
  sideToMove: ChessColor;
  solutionLength: number;
  /** Resolved and frozen when the set was saved. */
  scoring: PuzzleScoring;
  maxPoints: number;
};

export const PUZZLE_SET_ITEM_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "SOLVED", "FAILED"] as const;
export type PuzzleSetItemStatus = (typeof PUZZLE_SET_ITEM_STATUSES)[number];

export const PUZZLE_SET_ITEM_STATUS_LABELS: Record<PuzzleSetItemStatus, string> = {
  FAILED: "Not solved",
  IN_PROGRESS: "In progress",
  NOT_STARTED: "Not started",
  SOLVED: "Solved"
};

/** One student's result on one puzzle of the set. */
export type PuzzleSetItemResult = {
  puzzleId: string;
  position: number;
  title: string;
  /** SOLVED beats FAILED beats IN_PROGRESS; NOT_STARTED = no attempt at all. */
  status: PuzzleSetItemStatus;
  /** Tries started at this puzzle (finished + open). */
  tries: number;
  /** null = unlimited. */
  triesLeft: number | null;
  maxPoints: number;
  /** The best finished attempt's points; null until one is finished. */
  points: number | null;
  breakdown: PuzzlePointsBreakdown | null;
  /** The best finished attempt's details (null until one is finished). */
  scorePercent: number | null;
  accuracyPercent: number | null;
  hintsUsed: number | null;
  wrongMoves: number | null;
  durationSeconds: number | null;
  /** Time across every try at this puzzle. */
  totalSeconds: number;
  completedAt: string | null;
};

export type PuzzleSetStudentResult = {
  studentId: string;
  studentName: string;
  /** The StudentAssignment row. */
  studentAssignmentId: string;
  status: AssignmentStatus;
  /** Leaderboard position; null until the student has finished a puzzle. */
  rank: number | null;
  puzzleCount: number;
  attemptedCount: number;
  solvedCount: number;
  points: number;
  maxPoints: number;
  /** Every try at every puzzle. */
  tries: number;
  hintsUsed: number;
  wrongMoves: number;
  timeSpentSeconds: number;
  completedAt: string | null;
  lastAttemptAt: string | null;
  items: PuzzleSetItemResult[];
};

/** Coach view of one deployment (`AssignmentDeploymentDetail.puzzleSet`). */
export type AssignmentPuzzleSetResults = {
  puzzles: AssignmentSetPuzzle[];
  maxPoints: number;
  leaderboard: PuzzleLeaderboardOptions;
  /** Every student of the deployment, ranked first, then the rest A–Z. */
  students: PuzzleSetStudentResult[];
};

/** Student view of their own set (`StudentAssignmentItem.puzzleSet`). */
export type StudentPuzzleSetProgress = {
  puzzles: AssignmentSetPuzzle[];
  maxPoints: number;
  /** Tries per puzzle; null = unlimited. */
  triesPerPuzzle: number | null;
  allowHints: boolean;
  /** First puzzle (by position) with no finished attempt; null once all are finished. */
  nextPosition: number | null;
  self: PuzzleSetStudentResult;
  leaderboard: PuzzleLeaderboardOptions;
};

// ── Leaderboard (student endpoint) ──

export type PuzzleSetLeaderboardEntry = {
  rank: number;
  /** "Student 3" when the board is anonymized (never for the viewer's own row). */
  studentName: string;
  isSelf: boolean;
  points: number;
  solvedCount: number;
  attemptedCount: number;
  /** null when the board hides stats. */
  timeSpentSeconds: number | null;
  hintsUsed: number | null;
  wrongMoves: number | null;
};

export type PuzzleSetLeaderboardResponse = {
  entries: PuzzleSetLeaderboardEntry[];
  maxPoints: number;
  puzzleCount: number;
  /** Students ranked so far (whether or not every row is shown). */
  rankedCount: number;
  /** False when the viewer sees only part of the board (hidden, before the due date, top N). */
  showingAll: boolean;
  /** Why rows are held back, for the empty/partial state. */
  restriction: "HIDDEN" | "AFTER_DUE_DATE" | "TOP_N" | null;
  options: PuzzleLeaderboardOptions;
};

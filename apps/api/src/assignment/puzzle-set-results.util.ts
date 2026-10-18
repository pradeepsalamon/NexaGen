import {
  computePuzzlePoints,
  maxPuzzlePoints,
  type AssignmentStatus,
  type PuzzleLeaderboardOptions,
  type PuzzleScoring,
  type PuzzleSetItemResult,
  type PuzzleSetItemStatus,
  type PuzzleSetLeaderboardResponse,
  type PuzzleSetStudentResult
} from "@nexa-chess/types";

// Pure: turns a PUZZLE_SET deployment's attempt rows into per-student,
// per-puzzle results and a ranking. No Prisma, no clock (callers pass `now`),
// so every counting rule documented in `assignment-puzzle-set.ts` is pinned by
// `puzzle-set-results.util.spec.ts`. Points always come from
// `computePuzzlePoints` — the same function the live-class board uses.

export type SetPuzzleInput = {
  puzzleId: string;
  position: number;
  title: string;
  scoring: PuzzleScoring;
};

export type SetStudentInput = {
  studentAssignmentId: string;
  studentId: string;
  studentName: string;
};

export type SetAttemptInput = {
  studentAssignmentId: string;
  puzzleId: string;
  status: "IN_PROGRESS" | "SOLVED" | "FAILED" | "ABANDONED";
  scorePercent: number | null;
  accuracyPercent: number | null;
  hintsUsed: number;
  wrongMoves: number;
  durationSeconds: number;
  startedAt: Date;
  completedAt: Date | null;
};

type Finished = SetAttemptInput & { status: "SOLVED" | "FAILED"; completedAt: Date };

const isFinished = (a: SetAttemptInput): a is Finished =>
  (a.status === "SOLVED" || a.status === "FAILED") && a.completedAt !== null;

/** Negative when `a` is the better attempt at the same puzzle. */
function compareAttempts(
  a: { points: number; scorePercent: number; durationSeconds: number; completedAt: number },
  b: { points: number; scorePercent: number; durationSeconds: number; completedAt: number }
) {
  if (a.points !== b.points) return b.points - a.points;
  if (a.scorePercent !== b.scorePercent) return b.scorePercent - a.scorePercent;
  if (a.durationSeconds !== b.durationSeconds) return a.durationSeconds - b.durationSeconds;
  return a.completedAt - b.completedAt;
}

export function computePuzzleSetResults(input: {
  puzzles: SetPuzzleInput[];
  students: SetStudentInput[];
  attempts: SetAttemptInput[];
  /** Tries per puzzle; null = unlimited. */
  triesPerPuzzle: number | null;
  options: PuzzleLeaderboardOptions;
}): PuzzleSetStudentResult[] {
  const puzzles = [...input.puzzles].sort((a, b) => a.position - b.position);
  const inSet = new Set(puzzles.map((p) => p.puzzleId));
  const studentByAssignment = new Map(input.students.map((s) => [s.studentAssignmentId, s]));
  // Attempts at a puzzle since removed from the set, or by someone no longer in
  // the deployment, don't count.
  // ABANDONED attempts were never a real try (only data repair produces them).
  const attempts = input.attempts.filter(
    (a) =>
      a.status !== "ABANDONED" &&
      inSet.has(a.puzzleId) &&
      studentByAssignment.has(a.studentAssignmentId)
  );

  // First-solver order per puzzle: each student's earliest solve, earliest first.
  const solveOrder = new Map<string, Map<string, number>>();
  for (const puzzle of puzzles) {
    const firstSolve = new Map<string, number>();
    for (const a of attempts) {
      if (a.puzzleId !== puzzle.puzzleId || a.status !== "SOLVED" || !a.completedAt) continue;
      const at = a.completedAt.getTime();
      const prev = firstSolve.get(a.studentAssignmentId);
      if (prev === undefined || at < prev) firstSolve.set(a.studentAssignmentId, at);
    }
    solveOrder.set(
      puzzle.puzzleId,
      new Map(
        [...firstSolve.entries()].sort((x, y) => x[1] - y[1]).map(([id], i) => [id, i + 1])
      )
    );
  }

  const byStudentPuzzle = new Map<string, SetAttemptInput[]>();
  for (const a of attempts) {
    const key = `${a.studentAssignmentId}|${a.puzzleId}`;
    const list = byStudentPuzzle.get(key) ?? [];
    list.push(a);
    byStudentPuzzle.set(key, list);
  }

  const results = input.students.map<PuzzleSetStudentResult & { lastFinish: number }>((student) => {
    let lastFinish = 0;
    let lastAttemptAt: number | null = null;
    let allFinished = puzzles.length > 0;

    const items = puzzles.map<PuzzleSetItemResult>((puzzle) => {
      const tries = byStudentPuzzle.get(`${student.studentAssignmentId}|${puzzle.puzzleId}`) ?? [];
      const finished = tries.filter(isFinished);
      const maxPoints = maxPuzzlePoints(puzzle.scoring);

      for (const t of tries) {
        const at = (t.completedAt ?? t.startedAt).getTime();
        if (lastAttemptAt === null || at > lastAttemptAt) lastAttemptAt = at;
      }

      let best: (Finished & { points: number; breakdown: PuzzleSetItemResult["breakdown"] }) | null =
        null;
      for (const attempt of finished) {
        const solved = attempt.status === "SOLVED";
        const breakdown = computePuzzlePoints(puzzle.scoring, {
          durationSeconds: attempt.durationSeconds,
          hintsUsed: attempt.hintsUsed,
          scorePercent: attempt.scorePercent ?? 0,
          solveOrder: solved
            ? (solveOrder.get(puzzle.puzzleId)?.get(student.studentAssignmentId) ?? null)
            : null,
          solved,
          wrongMoves: attempt.wrongMoves
        });
        const candidate = { ...attempt, breakdown, points: breakdown.total };
        if (
          !best ||
          compareAttempts(
            { ...candidate, completedAt: candidate.completedAt.getTime(), scorePercent: candidate.scorePercent ?? 0 },
            { ...best, completedAt: best.completedAt.getTime(), scorePercent: best.scorePercent ?? 0 }
          ) < 0
        ) {
          best = candidate;
        }
      }

      if (finished.length === 0) allFinished = false;
      else {
        const firstFinish = Math.min(...finished.map((f) => f.completedAt.getTime()));
        lastFinish = Math.max(lastFinish, firstFinish);
      }

      const status: PuzzleSetItemStatus = finished.some((f) => f.status === "SOLVED")
        ? "SOLVED"
        : finished.length > 0
          ? "FAILED"
          : tries.some((t) => t.status === "IN_PROGRESS")
            ? "IN_PROGRESS"
            : "NOT_STARTED";

      return {
        accuracyPercent: best?.accuracyPercent ?? null,
        breakdown: best?.breakdown ?? null,
        completedAt: best ? best.completedAt.toISOString() : null,
        durationSeconds: best?.durationSeconds ?? null,
        hintsUsed: best?.hintsUsed ?? null,
        maxPoints,
        points: best?.points ?? null,
        position: puzzle.position,
        puzzleId: puzzle.puzzleId,
        scorePercent: best?.scorePercent ?? null,
        status,
        title: puzzle.title,
        totalSeconds: tries.reduce((sum, t) => sum + Math.max(0, t.durationSeconds), 0),
        tries: tries.length,
        triesLeft:
          input.triesPerPuzzle === null ? null : Math.max(0, input.triesPerPuzzle - tries.length),
        wrongMoves: best?.wrongMoves ?? null
      };
    });

    const started = items.some((i) => i.tries > 0);
    const status: AssignmentStatus = !started ? "PENDING" : allFinished ? "COMPLETED" : "IN_PROGRESS";
    const finishedItems = items.filter((i) => i.points !== null);

    return {
      attemptedCount: finishedItems.length,
      completedAt: status === "COMPLETED" ? new Date(lastFinish).toISOString() : null,
      // Wrong moves / hints of the attempts that count, not of every abandoned try.
      hintsUsed: finishedItems.reduce((sum, i) => sum + (i.hintsUsed ?? 0), 0),
      items,
      lastAttemptAt: lastAttemptAt === null ? null : new Date(lastAttemptAt).toISOString(),
      lastFinish,
      maxPoints: items.reduce((sum, i) => sum + i.maxPoints, 0),
      points: finishedItems.reduce((sum, i) => sum + (i.points ?? 0), 0),
      puzzleCount: puzzles.length,
      rank: null,
      solvedCount: items.filter((i) => i.status === "SOLVED").length,
      status,
      studentAssignmentId: student.studentAssignmentId,
      studentId: student.studentId,
      studentName: student.studentName,
      timeSpentSeconds: items.reduce((sum, i) => sum + i.totalSeconds, 0),
      tries: items.reduce((sum, i) => sum + i.tries, 0),
      wrongMoves: finishedItems.reduce((sum, i) => sum + (i.wrongMoves ?? 0), 0)
    };
  });

  const scoreSum = (r: PuzzleSetStudentResult) =>
    r.items.reduce((sum, i) => sum + (i.scorePercent ?? 0), 0);
  const ranked = results
    .filter((r) => r.attemptedCount > 0)
    .sort((a, b) => {
      if (input.options.rankBy === "POINTS" && a.points !== b.points) return b.points - a.points;
      if (a.solvedCount !== b.solvedCount) return b.solvedCount - a.solvedCount;
      if (input.options.rankBy === "SCORE_THEN_TIME" && scoreSum(a) !== scoreSum(b)) {
        return scoreSum(b) - scoreSum(a);
      }
      if (a.timeSpentSeconds !== b.timeSpentSeconds) return a.timeSpentSeconds - b.timeSpentSeconds;
      return a.lastFinish - b.lastFinish;
    })
    .map((r, i) => ({ ...r, rank: i + 1 }));
  const unranked = results
    .filter((r) => r.attemptedCount === 0)
    .sort((a, b) => a.studentName.localeCompare(b.studentName));

  return [...ranked, ...unranked].map(({ lastFinish: _lastFinish, ...r }) => r);
}

/** The StudentAssignment roll-up columns every existing list / dashboard / reminder reads. */
export function toStudentAssignmentRollup(result: PuzzleSetStudentResult) {
  return {
    attemptCount: result.tries,
    bestAccuracyPercent: null,
    bestScorePercent:
      result.attemptedCount === 0
        ? null
        : result.maxPoints > 0
          ? Math.max(0, Math.min(100, Math.round((result.points / result.maxPoints) * 100)))
          : Math.round((result.solvedCount / Math.max(1, result.puzzleCount)) * 100),
    completedAt: result.completedAt ? new Date(result.completedAt) : null,
    lastAttemptAt: result.lastAttemptAt ? new Date(result.lastAttemptAt) : null,
    status: result.status,
    timeSpentSeconds: result.tries > 0 ? result.timeSpentSeconds : null
  };
}

/**
 * What one student may see of the board. Coaches get the full `results`; a
 * student is limited by the set's frozen leaderboard options, applied here on
 * the server: HIDDEN → own row only; AFTER_END → own row until the due date;
 * topN → the top N plus their own row; anonymize → "Student N" for others.
 */
export function studentLeaderboardView(input: {
  results: PuzzleSetStudentResult[];
  viewerStudentId: string;
  options: PuzzleLeaderboardOptions;
  dueDate: Date;
  now: Date;
  maxPoints: number;
  puzzleCount: number;
}): PuzzleSetLeaderboardResponse {
  const { options } = input;
  const ranked = input.results.filter((r) => r.rank !== null);
  const self = ranked.find((r) => r.studentId === input.viewerStudentId);

  let restriction: PuzzleSetLeaderboardResponse["restriction"] = null;
  let rows = ranked;
  if (options.visibility === "HIDDEN") {
    restriction = "HIDDEN";
    rows = self ? [self] : [];
  } else if (options.visibility === "AFTER_END" && input.now < input.dueDate) {
    restriction = "AFTER_DUE_DATE";
    rows = self ? [self] : [];
  } else if (options.topN !== null && ranked.length > options.topN) {
    restriction = "TOP_N";
    rows = ranked.filter((r) => (r.rank ?? Infinity) <= (options.topN ?? Infinity) || r === self);
  }

  return {
    entries: rows.map((r) => {
      const isSelf = r.studentId === input.viewerStudentId;
      return {
        attemptedCount: r.attemptedCount,
        hintsUsed: options.showStats ? r.hintsUsed : null,
        isSelf,
        points: r.points,
        rank: r.rank ?? 0,
        solvedCount: r.solvedCount,
        studentName: options.anonymize && !isSelf ? `Student ${r.rank}` : r.studentName,
        timeSpentSeconds: options.showStats ? r.timeSpentSeconds : null,
        wrongMoves: options.showStats ? r.wrongMoves : null
      };
    }),
    maxPoints: input.maxPoints,
    options,
    puzzleCount: input.puzzleCount,
    rankedCount: ranked.length,
    restriction,
    showingAll: restriction === null
  };
}

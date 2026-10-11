import {
  DEFAULT_PUZZLE_LEADERBOARD,
  resolvePuzzleScoring,
  type PuzzleLeaderboardOptions
} from "@nexa-chess/types";
import {
  computePuzzleSetResults,
  studentLeaderboardView,
  toStudentAssignmentRollup,
  type SetAttemptInput
} from "./puzzle-set-results.util";

// basePoints 10, −3 per wrong move, −3 per hint, partial credit, no bonuses.
const SCORING = resolvePuzzleScoring();

const puzzles = [
  { puzzleId: "p1", position: 0, title: "One", scoring: SCORING },
  { puzzleId: "p2", position: 1, title: "Two", scoring: SCORING },
  { puzzleId: "p3", position: 2, title: "Three", scoring: SCORING }
];

const students = [
  { studentAssignmentId: "sa-ana", studentId: "ana", studentName: "Ana" },
  { studentAssignmentId: "sa-ben", studentId: "ben", studentName: "Ben" },
  { studentAssignmentId: "sa-cy", studentId: "cy", studentName: "Cy" }
];

const t = (minutes: number) => new Date(Date.UTC(2026, 9, 11, 10, minutes));

function attempt(over: Partial<SetAttemptInput> & Pick<SetAttemptInput, "studentAssignmentId" | "puzzleId">): SetAttemptInput {
  const status = over.status ?? "SOLVED";
  return {
    accuracyPercent: status === "SOLVED" ? 100 : 0,
    completedAt: status === "IN_PROGRESS" ? null : t(5),
    durationSeconds: 30,
    hintsUsed: 0,
    scorePercent: status === "SOLVED" ? 100 : 0,
    startedAt: t(1),
    status,
    wrongMoves: 0,
    ...over
  };
}

const run = (attempts: SetAttemptInput[], opts: { tries?: number | null; options?: PuzzleLeaderboardOptions } = {}) =>
  computePuzzleSetResults({
    attempts,
    options: opts.options ?? DEFAULT_PUZZLE_LEADERBOARD,
    puzzles,
    students,
    triesPerPuzzle: opts.tries === undefined ? null : opts.tries
  });

const of = (results: ReturnType<typeof run>, studentId: string) =>
  results.find((r) => r.studentId === studentId)!;

describe("computePuzzleSetResults", () => {
  it("counts a puzzle's best finished attempt once, however many tries", () => {
    const ana = of(
      run([
        attempt({ studentAssignmentId: "sa-ana", puzzleId: "p1", status: "FAILED", scorePercent: 50, completedAt: t(2) }),
        attempt({ studentAssignmentId: "sa-ana", puzzleId: "p1", wrongMoves: 1, completedAt: t(3) }),
        // A replayed / duplicate solve of the same puzzle adds nothing.
        attempt({ studentAssignmentId: "sa-ana", puzzleId: "p1", wrongMoves: 1, completedAt: t(4) })
      ]),
      "ana"
    );

    const p1 = ana.items[0];
    expect(p1.tries).toBe(3);
    expect(p1.status).toBe("SOLVED");
    expect(p1.points).toBe(7); // 10 − 3 for the wrong move
    expect(ana.points).toBe(7);
    expect(ana.solvedCount).toBe(1);
    expect(ana.attemptedCount).toBe(1);
    expect(ana.tries).toBe(3);
    expect(ana.maxPoints).toBe(30);
  });

  it("applies the frozen scoring: partial credit, wrong-move and hint penalties", () => {
    const ana = of(
      run([
        attempt({ studentAssignmentId: "sa-ana", puzzleId: "p1", hintsUsed: 2 }),
        attempt({ studentAssignmentId: "sa-ana", puzzleId: "p2", status: "FAILED", scorePercent: 50 })
      ]),
      "ana"
    );
    expect(ana.items[0].points).toBe(4); // 10 − 2×3
    expect(ana.items[0].breakdown).toMatchObject({ base: 10, hintPenalty: 6 });
    expect(ana.items[1].points).toBe(5); // half of 10
    expect(ana.items[1].status).toBe("FAILED");
    expect(ana.points).toBe(9);
    expect(ana.hintsUsed).toBe(2);
  });

  it("derives Not started / In progress / Completed", () => {
    const results = run([
      // Ben: one open attempt only.
      attempt({ studentAssignmentId: "sa-ben", puzzleId: "p1", status: "IN_PROGRESS" }),
      // Cy: every puzzle finished, one of them unsolved.
      attempt({ studentAssignmentId: "sa-cy", puzzleId: "p1" }),
      attempt({ studentAssignmentId: "sa-cy", puzzleId: "p2", status: "FAILED", completedAt: t(9) }),
      attempt({ studentAssignmentId: "sa-cy", puzzleId: "p3", completedAt: t(7) })
    ]);

    expect(of(results, "ana").status).toBe("PENDING");
    expect(of(results, "ana").items.every((i) => i.status === "NOT_STARTED")).toBe(true);

    const ben = of(results, "ben");
    expect(ben.status).toBe("IN_PROGRESS");
    expect(ben.items[0].status).toBe("IN_PROGRESS");
    expect(ben.attemptedCount).toBe(0);

    const cy = of(results, "cy");
    expect(cy.status).toBe("COMPLETED");
    expect(cy.solvedCount).toBe(2);
    expect(cy.attemptedCount).toBe(3);
    // Completed when the last puzzle got its first finished attempt.
    expect(cy.completedAt).toBe(t(9).toISOString());
  });

  it("reports tries left per puzzle against the assignment's limit", () => {
    const ana = of(
      run(
        [
          attempt({ studentAssignmentId: "sa-ana", puzzleId: "p1", status: "FAILED" }),
          attempt({ studentAssignmentId: "sa-ana", puzzleId: "p1", status: "FAILED" })
        ],
        { tries: 2 }
      ),
      "ana"
    );
    expect(ana.items[0].triesLeft).toBe(0);
    expect(ana.items[1].triesLeft).toBe(2);
    expect(of(run([]), "ana").items[0].triesLeft).toBeNull();
  });

  it("ignores attempts at puzzles removed from the set, by students no longer in it, and abandoned ones", () => {
    const results = run([
      attempt({ studentAssignmentId: "sa-ana", puzzleId: "gone" }),
      attempt({ studentAssignmentId: "sa-left", puzzleId: "p1" }),
      attempt({ studentAssignmentId: "sa-ana", puzzleId: "p2", status: "ABANDONED", completedAt: null })
    ]);
    expect(of(results, "ana").points).toBe(0);
    expect(of(results, "ana").tries).toBe(0);
    expect(results).toHaveLength(3);
  });

  it("awards first-solver bonuses in solve order, per puzzle", () => {
    const withBonus = resolvePuzzleScoring({ firstSolveBonuses: [5, 2] });
    const results = computePuzzleSetResults({
      attempts: [
        attempt({ studentAssignmentId: "sa-ben", puzzleId: "p1", completedAt: t(3) }),
        attempt({ studentAssignmentId: "sa-ana", puzzleId: "p1", completedAt: t(2) }),
        attempt({ studentAssignmentId: "sa-cy", puzzleId: "p1", completedAt: t(4) })
      ],
      options: DEFAULT_PUZZLE_LEADERBOARD,
      puzzles: [{ puzzleId: "p1", position: 0, title: "One", scoring: withBonus }],
      students,
      triesPerPuzzle: null
    });
    expect(of(results, "ana").points).toBe(15);
    expect(of(results, "ben").points).toBe(12);
    expect(of(results, "cy").points).toBe(10);
    expect(of(results, "ana").maxPoints).toBe(15);
  });

  it("ranks by points, then solved, then time; students yet to finish come last A–Z", () => {
    const results = run([
      attempt({ studentAssignmentId: "sa-cy", puzzleId: "p1", durationSeconds: 90 }),
      attempt({ studentAssignmentId: "sa-ben", puzzleId: "p1", durationSeconds: 20 })
    ]);
    expect(results.map((r) => [r.studentName, r.rank])).toEqual([
      ["Ben", 1],
      ["Cy", 2],
      ["Ana", null]
    ]);
  });

  it("ranks by solved count then time when the board ranks on score", () => {
    const results = run(
      [
        // Ana: one clean solve worth 10. Ben: two hint-heavy solves worth 4 + 4.
        attempt({ studentAssignmentId: "sa-ana", puzzleId: "p1" }),
        attempt({ studentAssignmentId: "sa-ben", puzzleId: "p1", hintsUsed: 2 }),
        attempt({ studentAssignmentId: "sa-ben", puzzleId: "p2", hintsUsed: 2 })
      ],
      { options: { ...DEFAULT_PUZZLE_LEADERBOARD, rankBy: "SCORE_THEN_TIME" } }
    );
    expect(results[0].studentName).toBe("Ben");
    expect(run([
      attempt({ studentAssignmentId: "sa-ana", puzzleId: "p1" }),
      attempt({ studentAssignmentId: "sa-ben", puzzleId: "p1", hintsUsed: 2 }),
      attempt({ studentAssignmentId: "sa-ben", puzzleId: "p2", hintsUsed: 2 })
    ])[0].studentName).toBe("Ana");
  });
});

describe("toStudentAssignmentRollup", () => {
  it("maps a result onto the StudentAssignment columns", () => {
    const results = run([
      attempt({ studentAssignmentId: "sa-ana", puzzleId: "p1", durationSeconds: 40 }),
      attempt({ studentAssignmentId: "sa-ana", puzzleId: "p2", status: "IN_PROGRESS", durationSeconds: 15 })
    ]);
    expect(toStudentAssignmentRollup(of(results, "ana"))).toMatchObject({
      attemptCount: 2,
      bestScorePercent: 33, // 10 of 30 points
      completedAt: null,
      status: "IN_PROGRESS",
      timeSpentSeconds: 55
    });
    expect(toStudentAssignmentRollup(of(results, "ben"))).toMatchObject({
      attemptCount: 0,
      bestScorePercent: null,
      status: "PENDING",
      timeSpentSeconds: null
    });
  });
});

describe("studentLeaderboardView", () => {
  const results = run([
    attempt({ studentAssignmentId: "sa-ana", puzzleId: "p1" }),
    attempt({ studentAssignmentId: "sa-ana", puzzleId: "p2" }),
    attempt({ studentAssignmentId: "sa-ben", puzzleId: "p1" }),
    attempt({ studentAssignmentId: "sa-cy", puzzleId: "p1", status: "FAILED" })
  ]);
  const view = (options: Partial<PuzzleLeaderboardOptions>, now = t(0), viewer = "cy") =>
    studentLeaderboardView({
      dueDate: t(30),
      maxPoints: 30,
      now,
      options: { ...DEFAULT_PUZZLE_LEADERBOARD, ...options },
      puzzleCount: 3,
      results,
      viewerStudentId: viewer
    });

  it("shows the whole ranked board when it is live", () => {
    const res = view({});
    expect(res.entries.map((e) => e.studentName)).toEqual(["Ana", "Ben", "Cy"]);
    expect(res.showingAll).toBe(true);
    expect(res.entries[2].isSelf).toBe(true);
  });

  it("shows only the viewer's own row when hidden", () => {
    const res = view({ visibility: "HIDDEN" });
    expect(res.entries).toHaveLength(1);
    expect(res.entries[0]).toMatchObject({ isSelf: true, rank: 3 });
    expect(res.restriction).toBe("HIDDEN");
    expect(res.rankedCount).toBe(3);
  });

  it("holds the board back until the due date when set to after the end", () => {
    expect(view({ visibility: "AFTER_END" }).restriction).toBe("AFTER_DUE_DATE");
    expect(view({ visibility: "AFTER_END" }).entries).toHaveLength(1);
    expect(view({ visibility: "AFTER_END" }, t(31)).entries).toHaveLength(3);
  });

  it("keeps the top N plus the viewer's own row", () => {
    const res = view({ topN: 1 });
    expect(res.entries.map((e) => e.rank)).toEqual([1, 3]);
    expect(res.restriction).toBe("TOP_N");
  });

  it("anonymizes everyone but the viewer and can drop stats", () => {
    const res = view({ anonymize: true, showStats: false });
    expect(res.entries.map((e) => e.studentName)).toEqual(["Student 1", "Student 2", "Cy"]);
    expect(res.entries[0].timeSpentSeconds).toBeNull();
  });

  it("shows nothing to a student with no finished puzzle while the board is hidden", () => {
    expect(view({ visibility: "HIDDEN" }, t(0), "nobody").entries).toEqual([]);
  });
});

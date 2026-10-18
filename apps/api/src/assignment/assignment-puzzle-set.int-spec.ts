/* eslint-disable @typescript-eslint/no-explicit-any */
import { API_ROUTES } from "@nexa-chess/types";
import {
  PuzzleDifficulty,
  PuzzleStatus,
  PuzzleType,
  PuzzleVisibility,
  UserRole,
  UserStatus
} from "@prisma/client";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createUser, resetDatabase } from "../test/integration/db";
import { createWorld } from "../test/integration/access/world";

// The whole PUZZLE_SET flow over HTTP against real Postgres: a coach builds and
// deploys a set, two students solve it one puzzle at a time, and both sides
// read the results. Unit specs pin the maths; this pins the wiring (routes,
// the attempt hooks, the roll-up, the cross-module calls and the migration).

// Black king g8 behind f7/g7/h7: Ra8# (the world's private puzzle) and Qb8#.
const QUEEN_FEN = "6k1/5ppp/8/8/8/8/5PPP/1Q4K1 w - - 0 1";
const move = (uci: string, san: string, fenAfter = "x") => ({ fenAfter, ply: 1, san, uci });

describe("PUZZLE_SET assignment (real app, real Postgres)", () => {
  let t: TestApp;
  let w: Awaited<ReturnType<typeof createWorld>>;
  let student2: Awaited<ReturnType<typeof createUser>>;
  let globalPuzzleId: string;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    w = await createWorld(t.prisma);
    const topic = await t.prisma.puzzleTopic.findFirstOrThrow();
    globalPuzzleId = (
      await t.prisma.puzzle.create({
        data: {
          createdById: w.admin.id,
          createdByRole: UserRole.ADMIN,
          difficulty: PuzzleDifficulty.EASY,
          fen: QUEEN_FEN,
          puzzleType: PuzzleType.CHECKMATE,
          solutionMovesJson: [{ san: "Qb8#", uci: "b1b8" }],
          status: PuzzleStatus.PUBLISHED,
          title: "Queen mate",
          topicId: topic.id,
          visibility: PuzzleVisibility.GLOBAL
        }
      })
    ).id;
    student2 = await t.prisma.user.update({
      where: { id: (await createUser(t.prisma, UserRole.STUDENT)).id },
      data: { status: UserStatus.ACTIVE }
    });
    await t.prisma.batchStudent.create({ data: { batchId: w.a.batch.id, studentId: student2.id } });
  });
  afterAll(async () => {
    await t?.close();
  });

  it("runs coach → student → coach end to end", async () => {
    const { coach, student, batch, privatePuzzle } = w.a;
    const dueDate = new Date(Date.now() + 86_400_000).toISOString();

    // ── Coach creates the set and assigns it in one step ──
    const created = await t.call(coach, "POST", API_ROUTES.assignments.create, {
      activityType: "PUZZLE_SET",
      allowHints: false,
      batchIds: [batch.id],
      difficulty: "BEGINNER",
      dueDate,
      maxAttempts: 2,
      puzzleIds: [globalPuzzleId, privatePuzzle.id],
      scoring: { basePoints: 10, hintPenalty: 3, wrongMovePenalty: 3 },
      title: "Mates in one"
    });
    expect(created.status).toBe(201);
    const assignment = (created.body as any).assignment;
    expect(assignment.puzzles.map((p: any) => p.puzzleId)).toEqual([globalPuzzleId, privatePuzzle.id]);
    expect(assignment.puzzles[0]).not.toHaveProperty("solutionMoves");

    // ── …then reorders it ──
    const reordered = await t.call(coach, "PATCH", API_ROUTES.assignments.update(assignment.id), {
      puzzleIds: [privatePuzzle.id, globalPuzzleId]
    });
    expect(reordered.status).toBe(200);
    expect((reordered.body as any).assignment.puzzles.map((p: any) => p.title)).toEqual([
      "Private A",
      "Queen mate"
    ]);

    // ── Student sees it, not started ──
    const list = await t.call(student, "GET", API_ROUTES.assignments.mine);
    const item = (list.body as any).assignments.find((a: any) => a.activityType === "PUZZLE_SET" && a.title === "Mates in one");
    expect(item.status).toBe("PENDING");
    expect(item.puzzleSet).toMatchObject({ allowHints: false, maxPoints: 20, nextPosition: 0, triesPerPuzzle: 2 });
    const saId = item.id;

    // ── Puzzle 1: one wrong move, a refused hint, then the solve ──
    const start1 = await t.call(student, "POST", API_ROUTES.assignments.puzzleAttempts(saId, privatePuzzle.id));
    expect(start1.status).toBe(201);
    const attempt1 = (start1.body as any).attempt.attempt.id;
    expect((start1.body as any).attempt.allowHints).toBe(false);

    const wrong = await t.call(student, "PATCH", API_ROUTES.puzzles.attempt(privatePuzzle.id, attempt1), {
      moves: [move("a1a2", "Ra2")]
    });
    expect((wrong.body as any).moveFeedback.correct).toBe(false);

    const hint = await t.call(student, "POST", API_ROUTES.puzzles.hint(privatePuzzle.id, attempt1), { level: 1, moves: [] });
    expect(hint.status).toBe(403);

    const solved = await t.call(student, "POST", API_ROUTES.puzzles.submitAttempt(privatePuzzle.id, attempt1), {
      moves: [move("a1a8", "Ra8#")]
    });
    expect((solved.body as any).solved).toBe(true);
    // A second submit of the same attempt can't land twice.
    const again = await t.call(student, "POST", API_ROUTES.puzzles.submitAttempt(privatePuzzle.id, attempt1), {
      moves: [move("a1a8", "Ra8#")]
    });
    expect(again.status).toBeGreaterThanOrEqual(400);

    // ── Puzzle 2: gives up (solution stays hidden — a try is left), then solves on the retry ──
    const start2 = await t.call(student, "POST", API_ROUTES.assignments.puzzleAttempts(saId, globalPuzzleId));
    const attempt2 = (start2.body as any).attempt.attempt.id;
    const gaveUp = await t.call(student, "POST", API_ROUTES.puzzles.submitAttempt(globalPuzzleId, attempt2), { moves: [] });
    expect((gaveUp.body as any).solved).toBe(false);
    expect((gaveUp.body as any).solutionMoves).toEqual([]);

    // Resuming mid-set: the detail says where they are.
    const mid = await t.call(student, "GET", API_ROUTES.assignments.mineGet(saId));
    expect((mid.body as any).assignment).toMatchObject({ status: "COMPLETED" });
    expect((mid.body as any).assignment.puzzleSet.self).toMatchObject({ attemptedCount: 2, solvedCount: 1 });

    const start3 = await t.call(student, "POST", API_ROUTES.assignments.puzzleAttempts(saId, globalPuzzleId));
    const attempt3 = (start3.body as any).attempt.attempt.id;
    expect(attempt3).not.toBe(attempt2);
    await t.call(student, "POST", API_ROUTES.puzzles.submitAttempt(globalPuzzleId, attempt3), {
      moves: [move("b1b8", "Qb8#")]
    });

    // Out of tries now.
    const start4 = await t.call(student, "POST", API_ROUTES.assignments.puzzleAttempts(saId, globalPuzzleId));
    expect(start4.status).toBe(400);

    const done = (await t.call(student, "GET", API_ROUTES.assignments.mineGet(saId))).body as any;
    expect(done.assignment.puzzleSet.self).toMatchObject({
      attemptedCount: 2,
      maxPoints: 20,
      points: 17, // (10 − 3 for the wrong move) + 10
      solvedCount: 2,
      status: "COMPLETED",
      tries: 3,
      wrongMoves: 1
    });
    expect(done.assignment.puzzleSet.nextPosition).toBeNull();
    expect(done.assignment).toMatchObject({ attemptCount: 3, bestScorePercent: 85, status: "COMPLETED" });

    // ── A classmate solves one puzzle cleanly ──
    const sa2 = (await t.call(student2, "GET", API_ROUTES.assignments.mine)).body as any;
    const sa2Id = sa2.assignments.find((a: any) => a.activityType === "PUZZLE_SET" && a.title === "Mates in one").id;
    const s2 = await t.call(student2, "POST", API_ROUTES.assignments.puzzleAttempts(sa2Id, globalPuzzleId));
    await t.call(student2, "POST", API_ROUTES.puzzles.submitAttempt(globalPuzzleId, (s2.body as any).attempt.attempt.id), {
      moves: [move("b1b8", "Qb8#")]
    });

    // ── Student leaderboard ──
    const board = (await t.call(student2, "GET", API_ROUTES.assignments.leaderboard(sa2Id))).body as any;
    expect(board.showingAll).toBe(true);
    expect(board.entries.map((e: any) => [e.rank, e.points, e.isSelf])).toEqual([
      [1, 17, false],
      [2, 10, true]
    ]);

    // ── Coach results: everyone, every puzzle ──
    const deployment = await t.prisma.assignmentBatch.findFirstOrThrow({ where: { assignmentId: assignment.id } });
    const results = (await t.call(coach, "GET", API_ROUTES.assignments.deployment(deployment.id))).body as any;
    const set = results.deployment.puzzleSet;
    expect(set.maxPoints).toBe(20);
    expect(set.students.map((s: any) => [s.studentId, s.rank, s.status])).toEqual([
      [student.id, 1, "COMPLETED"],
      [student2.id, 2, "IN_PROGRESS"]
    ]);
    expect(set.students[0].items).toEqual([
      expect.objectContaining({ points: 7, status: "SOLVED", tries: 1, wrongMoves: 1 }),
      expect.objectContaining({ points: 10, status: "SOLVED", tries: 2, triesLeft: 0 })
    ]);
    expect(results.deployment.stats).toMatchObject({ completed: 1, inProgress: 1, total: 2 });
  });

  it("spends one try when two starts race", async () => {
    const { coach, student, batch, privatePuzzle } = w.a;
    const created = await t.call(coach, "POST", API_ROUTES.assignments.create, {
      activityType: "PUZZLE_SET",
      batchIds: [batch.id],
      difficulty: "BEGINNER",
      dueDate: new Date(Date.now() + 86_400_000).toISOString(),
      maxAttempts: 2,
      puzzleIds: [privatePuzzle.id],
      title: "Race"
    });
    expect(created.status).toBe(201);
    const list = (await t.call(student, "GET", API_ROUTES.assignments.mine)).body as any;
    const saId = list.assignments.find((a: any) => a.title === "Race").id;

    const starts = await Promise.all(
      Array.from({ length: 4 }, () =>
        t.call(student, "POST", API_ROUTES.assignments.puzzleAttempts(saId, privatePuzzle.id))
      )
    );
    expect(starts.map((r) => r.status)).toEqual([201, 201, 201, 201]);
    expect(new Set(starts.map((r) => (r.body as any).attempt.attempt.id)).size).toBe(1);
    expect(await t.prisma.puzzleAttempt.count({ where: { studentAssignmentId: saId } })).toBe(1);
  });

  it("keeps a single-puzzle (SOLVE_LINE) assignment working unchanged", async () => {
    const { coach, student, batch } = w.a;
    const created = await t.call(coach, "POST", API_ROUTES.assignments.create, {
      activityType: "SOLVE_LINE",
      batchIds: [batch.id],
      difficulty: "BEGINNER",
      dueDate: new Date(Date.now() + 86_400_000).toISOString(),
      solutionMoves: [{ san: "Qb8#", uci: "b1b8" }],
      startFen: QUEEN_FEN,
      title: "Single line"
    });
    expect(created.status).toBe(201);
    expect((created.body as any).assignment).toMatchObject({ puzzles: null, scoring: null });

    const list = (await t.call(student, "GET", API_ROUTES.assignments.mine)).body as any;
    const item = list.assignments.find((a: any) => a.title === "Single line");
    expect(item.puzzleSet).toBeNull();

    const start = await t.call(student, "POST", API_ROUTES.assignments.attempts(item.id));
    expect(start.status).toBe(201);
    // The set's puzzle route refuses a non-set assignment.
    const wrongRoute = await t.call(student, "POST", API_ROUTES.assignments.puzzleAttempts(item.id, globalPuzzleId));
    expect(wrongRoute.status).toBe(400);
  });
});

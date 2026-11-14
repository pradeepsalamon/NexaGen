/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  API_ROUTES,
  type StudentActivityEntry,
  type StudentActivityHistoryResponse,
  type StudentActivitySummary
} from "@nexa-chess/types";
import { PuzzleDifficulty, PuzzleStatus, PuzzleType, PuzzleVisibility, UserRole } from "@prisma/client";
import { createTestApp, type TestApp } from "../test/integration/app";
import { resetDatabase } from "../test/integration/db";
import { createWorld } from "../test/integration/access/world";

// The activity history is a read model over existing records, so the only
// honest test is real rows in real Postgres. One student (side A) is given one
// of every activity shape — retries, a skip, a class puzzle shared twice and
// run by the queue, an unanswered share and question, homework of each kind, a
// puzzle rush — and every count below is worked out by hand from that fixture.

const FEN = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";
const MIN = 60 * 1000;
const MOVE = [{ ply: 1, san: "Kf1", uci: "g1f1" }];

describe("Student activity history (real app, real Postgres)", () => {
  let t: TestApp;
  let w: Awaited<ReturnType<typeof createWorld>>;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    w = await createWorld(t.prisma);
    const p = t.prisma;
    const a = w.a;
    const klass = a.class; // COMPLETED, started 3h ago, 1h long
    const at = (minutesIntoClass: number) => new Date(klass.startsAt.getTime() + minutesIntoClass * MIN);

    const puzzle = (title: string, tags: string[] = []) =>
      p.puzzle.create({
        data: {
          createdById: a.coach.id,
          createdByRole: UserRole.COACH,
          difficulty: PuzzleDifficulty.EASY,
          fen: FEN,
          puzzleType: PuzzleType.TACTICAL,
          solutionMovesJson: [{ san: "Ra8#", uci: "a1a8" }],
          status: PuzzleStatus.PUBLISHED,
          tags,
          title,
          topicId: a.privatePuzzle.topicId,
          visibility: PuzzleVisibility.PRIVATE
        }
      });
    const p1 = a.privatePuzzle; // CHECKMATE
    const p2 = await puzzle("Skipped fork", ["fork"]);
    const p3 = await puzzle("Missed fork", ["fork"]);
    ids.p1 = p1.id;
    ids.p2 = p2.id;
    ids.p3 = p3.id;

    // 1. Practice P1: the world's opened-only try (#1), then FAILED (#2), then SOLVED (#3).
    await p.puzzleAttempt.update({ where: { id: a.attempt.id }, data: { startedAt: at(-120) } });
    await p.puzzleAttempt.create({
      data: { attemptNumber: 2, completedAt: at(-100), movesJson: MOVE, puzzleId: p1.id, startedAt: at(-110), status: "FAILED", studentId: a.student.id, wrongMoves: 1 }
    });
    await p.puzzleAttempt.create({
      data: { attemptNumber: 3, completedAt: at(-80), durationSeconds: 40, movesJson: MOVE, puzzleId: p1.id, startedAt: at(-90), status: "SOLVED", studentId: a.student.id }
    });
    // 2. Training P2 skipped without a move; 3. training P3 given up after a move.
    await p.puzzleAttempt.create({
      data: { attemptNumber: 1, completedAt: at(-70), context: "TRAINING", puzzleId: p2.id, startedAt: at(-71), status: "ABANDONED", studentId: a.student.id }
    });
    await p.puzzleAttempt.create({
      data: { attemptNumber: 1, completedAt: at(-60), context: "TRAINING", movesJson: MOVE, puzzleId: p3.id, startedAt: at(-61), status: "ABANDONED", studentId: a.student.id }
    });

    // The student was in the completed class from its start, never left.
    await p.classAttendance.update({
      where: { classId_studentId: { classId: klass.id, studentId: a.student.id } },
      data: { joinedAt: at(0), leftAt: null }
    });
    // 4. P1 shared twice in that class (the first by the queue); the student's one
    //    try was left open with a wrong move → INCORRECT, one row for both shares.
    const share1 = await p.liveClassPuzzleAssignment.create({
      data: { endedAt: at(10), liveClassId: klass.id, puzzleId: p1.id, startedAt: at(5), status: "ENDED" }
    });
    await p.liveClassPuzzleAssignment.create({
      data: { endedAt: at(20), liveClassId: klass.id, puzzleId: p1.id, startedAt: at(15), status: "ENDED" }
    });
    await p.puzzleAttempt.create({
      data: { attemptNumber: 4, context: "LIVE_CLASS", liveClassId: klass.id, puzzleId: p1.id, startedAt: at(6), studentId: a.student.id, wrongMoves: 1 }
    });
    // 5. P2 shared while they were there, never touched → UNANSWERED.
    await p.liveClassPuzzleAssignment.create({
      data: { endedAt: at(30), liveClassId: klass.id, puzzleId: p2.id, startedAt: at(25), status: "ENDED" }
    });
    // 6. A question with a marked answer, answered right, never revealed.
    const poll1 = await p.liveClassMovePoll.create({
      data: { correctUci: "a1a8", endedAt: at(40), fen: FEN, liveClassId: klass.id, prompt: "Find mate", startedAt: at(35), status: "ENDED" }
    });
    await p.liveClassMovePollAnswer.create({
      data: { answeredAt: at(36), pollId: poll1.id, san: "Ra8#", studentId: a.student.id, uci: "a1a8" }
    });
    // 7. A question they never answered.
    const poll2 = await p.liveClassMovePoll.create({
      data: { endedAt: at(50), fen: FEN, liveClassId: klass.id, startedAt: at(45), status: "ENDED" }
    });
    ids.poll2 = poll2.id;
    const queue = await p.liveClassActivityQueue.create({
      data: { liveClassId: klass.id, status: "FINISHED", title: "Tuesday lesson" }
    });
    await p.liveClassActivityQueueItem.create({
      data: { activatedAt: at(5), kind: "PUZZLE", position: 0, puzzleAssignmentId: share1.id, puzzleId: p1.id, queueId: queue.id, title: p1.title }
    });
    await p.liveClassActivityQueueItem.create({
      data: { activatedAt: at(35), fen: FEN, kind: "QUESTION", movePollId: poll1.id, position: 1, queueId: queue.id, title: "Find mate" }
    });

    // 8. The world's REPLAY homework, still PENDING → NOT_STARTED.
    // 9. The world's puzzle set: P1 solved inside it → one HOMEWORK_PUZZLE row, no extra set row.
    await p.puzzleAttempt.create({
      data: {
        attemptNumber: 5,
        completedAt: at(170),
        context: "ASSIGNMENT",
        movesJson: MOVE,
        puzzleId: p1.id,
        startedAt: at(165),
        status: "SOLVED",
        studentAssignmentId: a.setStudentAssignment.id,
        studentId: a.student.id
      }
    });
    // 10. Solve-the-line homework: failed with part of the line, then solved.
    const line = await p.assignment.create({
      data: {
        activityType: "SOLVE_LINE",
        createdById: a.coach.id,
        pgn: "*",
        solutionMovesJson: [{ san: "Ra8#", uci: "a1a8" }],
        startFen: FEN,
        title: "Find the mate"
      }
    });
    const lineDeployment = await p.assignmentBatch.create({
      data: { assignmentId: line.id, batchId: a.batch.id, dueDate: at(24 * 60) }
    });
    ids.lineDeployment = lineDeployment.id;
    const lineSa = await p.studentAssignment.create({
      data: {
        assignmentBatchId: lineDeployment.id,
        attemptCount: 2,
        bestScorePercent: 100,
        completedAt: at(160),
        note: "Tricky one",
        status: "COMPLETED",
        studentId: a.student.id
      }
    });
    await p.studentAssignmentAttempt.create({
      data: { attemptNumber: 1, completedAt: at(140), result: "PARTIAL", scorePercent: 50, startedAt: at(130), status: "FAILED", studentAssignmentId: lineSa.id }
    });
    await p.studentAssignmentAttempt.create({
      data: { attemptNumber: 2, completedAt: at(160), result: "SOLVED", scorePercent: 100, startedAt: at(150), status: "COMPLETED", studentAssignmentId: lineSa.id }
    });
    // 11. A puzzle storm they played (in the live class).
    await p.liveClassPuzzleRushEntry.create({
      data: { errors: 2, finishedAt: at(175), moves: 14, rushId: a.rush.id, score: 9, solved: 9, startedAt: at(172), studentId: a.student.id }
    });

    // Side B's student has their own solved puzzle — it must never show up for A.
    await p.puzzleAttempt.update({
      where: { id: w.b.attempt.id },
      data: { completedAt: at(10), movesJson: MOVE, status: "SOLVED" }
    });
  });

  afterAll(async () => {
    await t?.close();
  });

  async function allEntries(as: any, studentPath: string, params = ""): Promise<StudentActivityEntry[]> {
    const out: StudentActivityEntry[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 20; page += 1) {
      const qs = new URLSearchParams(params);
      qs.set("limit", "4");
      if (cursor) qs.set("cursor", cursor);
      const res = await t.call(as, "GET", `${studentPath}?${qs.toString()}`);
      expect(res.status).toBe(200);
      const body = res.body as StudentActivityHistoryResponse;
      out.push(...body.entries);
      cursor = body.nextCursor;
      if (!cursor) break;
    }
    return out;
  }

  const byOutcome = (entries: StudentActivityEntry[]) =>
    entries.map((e) => `${e.type}:${e.outcome}`).sort();

  it("lists one row per activity, paged without gaps or duplicates", async () => {
    const entries = await allEntries(w.a.coach, API_ROUTES.progress.history(w.a.student.id));
    expect(new Set(entries.map((e) => e.id)).size).toBe(entries.length);
    expect(byOutcome(entries)).toEqual(
      [
        "PRACTICE_PUZZLE:CORRECT",
        "TRAINING_PUZZLE:SKIPPED",
        "TRAINING_PUZZLE:INCORRECT",
        "CLASS_PUZZLE:INCORRECT",
        "CLASS_PUZZLE:UNANSWERED",
        "CLASS_QUESTION:CORRECT",
        "CLASS_QUESTION:UNANSWERED",
        "HOMEWORK:NOT_STARTED",
        "HOMEWORK_PUZZLE:CORRECT",
        "HOMEWORK:CORRECT",
        "PUZZLE_RUSH:UNGRADED"
      ].sort()
    );
    // Newest first.
    const times = entries.map((e) => Date.parse(e.occurredAt));
    expect([...times].sort((x, y) => y - x)).toEqual(times);
    // Side B's solved puzzle is not A's.
    expect(entries.some((e) => e.title === w.b.privatePuzzle.title)).toBe(false);
  });

  it("groups retries, ignores opened-only tries, and links the class and the queue", async () => {
    const entries = await allEntries(w.a.coach, API_ROUTES.progress.history(w.a.student.id));
    const practice = entries.find((e) => e.type === "PRACTICE_PUZZLE")!;
    expect(practice).toMatchObject({ attempts: 2, completed: true, solvedOnAttempt: 2, wrongMoves: 1, durationSeconds: 40 });

    const classPuzzle = entries.find((e) => e.type === "CLASS_PUZZLE" && e.outcome === "INCORRECT")!;
    expect(classPuzzle).toMatchObject({ attempts: 1, queue: { position: 1, title: "Tuesday lesson" } });
    expect(classPuzzle.liveClass?.id).toBe(w.a.class.id);
    expect(classPuzzle.batch?.id).toBe(w.a.batch.id);

    const question = entries.find((e) => e.type === "CLASS_QUESTION" && e.outcome === "CORRECT")!;
    expect(question).toMatchObject({ detail: "Ra8#", queue: { position: 2, title: "Tuesday lesson" }, title: "Find mate" });

    const line = entries.find((e) => e.type === "HOMEWORK" && e.outcome === "CORRECT")!;
    expect(line).toMatchObject({
      assignment: { id: ids.lineDeployment, title: "Find the mate" },
      attempts: 2,
      maxScore: 100,
      score: 100,
      solvedOnAttempt: 2,
      studentNote: "Tricky one"
    });

    const setPuzzle = entries.find((e) => e.type === "HOMEWORK_PUZZLE")!;
    expect(setPuzzle.assignment?.id).toBe(w.a.setDeployment.id);

    const rush = entries.find((e) => e.type === "PUZZLE_RUSH")!;
    expect(rush).toMatchObject({ detail: "9 solved · 2 errors", score: 9, title: "Puzzle Storm" });
  });

  it("hides an unrevealed question's result from the student", async () => {
    const entries = await allEntries(w.a.student, API_ROUTES.progress.historyMine);
    expect(entries).toHaveLength(11);
    const question = entries.find((e) => e.type === "CLASS_QUESTION" && e.attempted)!;
    expect(question.outcome).toBe("UNGRADED");

    await t.prisma.liveClassMovePoll.updateMany({ where: { prompt: "Find mate" }, data: { revealed: true } });
    const after = await allEntries(w.a.student, API_ROUTES.progress.historyMine);
    expect(after.find((e) => e.type === "CLASS_QUESTION" && e.attempted)!.outcome).toBe("CORRECT");
    await t.prisma.liveClassMovePoll.updateMany({ where: { prompt: "Find mate" }, data: { revealed: false } });
  });

  it("filters by type, status, class, assignment and date together", async () => {
    const path = API_ROUTES.progress.history(w.a.student.id);
    const get = async (params: Record<string, string>) => {
      const res = await t.call(w.a.coach, "GET", `${path}?${new URLSearchParams(params).toString()}`);
      expect(res.status).toBe(200);
      return res.body as StudentActivityHistoryResponse;
    };
    expect((await get({ type: "CLASS_PUZZLE" })).total).toBe(2);
    expect((await get({ status: "UNANSWERED" })).total).toBe(2);
    expect((await get({ status: "CORRECT" })).total).toBe(4);
    // Completed = finished with a result: practice, training P3, class P1, question, set puzzle, line, rush.
    expect((await get({ status: "COMPLETED" })).total).toBe(7);
    // The completed class holds the class puzzle rows and both questions.
    expect((await get({ classId: w.a.class.id })).total).toBe(4);
    expect((await get({ classId: w.a.class.id, status: "INCORRECT", type: "CLASS_PUZZLE" })).total).toBe(1);
    expect((await get({ assignmentId: w.a.setDeployment.id })).total).toBe(1);
    // A range that ended long before any of it.
    expect((await get({ from: "2020-01-01", to: "2020-01-31" })).total).toBe(0);
  });

  it("summarises attempts, accuracy and first-try results from the same records", async () => {
    const res = await t.call(w.a.coach, "GET", API_ROUTES.progress.summary(w.a.student.id));
    expect(res.status).toBe(200);
    const s = (res.body as { summary: StudentActivitySummary }).summary;

    expect(s.totals).toEqual({
      activities: 11,
      attempted: 7,
      completed: 7,
      incomplete: 0,
      notStarted: 1,
      skipped: 1,
      unanswered: 2
    });
    // Graded tries: practice FAILED ✗ SOLVED ✓, training P3 ✗, class P1 ✗,
    // question ✓, set puzzle ✓, line FAILED ✗ COMPLETED ✓ → 4 / 8.
    expect(s.accuracy).toMatchObject({ accuracyPercent: 50, correctAttempts: 4, gradedAttempts: 8, smallSample: true });
    // Graded activities: practice ✓(2nd), P3 ✗, class P1 ✗, question ✓(1st), set ✓(1st), line ✓(2nd).
    expect(s.firstTry).toEqual({ firstTryCorrect: 2, gradedActivities: 6, percent: 33 });
    expect(s.puzzles).toEqual({ uniqueAttempted: 2, uniqueSolved: 1 });
    expect(s.byType.find((b) => b.type === "CLASS_QUESTION")).toMatchObject({ activities: 2, attempted: 1, gradedAttempts: 1 });

    // P1 went wrong twice (practice + class) but was solved in the end.
    expect(s.insights.repeatedMistakes).toEqual([
      expect.objectContaining({ eventuallySolved: true, incorrectAttempts: 2, puzzleId: ids.p1 })
    ]);
    expect(s.insights.trend.status).toBe("INSUFFICIENT_DATA");
    expect(s.facets.classes.map((c) => c.id).sort()).toEqual([w.a.class.id, w.a.liveClass.id].sort());
    expect(s.facets.batches).toEqual([{ id: w.a.batch.id, name: w.a.batch.name }]);
  });

  it("gives the student their own numbers without the unrevealed answer", async () => {
    const res = await t.call(w.a.student, "GET", API_ROUTES.progress.summaryMine);
    expect(res.status).toBe(200);
    const s = (res.body as { summary: StudentActivitySummary }).summary;
    expect(s.accuracy).toMatchObject({ correctAttempts: 3, gradedAttempts: 7 });
  });

  it("buckets by day in the viewer's own timezone and fills empty days", async () => {
    await t.prisma.user.update({ where: { id: w.admin.id }, data: { timezone: "America/Los_Angeles" } });
    const day = (offsetDays: number) =>
      new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: "America/Los_Angeles", year: "numeric" }).format(
        new Date(Date.now() + offsetDays * 86_400_000)
      );
    const range = `from=${day(-6)}&to=${day(0)}`;
    const res = await t.call(w.admin, "GET", `${API_ROUTES.progress.summary(w.a.student.id)}?${range}`);
    expect(res.status).toBe(200);
    const s = (res.body as { summary: StudentActivitySummary }).summary;
    expect(s.timeZone).toBe("America/Los_Angeles");
    expect(s.granularity).toBe("day");
    expect(s.series).toHaveLength(7);
    expect(s.series[0].bucket).toBe(day(-6));
    // Everything in the fixture happened within the last few hours.
    expect(s.series.reduce((n, p) => n + p.activities, 0)).toBe(7);
    expect(s.series.reduce((n, p) => n + p.gradedAttempts, 0)).toBe(8);
    const listed = await t.call(w.admin, "GET", `${API_ROUTES.progress.history(w.a.student.id)}?${range}`);
    expect((listed.body as StudentActivityHistoryResponse).total).toBe(11);
  });

  it("only lets the right people in", async () => {
    const history = API_ROUTES.progress.history(w.a.student.id);
    expect((await t.call(w.b.coach, "GET", history)).status).toBe(403);
    expect((await t.call(w.b.student, "GET", history)).status).toBe(403);
    expect((await t.call(null, "GET", history)).status).toBe(401);
    expect((await t.call(w.admin, "GET", history)).status).toBe(200);
    expect((await t.call(w.a.coach, "GET", API_ROUTES.progress.historyMine)).status).toBe(403);
    // A coach id is not a student.
    expect((await t.call(w.admin, "GET", API_ROUTES.progress.history(w.a.coach.id))).status).toBe(404);
  });

  it("rejects bad filters and a forged cursor", async () => {
    const path = API_ROUTES.progress.history(w.a.student.id);
    expect((await t.call(w.a.coach, "GET", `${path}?from=2026-02-01&to=2026-01-01`)).status).toBe(400);
    expect((await t.call(w.a.coach, "GET", `${path}?type=NOPE`)).status).toBe(400);
    expect((await t.call(w.a.coach, "GET", `${path}?limit=500`)).status).toBe(400);
    expect((await t.call(w.a.coach, "GET", `${path}?cursor=not-a-cursor`)).status).toBe(400);
  });
});

import {
  addDays,
  API_ROUTES,
  type DailyPuzzleScheduleResponse,
  type DailyPuzzleTodayResponse
} from "@nexa-chess/types";
import {
  PuzzleDifficulty,
  PuzzleStatus,
  PuzzleType,
  PuzzleVisibility,
  UserRole,
  UserStatus,
  type User
} from "@prisma/client";
import { Chess } from "../common/chess/chess";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createUser, resetDatabase } from "../test/integration/db";

// Puzzle of the Day on real Postgres (docs/PUZZLE_OF_THE_DAY.md): the shared
// automatic pick, a DAILY attempt solved through the ordinary routes, the
// computed streak, coach/admin overrides and the two switches.
const FEN = "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1";
const fenAfter = (() => {
  const chess = new Chess(FEN);
  chess.move("Ra8#");
  return chess.fen();
})();
const MATE = [{ fenAfter, ply: 1, san: "Ra8#", uci: "a1a8" }];

describe("Puzzle of the Day (real Postgres)", () => {
  let t: TestApp;
  let admin: User;
  let coachA: User;
  let coachB: User;
  let sam: User;
  let tara: User;
  let batchA: string;
  let batchB: string;
  let coachPuzzle: string;
  let today: string;

  async function active(role: UserRole, firstName: string) {
    const user = await createUser(t.prisma, role);
    return t.prisma.user.update({ data: { firstName, status: UserStatus.ACTIVE }, where: { id: user.id } });
  }
  async function puzzle(title: string, rating: number, over: Record<string, unknown> = {}) {
    const row = await t.prisma.puzzle.create({
      data: {
        createdByRole: UserRole.ADMIN,
        difficulty: PuzzleDifficulty.INTERMEDIATE,
        fen: FEN,
        puzzleType: PuzzleType.CHECKMATE,
        rating,
        solutionMovesJson: [{ san: "Ra8#", uci: "a1a8" }],
        status: PuzzleStatus.PUBLISHED,
        title,
        topicId: (await t.prisma.puzzleTopic.findFirstOrThrow()).id,
        visibility: PuzzleVisibility.GLOBAL,
        ...over
      }
    });
    return row.id;
  }
  const todayFor = async (user: User) => {
    const res = await t.call(user, "GET", API_ROUTES.dailyPuzzle.today);
    expect(res.status).toBe(200);
    return res.body as DailyPuzzleTodayResponse;
  };

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    admin = await active(UserRole.ADMIN, "Ada");
    coachA = await active(UserRole.COACH, "Cara");
    coachB = await active(UserRole.COACH, "Cole");
    sam = await active(UserRole.STUDENT, "Sam");
    tara = await active(UserRole.STUDENT, "Tara");
    batchA = (await t.prisma.batch.create({ data: { name: "A" } })).id;
    batchB = (await t.prisma.batch.create({ data: { name: "B" } })).id;
    await t.prisma.batchCoach.createMany({ data: [{ batchId: batchA, coachId: coachA.id }, { batchId: batchB, coachId: coachB.id }] });
    await t.prisma.batchStudent.createMany({ data: [{ batchId: batchA, studentId: sam.id }, { batchId: batchB, studentId: tara.id }] });

    await t.prisma.puzzleTopic.create({ data: { name: "Mates", slug: "mates" } });
    for (const [title, rating] of [["Easy 1", 1000], ["Easy 2", 1100], ["Medium 1", 1300], ["Medium 2", 1400], ["Hard 1", 1700], ["Hard 2", 1800]] as const) {
      await puzzle(title, rating);
    }
    await puzzle("Unpublished", 1300, { status: PuzzleStatus.DRAFT });
    coachPuzzle = await puzzle("Cara's own", 1000, {
      createdById: coachA.id,
      createdByRole: UserRole.COACH,
      visibility: PuzzleVisibility.PRIVATE
    });
  });
  afterAll(async () => {
    await t?.close();
  });

  it("gives every student the same three automatic puzzles, at their own level", async () => {
    const forSam = await todayFor(sam);
    today = forSam.day;
    expect(forSam).toMatchObject({ doneToday: false, enabled: true, myLevel: "MEDIUM", streak: 0 });
    expect(forSam.puzzles.map((p) => [p.level, p.rating! >= 800, p.result])).toEqual([
      ["EASY", true, null],
      ["MEDIUM", true, null],
      ["HARD", true, null]
    ]);
    const forTara = await todayFor(tara);
    expect(forTara.puzzles.map((p) => p.puzzleId)).toEqual(forSam.puzzles.map((p) => p.puzzleId));
    expect(await t.prisma.dailyPuzzle.count({ where: { kind: "AUTO" } })).toBe(3);
    const ratings = Object.fromEntries(forSam.puzzles.map((p) => [p.level, p.rating]));
    expect(ratings.EASY! < 1200 && ratings.MEDIUM! >= 1200 && ratings.MEDIUM! < 1600 && ratings.HARD! >= 1600).toBe(true);
  });

  it("solving it through the ordinary attempt routes finishes the day and starts a streak", async () => {
    const started = await t.call(sam, "POST", API_ROUTES.dailyPuzzle.start, { level: "MEDIUM" });
    expect(started.status).toBe(201);
    const { attemptId, puzzleId } = started.body as { attemptId: string; puzzleId: string };
    expect((await t.call(sam, "POST", API_ROUTES.dailyPuzzle.start, { level: "MEDIUM" })).body).toMatchObject({ attemptId });
    expect(await t.prisma.puzzleAttempt.findUnique({ where: { id: attemptId } })).toMatchObject({ context: "DAILY" });

    const submit = await t.call(sam, "POST", API_ROUTES.puzzles.submitAttempt(puzzleId, attemptId), { moves: MATE });
    expect(submit.status).toBe(201);
    const after = await todayFor(sam);
    expect(after).toMatchObject({ doneToday: true, streak: 1 });
    expect(after.puzzles.find((p) => p.level === "MEDIUM")?.result).toBe("SOLVED");
    // It also counts as a practice day.
    expect(await t.prisma.studentProgress.findUnique({ where: { studentId: sam.id } })).toMatchObject({ currentStreak: 1 });
  });

  it("the streak counts back over earlier finished days", async () => {
    for (const back of [1, 2, 4]) {
      const id = await puzzle(`Old ${back}`, 1300);
      const attempt = await t.prisma.puzzleAttempt.create({
        data: { attemptNumber: 1, context: "DAILY", puzzleId: id, studentId: sam.id }
      });
      await t.prisma.dailyPuzzleEntry.create({
        data: {
          attemptId: attempt.id,
          day: new Date(`${addDays(today, -back)}T00:00:00Z`),
          finishedAt: new Date(),
          level: "MEDIUM",
          puzzleId: id,
          solved: false,
          studentId: sam.id
        }
      });
    }
    expect(await todayFor(sam)).toMatchObject({ bestStreak: 3, streak: 3 });
  });

  it("a coach overrides a level for their own batch only", async () => {
    const res = await t.call(coachA, "PUT", API_ROUTES.dailyPuzzle.overrides, {
      batchId: batchA,
      day: today,
      level: "EASY",
      puzzleId: coachPuzzle
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ overridden: true, puzzle: { id: coachPuzzle }, source: "BATCH" });
    expect((await todayFor(sam)).puzzles.find((p) => p.level === "EASY")?.puzzleId).toBe(coachPuzzle);
    expect((await todayFor(tara)).puzzles.find((p) => p.level === "EASY")?.puzzleId).not.toBe(coachPuzzle);

    const other = await t.call(coachA, "PUT", API_ROUTES.dailyPuzzle.overrides, { batchId: batchB, day: today, level: "EASY", puzzleId: coachPuzzle });
    expect(other.status).toBe(404);
    // Coach B's students can't open Cara's private puzzle, so B's override refuses it.
    const notTheirs = await t.call(coachB, "PUT", API_ROUTES.dailyPuzzle.overrides, { batchId: batchB, day: today, level: "EASY", puzzleId: coachPuzzle });
    expect(notTheirs.status).toBe(400);
    expect((await t.call(coachA, "PUT", API_ROUTES.dailyPuzzle.overrides, { day: today, level: "EASY", puzzleId: coachPuzzle })).status).toBe(403);
  });

  it("an admin overrides the academy ahead of time, never a past day", async () => {
    const tomorrow = addDays(today, 1);
    const hard = await puzzle("Admin pick", 1900);
    const res = await t.call(admin, "PUT", API_ROUTES.dailyPuzzle.overrides, { day: tomorrow, level: "HARD", puzzleId: hard });
    expect(res.status).toBe(200);
    const schedule = (await t.call(coachA, "GET", `${API_ROUTES.dailyPuzzle.schedule}?batchId=${batchA}`)).body as DailyPuzzleScheduleResponse;
    expect(schedule.slots).toHaveLength(42);
    expect(schedule.slots.find((s) => s.day === tomorrow && s.level === "HARD")).toMatchObject({
      overridden: false,
      puzzle: { id: hard },
      source: "ACADEMY"
    });
    expect(schedule.slots.find((s) => s.day === today && s.level === "EASY")).toMatchObject({ overridden: true, source: "BATCH" });
    expect(schedule.slots.find((s) => s.day === tomorrow && s.level === "EASY")).toMatchObject({ puzzle: null, source: null });

    const past = await t.call(admin, "PUT", API_ROUTES.dailyPuzzle.overrides, { day: addDays(today, -1), level: "HARD", puzzleId: hard });
    expect(past.status).toBe(400);
    const draft = await t.prisma.puzzle.findFirstOrThrow({ where: { title: "Unpublished" } });
    expect((await t.call(admin, "PUT", API_ROUTES.dailyPuzzle.overrides, { day: tomorrow, level: "HARD", puzzleId: draft.id })).status).toBe(400);
  });

  it("a coach turns it off for their batch, an admin for the academy", async () => {
    expect((await t.call(coachA, "PATCH", API_ROUTES.dailyPuzzle.batch(batchA), { enabled: false })).status).toBe(200);
    expect(await todayFor(sam)).toMatchObject({ enabled: false, puzzles: [], streak: 3 });
    expect((await t.call(sam, "POST", API_ROUTES.dailyPuzzle.start, { level: "EASY" })).status).toBe(403);
    expect((await todayFor(tara)).enabled).toBe(true);
    expect((await t.call(coachA, "PATCH", API_ROUTES.dailyPuzzle.batch(batchB), { enabled: false })).status).toBe(404);

    expect((await t.call(coachA, "PUT", API_ROUTES.dailyPuzzle.settings, { enabled: false })).status).toBe(403);
    expect((await t.call(admin, "PUT", API_ROUTES.dailyPuzzle.settings, { enabled: false })).status).toBe(200);
    expect((await todayFor(tara)).enabled).toBe(false);
  });
});

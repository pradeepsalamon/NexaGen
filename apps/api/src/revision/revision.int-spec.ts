/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  API_ROUTES,
  type RevisionNextResponse,
  type RevisionReportResponse,
  type RevisionReviewResponse,
  type RevisionSessionResponse,
  type StudentActivityHistoryResponse
} from "@nexa-chess/types";
import { PuzzleDifficulty, PuzzleStatus, PuzzleType, PuzzleVisibility, UserRole, type User } from "@prisma/client";
import { createTestApp, type TestApp } from "../test/integration/app";
import { MISTAKE_BATCH } from "./revision.service";
import { resetDatabase } from "../test/integration/db";
import { createWorld } from "../test/integration/access/world";

// Smart Revision end to end through the real app: mistake seeding from real
// attempts, the session → solve → rate loop on the ordinary attempt routes,
// grade caps the client can't talk past, idempotency, and who may see or
// change whose revision.

const FEN = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";
const MATE = { fenAfter: "R5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 1 1", ply: 1, san: "Ra8#", uci: "a1a8" };
const WRONG = { fenAfter: "6k1/5ppp/8/8/8/8/R4PPP/6K1 b - - 1 1", ply: 1, san: "Ra2", uci: "a1a2" };
const DAY = 24 * 60 * 60 * 1000;

describe("Smart Revision (real app, real Postgres)", () => {
  let t: TestApp;
  let w: Awaited<ReturnType<typeof createWorld>>;

  const puzzle = (coach: User, title: string, extra: Record<string, unknown> = {}) =>
    t.prisma.puzzle.create({
      data: {
        createdById: coach.id,
        createdByRole: UserRole.COACH,
        difficulty: PuzzleDifficulty.EASY,
        fen: FEN,
        puzzleType: PuzzleType.CHECKMATE,
        solutionMovesJson: [{ san: "Ra8#", uci: "a1a8" }],
        status: PuzzleStatus.PUBLISHED,
        tags: ["mateIn1", "backRankMate"],
        title,
        topicId: w.a.privatePuzzle.topicId,
        visibility: PuzzleVisibility.PRIVATE,
        ...extra
      }
    });

  /** Plays one move then submits, through the same routes the web solver uses. */
  async function solve(student: User, puzzleId: string, attemptId: string, moves: (typeof MATE)[]) {
    const start = await t.call(student, "POST", API_ROUTES.puzzles.attempts(puzzleId));
    expect(start.status).toBe(201);
    expect((start.body as any).attempt.attempt.id).toBe(attemptId);
    for (const m of moves) {
      const saved = await t.call(student, "PATCH", API_ROUTES.puzzles.attempt(puzzleId, attemptId), { moves: [m] });
      expect(saved.status).toBe(200);
    }
    const last = moves[moves.length - 1];
    const submitted = await t.call(student, "POST", API_ROUTES.puzzles.submitAttempt(puzzleId, attemptId), {
      moves: last === MATE ? [MATE] : []
    });
    expect(submitted.status).toBe(201);
    return submitted.body as any;
  }

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    w = await createWorld(t.prisma);
    for (const s of [w.a.student, w.b.student]) {
      await t.prisma.user.update({ where: { id: s.id }, data: { timezone: "Asia/Kolkata" } });
    }
  });

  afterAll(async () => {
    await t?.close();
  });

  describe("mistake seeding", () => {
    it("seeds only attempts that show a mistake, never from an open homework set, once each", async () => {
      const a = w.a;
      const missed = await puzzle(a.coach, "Missed it");
      const slipped = await puzzle(a.coach, "Slipped once");
      const hinted = await puzzle(a.coach, "Needed a hint");
      const gaveUp = await puzzle(a.coach, "Viewed solution");
      const inSet = await puzzle(a.coach, "Open homework");
      const yesterday = new Date(Date.now() - DAY);
      const attempt = (puzzleId: string, data: Record<string, unknown>) =>
        t.prisma.puzzleAttempt.create({
          data: { attemptNumber: 1, completedAt: yesterday, puzzleId, studentId: a.student.id, ...data } as any
        });
      await attempt(missed.id, { movesJson: [WRONG], status: "FAILED" });
      await attempt(slipped.id, { movesJson: [MATE], status: "SOLVED", wrongMoves: 1 });
      await attempt(hinted.id, { hintsUsed: 2, movesJson: [MATE], status: "SOLVED" });
      await attempt(gaveUp.id, { status: "FAILED" });
      await attempt(inSet.id, {
        context: "ASSIGNMENT",
        movesJson: [WRONG],
        status: "FAILED",
        studentAssignmentId: a.setStudentAssignment.id,
        wrongMoves: 1
      });

      for (let i = 0; i < 2; i += 1) {
        const res = await t.call(a.student, "GET", API_ROUTES.revision.summaryMine);
        expect(res.status).toBe(200);
      }
      const items = await t.prisma.revisionItem.findMany({ where: { studentId: a.student.id } });
      expect(items.map((i) => i.puzzleId).sort()).toEqual([missed.id, slipped.id].sort());
      expect(items.every((i) => i.source === "MISTAKE")).toBe(true);
      // First due the local day after the miss, so it is available today.
      expect(items.every((i) => i.dueAt.getTime() <= Date.now())).toBe(true);

      const summary = ((await t.call(a.student, "GET", API_ROUTES.revision.summaryMine)).body as any).summary;
      expect(summary).toMatchObject({ dueToday: 0, newAvailable: 2, overdue: 0, sessionSize: 2 });
    });
  });

  describe("the review loop", () => {
    it("next → solve → rate schedules the item; a replay doesn't record twice", async () => {
      const a = w.a;
      const first = (await t.call(a.student, "POST", API_ROUTES.revision.next)).body as RevisionNextResponse;
      expect(first.current).not.toBeNull();
      const cur = first.current!;
      // A double click answers with the same open item, not a second attempt.
      const again = (await t.call(a.student, "POST", API_ROUTES.revision.next)).body as RevisionNextResponse;
      expect(again.current?.attemptId).toBe(cur.attemptId);
      const session = (await t.call(a.student, "GET", API_ROUTES.revision.sessionMine)).body as RevisionSessionResponse;
      expect(session.current?.itemId).toBe(cur.itemId);
      expect(session.queue[0].itemId).toBe(cur.itemId);
      // The queue never carries a puzzle's position or line.
      expect(JSON.stringify(session)).not.toContain("a1a8");

      // Rating before finishing is refused.
      const early = await t.call(a.student, "POST", API_ROUTES.revision.review, { attemptId: cur.attemptId, grade: "GOOD" });
      expect(early.status).toBe(400);

      const result = await solve(a.student, cur.puzzleId, cur.attemptId, [MATE]);
      expect(result.solved).toBe(true);

      const rated = await t.call(a.student, "POST", API_ROUTES.revision.review, { attemptId: cur.attemptId, grade: "EASY" });
      expect(rated.status).toBe(201);
      const body = rated.body as RevisionReviewResponse;
      expect(body).toMatchObject({ grade: "EASY", intervalDays: 7, outcome: "CLEAN" });
      expect(new Date(body.dueAt).getTime()).toBeGreaterThan(Date.now() + 6 * DAY);

      const replay = await t.call(a.student, "POST", API_ROUTES.revision.review, { attemptId: cur.attemptId, grade: "AGAIN" });
      expect(replay.status).toBe(201);
      expect((replay.body as RevisionReviewResponse).grade).toBe("EASY");
      expect(await t.prisma.revisionReview.count({ where: { attemptId: cur.attemptId } })).toBe(1);
      const item = await t.prisma.revisionItem.findUniqueOrThrow({ where: { id: cur.itemId } });
      expect(item).toMatchObject({ currentAttemptId: null, intervalDays: 7, lastGrade: "EASY", reviewCount: 1 });
    });

    it("a failed solve can't be rated better than Again, and a wrong move caps it at Hard", async () => {
      const a = w.a;
      const cur = ((await t.call(a.student, "POST", API_ROUTES.revision.next)).body as RevisionNextResponse).current!;
      const result = await solve(a.student, cur.puzzleId, cur.attemptId, [WRONG]);
      expect(result.solved).toBe(false);
      for (const grade of ["EASY", "GOOD", "HARD"]) {
        const forged = await t.call(a.student, "POST", API_ROUTES.revision.review, { attemptId: cur.attemptId, grade });
        expect(forged.status).toBe(400);
      }
      const ok = await t.call(a.student, "POST", API_ROUTES.revision.review, { attemptId: cur.attemptId, grade: "AGAIN" });
      expect(ok.status).toBe(201);
      const body = ok.body as RevisionReviewResponse;
      expect(body.outcome).toBe("FAILED");
      // Back in ten minutes, not now: no immediate retry loop.
      expect(new Date(body.dueAt).getTime()).toBeGreaterThan(Date.now() + 9 * 60_000);
      expect(body.summary.sessionSize).toBe(0);

      // Wrong move then the right one: "Hard" at best.
      const p = await puzzle(a.coach, "Assisted");
      await t.call(w.a.coach, "POST", API_ROUTES.revision.recommend(a.student.id), { puzzleIds: [p.id] });
      const next = ((await t.call(a.student, "POST", API_ROUTES.revision.next)).body as RevisionNextResponse).current!;
      expect(next.puzzleId).toBe(p.id);
      expect(next.source).toBe("COACH");
      await solve(a.student, next.puzzleId, next.attemptId, [WRONG, MATE]);
      expect((await t.call(a.student, "POST", API_ROUTES.revision.review, { attemptId: next.attemptId, grade: "GOOD" })).status).toBe(400);
      const hard = await t.call(a.student, "POST", API_ROUTES.revision.review, { attemptId: next.attemptId, grade: "HARD" });
      expect(hard.status).toBe(201);
      expect((hard.body as RevisionReviewResponse).outcome).toBe("ASSISTED");
    });

    it("skip moves an item to the back without changing its schedule", async () => {
      const a = w.a;
      const p1 = await puzzle(a.coach, "Skip me");
      const p2 = await puzzle(a.coach, "Then me");
      await t.call(a.coach, "POST", API_ROUTES.revision.recommend(a.student.id), { puzzleIds: [p1.id, p2.id] });
      const cur = ((await t.call(a.student, "POST", API_ROUTES.revision.next)).body as RevisionNextResponse).current!;
      const before = await t.prisma.revisionItem.findUniqueOrThrow({ where: { id: cur.itemId } });
      const skipped = await t.call(a.student, "POST", API_ROUTES.revision.skip, { itemId: cur.itemId });
      expect(skipped.status).toBe(201);
      const after = await t.prisma.revisionItem.findUniqueOrThrow({ where: { id: cur.itemId } });
      expect(after.dueAt.getTime()).toBe(before.dueAt.getTime());
      expect(after.currentAttemptId).toBeNull();
      expect((await t.prisma.puzzleAttempt.findUniqueOrThrow({ where: { id: cur.attemptId } })).status).toBe("ABANDONED");
      const next = ((await t.call(a.student, "POST", API_ROUTES.revision.next)).body as RevisionNextResponse).current!;
      expect(next.itemId).not.toBe(cur.itemId);
      // Clean up for later tests: rate it.
      await solve(a.student, next.puzzleId, next.attemptId, [MATE]);
      await t.call(a.student, "POST", API_ROUTES.revision.review, { attemptId: next.attemptId, grade: "GOOD" });
    });

    it("an item whose puzzle is archived drops out of the queue and is reported unavailable", async () => {
      const a = w.a;
      const p = await puzzle(a.coach, "Soon archived");
      await t.call(a.coach, "POST", API_ROUTES.revision.recommend(a.student.id), { puzzleIds: [p.id] });
      await t.prisma.puzzle.update({ where: { id: p.id }, data: { status: PuzzleStatus.ARCHIVED } });
      const session = (await t.call(a.student, "GET", API_ROUTES.revision.sessionMine)).body as RevisionSessionResponse;
      const item = await t.prisma.revisionItem.findFirstOrThrow({ where: { puzzleId: p.id } });
      expect(session.queue.map((q) => q.itemId)).not.toContain(item.id);
      expect(session.summary.unavailableItems).toBeGreaterThanOrEqual(1);
      const report = (await t.call(a.student, "GET", API_ROUTES.revision.reportMine)).body as RevisionReportResponse;
      expect(report.items.find((i) => i.itemId === item.id)?.available).toBe(false);
    });

    it("a folder (concept) item is reviewed by solving one of its puzzles", async () => {
      const a = w.a;
      const folder = await t.prisma.puzzleTopic.create({ data: { name: "Back-rank mates", slug: "back-rank" } });
      const p = await puzzle(a.coach, "Folder puzzle", { topicId: folder.id });
      const rec = await t.call(a.coach, "POST", API_ROUTES.revision.recommend(a.student.id), { note: "Revise this", topicId: folder.id });
      expect(rec.status).toBe(201);
      // Drain everything else so the folder item comes up.
      for (let i = 0; i < 10; i += 1) {
        const cur = ((await t.call(a.student, "POST", API_ROUTES.revision.next)).body as RevisionNextResponse).current;
        if (!cur) break;
        if (cur.kind === "TOPIC") {
          expect(cur.topicName).toBe("Back-rank mates");
          expect(cur.note).toBe("Revise this");
          expect(cur.puzzleId).toBe(p.id);
          await solve(a.student, cur.puzzleId, cur.attemptId, [MATE]);
          const r = await t.call(a.student, "POST", API_ROUTES.revision.review, { attemptId: cur.attemptId, grade: "GOOD" });
          expect((r.body as RevisionReviewResponse).intervalDays).toBe(3);
          return;
        }
        await t.call(a.student, "POST", API_ROUTES.revision.skip, { itemId: cur.itemId });
      }
      throw new Error("folder item never came up");
    });
  });

  describe("activity history", () => {
    it("lists revision reviews as REVISION_PUZZLE, one entry per puzzle", async () => {
      const res = await t.call(w.a.student, "GET", `${API_ROUTES.progress.historyMine}?type=REVISION_PUZZLE&pageSize=50`);
      expect(res.status).toBe(200);
      const entries = (res.body as StudentActivityHistoryResponse).entries;
      const attempts = await t.prisma.puzzleAttempt.findMany({ where: { context: "REVISION", studentId: w.a.student.id } });
      const puzzles = new Set(attempts.map((x) => x.puzzleId));
      expect(entries.length).toBe(puzzles.size);
      expect(entries.every((e) => e.type === "REVISION_PUZZLE")).toBe(true);
    });
  });

  describe("access", () => {
    it("students only ever see their own revision", async () => {
      const { a, b } = w;
      expect((await t.call(b.student, "GET", API_ROUTES.revision.student(a.student.id))).status).toBe(403);
      expect((await t.call(a.coach, "GET", API_ROUTES.revision.summaryMine)).status).toBe(403);
      // B can't rate A's open attempt.
      const cur = ((await t.call(a.student, "POST", API_ROUTES.revision.next)).body as RevisionNextResponse).current;
      if (cur) {
        expect((await t.call(b.student, "POST", API_ROUTES.revision.review, { attemptId: cur.attemptId, grade: "AGAIN" })).status).toBe(404);
        expect((await t.call(b.student, "POST", API_ROUTES.revision.skip, { itemId: cur.itemId })).status).toBe(404);
      }
    });

    it("a coach sees and recommends only for students in their batches", async () => {
      const { a, b } = w;
      expect((await t.call(a.coach, "GET", API_ROUTES.revision.student(a.student.id))).status).toBe(200);
      expect((await t.call(a.coach, "GET", API_ROUTES.revision.student(b.student.id))).status).toBe(403);
      const p = await puzzle(a.coach, "For B?");
      expect((await t.call(a.coach, "POST", API_ROUTES.revision.recommend(b.student.id), { puzzleIds: [p.id] })).status).toBe(403);
      // A's coach can't push B's coach's private puzzle (A's student can't open it either).
      const bp = await puzzle(b.coach, "B private");
      expect((await t.call(a.coach, "POST", API_ROUTES.revision.recommend(a.student.id), { puzzleIds: [bp.id] })).status).toBe(400);
      // Even B's coach can't give it to A's student — not their student.
      expect((await t.call(b.coach, "POST", API_ROUTES.revision.recommend(a.student.id), { puzzleIds: [bp.id] })).status).toBe(403);
      expect((await t.call(w.admin, "GET", API_ROUTES.revision.student(b.student.id))).status).toBe(200);
    });

    it("recommending twice updates the item instead of duplicating it", async () => {
      const { a } = w;
      const p = await puzzle(a.coach, "Twice");
      const one = await t.call(a.coach, "POST", API_ROUTES.revision.recommend(a.student.id), { puzzleIds: [p.id] });
      const two = await t.call(a.coach, "POST", API_ROUTES.revision.recommend(a.student.id), { puzzleIds: [p.id] });
      expect(one.body).toEqual({ added: 1, updated: 0 });
      expect(two.body).toEqual({ added: 0, updated: 1 });
      expect(await t.prisma.revisionItem.count({ where: { puzzleId: p.id, studentId: a.student.id } })).toBe(1);
    });

    it("only the recommending coach or an admin can remove a recommendation", async () => {
      const { a } = w;
      const other = await t.prisma.user.create({
        data: { email: "coach-2@int.test", firstName: "Second", password: "x", role: UserRole.COACH, status: "ACTIVE" }
      });
      await t.prisma.batchCoach.create({ data: { batchId: a.batch.id, coachId: other.id } });
      const p = await puzzle(a.coach, "Removable");
      await t.call(a.coach, "POST", API_ROUTES.revision.recommend(a.student.id), { puzzleIds: [p.id] });
      const item = await t.prisma.revisionItem.findFirstOrThrow({ where: { puzzleId: p.id } });

      const report = (await t.call(other, "GET", API_ROUTES.revision.student(a.student.id))).body as RevisionReportResponse;
      expect(report.items.find((i) => i.itemId === item.id)?.canRemove).toBe(false);
      expect((await t.call(other, "DELETE", API_ROUTES.revision.recommendation(a.student.id, item.id))).status).toBe(403);
      expect((await t.call(a.student, "DELETE", API_ROUTES.revision.recommendation(a.student.id, item.id))).status).toBe(403);
      // An id from another student's list is a 404 under this student.
      expect((await t.call(w.b.coach, "DELETE", API_ROUTES.revision.recommendation(w.b.student.id, item.id))).status).toBe(404);

      expect((await t.call(a.coach, "DELETE", API_ROUTES.revision.recommendation(a.student.id, item.id))).status).toBe(200);
      expect((await t.prisma.revisionItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe("REMOVED");
      // Removed stays removed — a later sync or session never revives it.
      await t.call(a.student, "GET", API_ROUTES.revision.sessionMine);
      expect((await t.prisma.revisionItem.findUniqueOrThrow({ where: { id: item.id } })).status).toBe("REMOVED");
    });

    it("the coach report carries trends and attempt accuracy separately from recall", async () => {
      const report = (await t.call(w.a.coach, "GET", API_ROUTES.revision.student(w.a.student.id))).body as RevisionReportResponse;
      const reviews = await t.prisma.revisionReview.findMany({ where: { studentId: w.a.student.id } });
      expect(report.weeks).toHaveLength(8);
      expect(report.weeks.reduce((n, wk) => n + wk.reviews, 0)).toBe(reviews.length);
      expect(Object.values(report.gradeCounts).reduce((n, c) => n + c, 0)).toBe(reviews.length);
      expect(report.attempts.graded).toBeGreaterThanOrEqual(report.attempts.solved);
      expect(report.missedThemes.map((m) => m.theme)).toContain("backRankMate");
    });
  });

  // ── Pre-release review (2026-10-16) regressions ──

  let seq = 0;
  async function freshStudent() {
    seq += 1;
    const student = await t.prisma.user.create({
      data: { email: `rev-${seq}@int.test`, firstName: `Rev ${seq}`, password: "x", role: UserRole.STUDENT, status: "ACTIVE", timezone: "Asia/Kolkata" }
    });
    await t.prisma.batchStudent.create({ data: { batchId: w.a.batch.id, studentId: student.id } });
    return student;
  }

  describe("an unfinished or unrated review is never graded for the student", () => {
    it("a finished but unrated review stays pending — no review row, no schedule change — until rated", async () => {
      const s = await freshStudent();
      const p = await puzzle(w.a.coach, "Pending one");
      await t.call(w.a.coach, "POST", API_ROUTES.revision.recommend(s.id), { puzzleIds: [p.id] });
      const cur = ((await t.call(s, "POST", API_ROUTES.revision.next)).body as RevisionNextResponse).current!;
      expect(cur.pendingRating).toBeNull();
      await solve(s, cur.puzzleId, cur.attemptId, [MATE]);
      const before = await t.prisma.revisionItem.findUniqueOrThrow({ where: { id: cur.itemId } });

      // The tab closed. Every later read leaves it pending instead of inferring a rating.
      for (const route of [API_ROUTES.revision.sessionMine, API_ROUTES.revision.summaryMine, API_ROUTES.revision.reportMine]) {
        expect((await t.call(s, "GET", route)).status).toBe(200);
      }
      const session = (await t.call(s, "GET", API_ROUTES.revision.sessionMine)).body as RevisionSessionResponse;
      expect(session.current).toMatchObject({ attemptId: cur.attemptId, pendingRating: { allowedGrades: ["AGAIN", "HARD", "GOOD", "EASY"], outcome: "CLEAN" } });
      const resumed = ((await t.call(s, "POST", API_ROUTES.revision.next)).body as RevisionNextResponse).current!;
      expect(resumed.attemptId).toBe(cur.attemptId);
      expect(await t.prisma.revisionReview.count({ where: { itemId: cur.itemId } })).toBe(0);
      const after = await t.prisma.revisionItem.findUniqueOrThrow({ where: { id: cur.itemId } });
      expect(after).toMatchObject({ currentAttemptId: cur.attemptId, dueAt: before.dueAt, intervalDays: 0, lastGrade: null, reviewCount: 0 });
      // It can't be skipped past either — it has to be rated.
      expect((await t.call(s, "POST", API_ROUTES.revision.skip, { itemId: cur.itemId })).status).toBe(409);

      const rated = await t.call(s, "POST", API_ROUTES.revision.review, { attemptId: cur.attemptId, grade: "HARD" });
      expect(rated.status).toBe(201);
      expect((rated.body as RevisionReviewResponse).intervalDays).toBe(1);
    });

    it("a skip with no evidence leaves the schedule alone; a skip after a wrong move records Again, never better", async () => {
      const s = await freshStudent();
      const p1 = await puzzle(w.a.coach, "Skip clean");
      const p2 = await puzzle(w.a.coach, "Skip after a slip");
      await t.call(w.a.coach, "POST", API_ROUTES.revision.recommend(s.id), { puzzleIds: [p1.id, p2.id] });
      const first = ((await t.call(s, "POST", API_ROUTES.revision.next)).body as RevisionNextResponse).current!;
      await t.call(s, "POST", API_ROUTES.revision.skip, { itemId: first.itemId });
      expect(await t.prisma.revisionItem.findUniqueOrThrow({ where: { id: first.itemId } })).toMatchObject({ intervalDays: 0, reviewCount: 0 });

      const second = ((await t.call(s, "POST", API_ROUTES.revision.next)).body as RevisionNextResponse).current!;
      expect(second.itemId).not.toBe(first.itemId);
      await t.call(s, "POST", API_ROUTES.puzzles.attempts(second.puzzleId));
      await t.call(s, "PATCH", API_ROUTES.puzzles.attempt(second.puzzleId, second.attemptId), { moves: [WRONG] });
      await t.call(s, "POST", API_ROUTES.revision.skip, { itemId: second.itemId });
      const reviews = await t.prisma.revisionReview.findMany({ where: { itemId: second.itemId } });
      expect(reviews.map((r) => [r.grade, r.outcome])).toEqual([["AGAIN", "FAILED"]]);
    });
  });

  describe("server-side validation", () => {
    it("a hint caps the rating at Hard", async () => {
      const s = await freshStudent();
      const p = await puzzle(w.a.coach, "Hinted");
      await t.call(w.a.coach, "POST", API_ROUTES.revision.recommend(s.id), { puzzleIds: [p.id] });
      const cur = ((await t.call(s, "POST", API_ROUTES.revision.next)).body as RevisionNextResponse).current!;
      await t.call(s, "POST", API_ROUTES.puzzles.attempts(cur.puzzleId));
      const hint = await t.call(s, "POST", API_ROUTES.puzzles.hint(cur.puzzleId, cur.attemptId), { level: 1, moves: [] });
      expect(hint.status).toBe(201);
      await t.call(s, "PATCH", API_ROUTES.puzzles.attempt(cur.puzzleId, cur.attemptId), { moves: [MATE] });
      await t.call(s, "POST", API_ROUTES.puzzles.submitAttempt(cur.puzzleId, cur.attemptId), { moves: [MATE] });
      const session = (await t.call(s, "GET", API_ROUTES.revision.sessionMine)).body as RevisionSessionResponse;
      expect(session.current?.pendingRating).toEqual({ allowedGrades: ["AGAIN", "HARD"], outcome: "ASSISTED" });
      for (const grade of ["GOOD", "EASY"]) {
        expect((await t.call(s, "POST", API_ROUTES.revision.review, { attemptId: cur.attemptId, grade })).status).toBe(400);
      }
      expect((await t.call(s, "POST", API_ROUTES.revision.review, { attemptId: cur.attemptId, grade: "HARD" })).status).toBe(201);
    });

    it("concurrent ratings of one attempt record exactly one review", async () => {
      const s = await freshStudent();
      const p = await puzzle(w.a.coach, "Raced");
      await t.call(w.a.coach, "POST", API_ROUTES.revision.recommend(s.id), { puzzleIds: [p.id] });
      const cur = ((await t.call(s, "POST", API_ROUTES.revision.next)).body as RevisionNextResponse).current!;
      await solve(s, cur.puzzleId, cur.attemptId, [MATE]);
      const results = await Promise.all(
        (["GOOD", "EASY", "HARD", "GOOD", "EASY"] as const).map((grade) =>
          t.call(s, "POST", API_ROUTES.revision.review, { attemptId: cur.attemptId, grade })
        )
      );
      expect(results.every((r) => r.status === 201)).toBe(true);
      const grades = new Set(results.map((r) => (r.body as RevisionReviewResponse).grade));
      expect(grades.size).toBe(1);
      expect(await t.prisma.revisionReview.count({ where: { attemptId: cur.attemptId } })).toBe(1);
      expect((await t.prisma.revisionItem.findUniqueOrThrow({ where: { id: cur.itemId } })).reviewCount).toBe(1);
    });

    it("concurrent next calls open one attempt", async () => {
      const s = await freshStudent();
      const p = await puzzle(w.a.coach, "Double click");
      await t.call(w.a.coach, "POST", API_ROUTES.revision.recommend(s.id), { puzzleIds: [p.id] });
      // The harness creates the caller's session row on first use — make that once, then race.
      await t.call(s, "GET", API_ROUTES.revision.reportMine);
      const results = await Promise.all([1, 2, 3, 4].map(() => t.call(s, "POST", API_ROUTES.revision.next)));
      const ids = new Set(results.map((r) => (r.body as RevisionNextResponse).current?.attemptId));
      expect(ids.size).toBe(1);
      expect(await t.prisma.puzzleAttempt.count({ where: { context: "REVISION", studentId: s.id } })).toBe(1);
    });

    it("an attempt that isn't the item's open revision attempt can't be rated — own or anyone else's", async () => {
      const s = await freshStudent();
      const p = await puzzle(w.a.coach, "Not via revision");
      const direct = await t.prisma.puzzleAttempt.create({
        data: { attemptNumber: 1, completedAt: new Date(), movesJson: [MATE], puzzleId: p.id, status: "SOLVED", studentId: s.id }
      });
      expect((await t.call(s, "POST", API_ROUTES.revision.review, { attemptId: direct.id, grade: "EASY" })).status).toBe(404);
      const recorded = await t.prisma.revisionReview.findFirstOrThrow({ where: { studentId: w.a.student.id } });
      expect((await t.call(s, "POST", API_ROUTES.revision.review, { attemptId: recorded.attemptId, grade: "EASY" })).status).toBe(404);
      expect(await t.prisma.revisionReview.count({ where: { studentId: s.id } })).toBe(0);
    });

    it("a submitted wrong line is graded failed by the server whatever the client claims", async () => {
      const s = await freshStudent();
      const p = await puzzle(w.a.coach, "Forged");
      await t.call(w.a.coach, "POST", API_ROUTES.revision.recommend(s.id), { puzzleIds: [p.id] });
      const cur = ((await t.call(s, "POST", API_ROUTES.revision.next)).body as RevisionNextResponse).current!;
      await t.call(s, "POST", API_ROUTES.puzzles.attempts(cur.puzzleId));
      const submitted = await t.call(s, "POST", API_ROUTES.puzzles.submitAttempt(cur.puzzleId, cur.attemptId), {
        moves: [{ ...WRONG, correct: true }]
      });
      expect((submitted.body as any).solved).toBe(false);
      expect((await t.call(s, "POST", API_ROUTES.revision.review, { attemptId: cur.attemptId, grade: "GOOD" })).status).toBe(400);
    });
  });

  describe("activity history integrity", () => {
    it("a puzzle missed in practice then revised twice is two history entries — practice and revision — never one per attempt", async () => {
      const s = await freshStudent();
      const p = await puzzle(w.a.coach, "History check");
      await t.prisma.puzzleAttempt.create({
        data: { attemptNumber: 1, completedAt: new Date(Date.now() - 2 * DAY), movesJson: [WRONG], puzzleId: p.id, status: "FAILED", studentId: s.id, wrongMoves: 1 }
      });
      for (const moves of [[WRONG], [MATE]]) {
        await t.prisma.revisionItem.updateMany({ where: { studentId: s.id }, data: { dueAt: new Date(Date.now() - 60_000) } });
        const cur = ((await t.call(s, "POST", API_ROUTES.revision.next)).body as RevisionNextResponse).current!;
        expect(cur.puzzleId).toBe(p.id);
        await solve(s, cur.puzzleId, cur.attemptId, moves);
        await t.call(s, "POST", API_ROUTES.revision.review, { attemptId: cur.attemptId, grade: moves[0] === MATE ? "GOOD" : "AGAIN" });
      }
      const res = await t.call(s, "GET", `${API_ROUTES.progress.historyMine}?pageSize=50`);
      const entries = (res.body as StudentActivityHistoryResponse).entries.filter((e) => e.puzzle?.id === p.id);
      expect(entries.map((e) => e.type).sort()).toEqual(["PRACTICE_PUZZLE", "REVISION_PUZZLE"]);
      const revision = entries.find((e) => e.type === "REVISION_PUZZLE") as any;
      expect(revision.attempts).toBe(2);
      expect(revision.outcome).toBe("CORRECT");
    });
  });

  describe("mistake seeding is complete, bounded and repeatable", () => {
    it("works through a long history in batches, never duplicates, and isn't starved by newer no-move misses", async () => {
      const s = await freshStudent();
      const old = new Date(Date.now() - 400 * DAY);
      const TOTAL = MISTAKE_BATCH * 2 + 50;
      const ids = Array.from({ length: TOTAL }, (_, i) => `rev-hist-${String(i).padStart(4, "0")}`);
      await t.prisma.puzzle.createMany({
        data: ids.map((id, i) => ({
          createdById: w.a.coach.id,
          createdByRole: UserRole.COACH,
          difficulty: PuzzleDifficulty.EASY,
          fen: FEN,
          id,
          puzzleType: PuzzleType.CHECKMATE,
          solutionMovesJson: [{ san: "Ra8#", uci: "a1a8" }],
          status: PuzzleStatus.PUBLISHED,
          title: `History ${i}`,
          topicId: w.a.privatePuzzle.topicId,
          visibility: PuzzleVisibility.PRIVATE
        }))
      });
      // Each old puzzle: missed once, then missed again later (one item, seeded from the FIRST miss).
      await t.prisma.puzzleAttempt.createMany({
        data: ids.flatMap((puzzleId, i) => [
          { attemptNumber: 1, completedAt: new Date(old.getTime() + i * 60_000), movesJson: [WRONG], puzzleId, status: "FAILED" as const, studentId: s.id, wrongMoves: 1 },
          { attemptNumber: 2, completedAt: new Date(old.getTime() + DAY + i * 60_000), movesJson: [MATE], puzzleId, status: "SOLVED" as const, studentId: s.id, wrongMoves: 1 }
        ])
      });
      // 600 newer "gave up without a move" attempts — not mistakes — which used to fill the whole scan window.
      const noise = await puzzle(w.a.coach, "Noise");
      await t.prisma.puzzleAttempt.createMany({
        data: Array.from({ length: 600 }, (_, i) => ({
          attemptNumber: i + 1,
          completedAt: new Date(Date.now() - DAY + i * 1000),
          puzzleId: noise.id,
          status: "FAILED" as const,
          studentId: s.id
        }))
      });

      const counts: number[] = [];
      for (let i = 0; i < 4; i += 1) {
        expect((await t.call(s, "GET", API_ROUTES.revision.summaryMine)).status).toBe(200);
        counts.push(await t.prisma.revisionItem.count({ where: { studentId: s.id } }));
      }
      expect(counts).toEqual([MISTAKE_BATCH, MISTAKE_BATCH * 2, TOTAL, TOTAL]);
      const items = await t.prisma.revisionItem.findMany({ where: { studentId: s.id }, select: { puzzleId: true, sourceAttemptId: true } });
      expect(new Set(items.map((i) => i.puzzleId)).size).toBe(TOTAL);
      expect(items.some((i) => i.puzzleId === noise.id)).toBe(false);
      const firstMisses = await t.prisma.puzzleAttempt.findMany({ where: { attemptNumber: 1, studentId: s.id, puzzleId: { in: ids } }, select: { id: true } });
      expect(new Set(items.map((i) => i.sourceAttemptId))).toEqual(new Set(firstMisses.map((a) => a.id)));

      // Concurrent first loads for another student still seed each puzzle once.
      const s2 = await freshStudent();
      await t.prisma.puzzleAttempt.createMany({
        data: ids.slice(0, 50).map((puzzleId) => ({ attemptNumber: 1, completedAt: old, movesJson: [WRONG], puzzleId, status: "FAILED" as const, studentId: s2.id, wrongMoves: 1 }))
      });
      await t.prisma.authSession.create({
        data: { expiresAt: new Date(Date.now() + DAY), id: `int-${s2.id}`, refreshTokenHash: "integration", userId: s2.id }
      });
      await Promise.all([1, 2, 3].map(() => t.call(s2, "GET", API_ROUTES.revision.summaryMine)));
      expect(await t.prisma.revisionItem.count({ where: { studentId: s2.id } })).toBe(50);
    });
  });
});

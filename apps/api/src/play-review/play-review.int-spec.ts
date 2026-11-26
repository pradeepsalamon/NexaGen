import {
  API_ROUTES,
  DEFAULT_TENANT_ID,
  type AiReviewConsentState,
  type PlayFeedResponse,
  type PlayItemDetailResponse,
  type WeakSpotProfileResponse
} from "@nexa-chess/types";
import { runInTenant } from "../tenancy/tenant-context";
import { createTestApp, type TestApp } from "../test/integration/app";
import { createWorld } from "../test/integration/access/world";
import { resetDatabase } from "../test/integration/db";
import { queryUnreviewed } from "./play-feed.sql";

// The play feed is a read model over every feature's own records, so the
// honest test is real rows in real Postgres: one student with one finished
// item of several sources (a puzzle, a class match, a solo Storm run reported
// through the real route, a class-board move credited to them), plus play by
// another student that must never show.

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("AI play review: play feed, Storm moves, switch (real app, real Postgres)", () => {
  let t: TestApp;
  let w: Awaited<ReturnType<typeof createWorld>>;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    w = await createWorld(t.prisma);
    const p = t.prisma;
    const { a, b } = w;
    const hour = (h: number) => new Date(Date.now() - h * 3_600_000);

    // 1. A solved practice puzzle (Ra8#).
    const solved = await p.puzzleAttempt.create({
      data: {
        attemptNumber: 2,
        completedAt: hour(5),
        movesJson: [{ ply: 1, san: "Ra8#", uci: "a1a8" }],
        puzzleId: a.privatePuzzle.id,
        result: "SOLVED",
        status: "SOLVED",
        studentId: a.student.id
      }
    });
    ids.puzzle = solved.id;
    // Another student's solved puzzle: never in A's feed.
    const other = await p.puzzleAttempt.create({
      data: {
        attemptNumber: 2,
        completedAt: hour(1),
        movesJson: [{ ply: 1, san: "Ra8#", uci: "a1a8" }],
        puzzleId: b.privatePuzzle.id,
        status: "SOLVED",
        studentId: b.student.id
      }
    });
    ids.otherPuzzle = other.id;

    // 2. A finished class match, A as White.
    const match = await p.chessGame.create({
      data: {
        blackName: "B",
        blackPlayerId: b.student.id,
        endedAt: hour(4),
        moveCount: 2,
        pgn: '[Result "1-0"]\n\n1. e4 e5 1-0\n',
        result: "1-0",
        source: "MATCH",
        sourceKey: "match:int-play-review",
        startFen: START,
        startedAt: hour(4.5),
        status: "COMPLETED",
        title: "A vs B",
        whiteName: "A",
        whitePlayerId: a.student.id
      }
    });
    ids.match = match.id;

    // 3. A class-board move credited to A (gap B), on the world's finished board game.
    await p.liveClassBoardMove.create({
      data: { chessGameId: a.boardGame.id, fenBefore: START, ply: 1, san: "d4", studentId: a.student.id, uci: "d2d4" }
    });
    await p.chessGame.update({ data: { endedAt: hour(3) }, where: { id: a.boardGame.id } });

    // 4. A's solo Storm run, finished through the real route with its moves (gap A).
    const report = await t.call(a.student, "PUT", API_ROUTES.puzzleRushSolo.progress(a.soloRun.id), {
      bestCombo: 1,
      clockEndsAt: null,
      errors: 0,
      finished: true,
      highestRating: 1000,
      moves: 1,
      played: [{ i: 0, moves: [{ uci: "g8f8" }], solved: true }],
      puzzleIndex: 1,
      score: 1,
      skipsUsed: 0,
      solved: 1
    });
    expect(report.status).toBe(200);
  });

  afterAll(async () => {
    await t?.close();
  });

  it("stores each finished Storm puzzle's line, rebuilt from the run's own puzzle", async () => {
    const run = await t.prisma.soloPuzzleRushRun.findUniqueOrThrow({ where: { id: w.a.soloRun.id } });
    expect(run.finishedAt).not.toBeNull();
    expect(run.movesJson).toEqual([
      expect.objectContaining({
        i: 0,
        line: [
          expect.objectContaining({ by: "SETUP", uci: "g1f1" }),
          expect.objectContaining({ by: "STUDENT", correct: true, uci: "g8f8" })
        ],
        puzzleId: `sp-A`,
        solved: true
      })
    ]);
  });

  it("lists every source of the student's finished play, newest first, and nobody else's", async () => {
    const res = await t.call(w.a.student, "GET", API_ROUTES.playReview.feedMine);
    expect(res.status).toBe(200);
    const keys = (res.body as PlayFeedResponse).items.map((i) => i.key);
    expect(keys).toEqual([`RUSH:s-${w.a.soloRun.id}`, `CLASS_BOARD:${w.a.boardGame.id}`, `MATCH:${ids.match}`, `PUZZLE:${ids.puzzle}`]);
    expect(JSON.stringify(res.body)).not.toContain(ids.otherPuzzle);
    const match = (res.body as PlayFeedResponse).items.find((i) => i.source === "MATCH");
    expect(match).toMatchObject({ result: "1-0", studentMoveCount: 1, title: "A vs B" });
  });

  it("pages by cursor without repeats, and filters by source", async () => {
    const first = (await t.call(w.a.student, "GET", `${API_ROUTES.playReview.feedMine}?limit=2`)).body as PlayFeedResponse;
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    const second = (await t.call(w.a.student, "GET", `${API_ROUTES.playReview.feedMine}?limit=2&cursor=${first.nextCursor}`))
      .body as PlayFeedResponse;
    expect(second.items.map((i) => i.key)).toEqual([`MATCH:${ids.match}`, `PUZZLE:${ids.puzzle}`]);
    expect(second.nextCursor).toBeNull();

    const puzzles = (await t.call(w.a.student, "GET", `${API_ROUTES.playReview.feedMine}?source=PUZZLE`)).body as PlayFeedResponse;
    expect(puzzles.items.map((i) => i.key)).toEqual([`PUZZLE:${ids.puzzle}`]);
    expect((await t.call(w.a.student, "GET", `${API_ROUTES.playReview.feedMine}?cursor=nonsense`)).status).toBe(400);
  });

  it("shows one item's moves with the student's own marked (the class coach sees it too)", async () => {
    const rush = await t.call(w.a.coach, "GET", API_ROUTES.playReview.item(w.a.student.id, "RUSH", `s-${w.a.soloRun.id}`));
    expect(rush.status).toBe(200);
    const segment = (rush.body as PlayItemDetailResponse).item.segments[0];
    expect(segment.moves.map((m) => [m.uci, m.byStudent])).toEqual([
      ["g1f1", false],
      ["g8f8", true]
    ]);

    const board = (await t.call(w.a.student, "GET", API_ROUTES.playReview.itemMine("CLASS_BOARD", w.a.boardGame.id))).body as PlayItemDetailResponse;
    expect(board.item.segments[0].moves).toEqual([expect.objectContaining({ byStudent: true, san: "d4" })]);

    // Not A's: the board game exists, but nothing on it is A's to see as theirs.
    expect((await t.call(w.b.student, "GET", API_ROUTES.playReview.itemMine("CLASS_BOARD", w.a.boardGame.id))).status).toBe(404);
  });

  it("the nightly to-do list skips reviewed items, refreshes old ones last, and stays inside the academy", async () => {
    // Reviewed with chance counts: done. Reviewed before counts were stored: refreshed, after new play.
    await t.prisma.aiPlayReview.create({
      data: { playedAt: new Date(), source: "PUZZLE", sourceId: ids.puzzle, status: "DONE", studentId: w.a.student.id, tacticsJson: {} }
    });
    await t.prisma.aiPlayReview.create({
      data: { playedAt: new Date(), source: "PUZZLE", sourceId: ids.otherPuzzle, status: "DONE", studentId: w.b.student.id }
    });
    const rows = await runInTenant(DEFAULT_TENANT_ID, "int", () =>
      queryUnreviewed(t.prisma, { since: new Date(Date.now() - 86_400_000) }, 3, 100)
    );
    const keys = rows.map((r) => `${r.student_id}|${r.source}:${r.source_id}`);
    expect(keys).not.toContain(`${w.a.student.id}|PUZZLE:${ids.puzzle}`);
    const refresh = rows.filter((r) => r.refresh).map((r) => `${r.student_id}|${r.source}:${r.source_id}`);
    expect(refresh).toEqual([`${w.b.student.id}|PUZZLE:${ids.otherPuzzle}`]);
    expect(keys[keys.length - 1]).toBe(refresh[0]);
    expect(keys).toContain(`${w.a.student.id}|MATCH:${ids.match}`);
    // B played the same match: it is on B's list too.
    expect(keys).toContain(`${w.b.student.id}|MATCH:${ids.match}`);
    expect(keys).toContain(`${w.b.student.id}|PUZZLE:${ids.otherPuzzle}`);

    const elsewhere = await runInTenant("tenant_other_academy", "int", () =>
      queryUnreviewed(t.prisma, { since: new Date(Date.now() - 86_400_000) }, 3, 100)
    );
    expect(elsewhere).toEqual([]);
  });

  it("weak spots: the coach sees what the student keeps missing, from stored chance counts", async () => {
    const fen = "r1bqkbnr/pppp1ppp/8/4p3/2BnP3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4";
    for (const [i, days] of [1, 2, 3].entries()) {
      await t.prisma.aiPlayReview.create({
        data: {
          findingsJson: [{ bestMoveSan: "Nxe5", fenBefore: fen, kind: "MISSED_TACTIC", motif: "FORK", playedSan: "a3", ply: 7, segment: 0, winPercentLoss: 25 }],
          playedAt: new Date(Date.now() - days * 86_400_000),
          source: "CLASS_BOARD",
          sourceId: `weak-spot-${i}`,
          status: "DONE",
          studentId: w.a.student.id,
          tacticsJson: { FORK: { allowed: 0, alternative: 0, found: 0, missed: 2 }, PIN: { allowed: 0, alternative: 0, found: 2, missed: 0 } }
        }
      });
    }
    const res = await t.call(w.a.coach, "GET", API_ROUTES.playReview.weakSpots(w.a.student.id));
    expect(res.status).toBe(200);
    const profile = res.body as WeakSpotProfileResponse;
    expect(profile.weakSpots[0]).toMatchObject({ itemsWithMiss: 3, missed: 6, motif: "FORK", verdict: "WEAKNESS" });
    expect(profile.weakSpots[0].examples[0]).toMatchObject({ bestMoveUci: "f3e5", playedUci: "a2a3", source: "CLASS_BOARD" });
    expect(profile.strengths.map((m) => m.motif)).toEqual(["PIN"]);

    // A coach who doesn't teach the student, and the student on the staff route: refused.
    expect((await t.call(w.b.coach, "GET", API_ROUTES.playReview.weakSpots(w.a.student.id))).status).toBeGreaterThanOrEqual(403);
    expect((await t.call(w.a.student, "GET", API_ROUTES.playReview.weakSpots(w.a.student.id))).status).toBe(403);

    // The student's card: no tip until a coach of the academy reads it, then the coach's words.
    const card = () => t.call(w.a.student, "GET", API_ROUTES.playReview.weakSpotsMine).then((r) => r.body as WeakSpotProfileResponse);
    expect((await card()).weakSpots[0]).toMatchObject({ motif: "FORK", tip: null, tipStatus: "NOT_READ" });
    const read = await t.call(w.a.coach, "PUT", API_ROUTES.playReview.weakSpotTip("FORK"), { text: "Knights fork two pieces; look for them." });
    expect(read.status).toBe(200);
    expect((await card()).weakSpots[0]).toMatchObject({ tip: "Knights fork two pieces; look for them.", tipStatus: "READ" });
    expect((await t.call(w.a.coach, "DELETE", API_ROUTES.playReview.weakSpotTip("FORK"))).status).toBe(200);
    expect((await card()).weakSpots[0].tip).toBeNull();

    // Make homework: no catalogue here, so the academy's own shared fork puzzle; saved unassigned, no student name.
    const shared = await t.prisma.puzzle.create({
      data: {
        createdByRole: "ADMIN",
        difficulty: "EASY",
        fen,
        puzzleType: "TACTICAL",
        solutionMovesJson: [{ san: "Nxe5", uci: "f3e5" }],
        status: "PUBLISHED",
        tags: ["fork"],
        title: "Shared fork",
        topicId: w.a.privatePuzzle.topicId,
        visibility: "GLOBAL"
      }
    });
    const made = await t.call(w.a.coach, "POST", API_ROUTES.playReview.weakSpotHomework(w.a.student.id), { motif: "FORK", count: 5 });
    expect(made.status).toBe(201);
    const { assignmentId } = made.body as { assignmentId: string };
    const set = await t.prisma.assignment.findUniqueOrThrow({ include: { deployments: true, puzzles: true }, where: { id: assignmentId } });
    expect(set).toMatchObject({ activityType: "PUZZLE_SET", createdById: w.a.coach.id, isLibrary: false, title: "Fork practice" });
    expect(set.puzzles.map((p) => p.puzzleId)).toEqual([shared.id]);
    expect(set.deployments).toEqual([]);
    // Nothing new left for this student: a 409, not an empty set.
    await t.prisma.puzzleAttempt.create({ data: { attemptNumber: 1, puzzleId: shared.id, studentId: w.a.student.id } });
    expect((await t.call(w.a.coach, "POST", API_ROUTES.playReview.weakSpotHomework(w.a.student.id), { motif: "FORK" })).status).toBe(409);
    expect((await t.call(w.b.coach, "POST", API_ROUTES.playReview.weakSpotHomework(w.a.student.id), { motif: "FORK" })).status).toBe(403);
    await t.prisma.assignment.delete({ where: { id: assignmentId } });
    await t.prisma.puzzleAttempt.deleteMany({ where: { puzzleId: shared.id } });
    await t.prisma.puzzle.delete({ where: { id: shared.id } });
    // The tests share one world: leave the reviews as they were.
    await t.prisma.aiPlayReview.deleteMany({ where: { sourceId: { startsWith: "weak-spot-" } } });
  });

  it("the switch: on with a guardian's agreement, off deletes the outside AI's comments", async () => {
    const refused = await t.call(w.a.student, "PUT", API_ROUTES.playReview.consentMine, { allowed: true });
    expect(refused.status).toBe(400);

    const shown = (await t.call(w.a.student, "GET", API_ROUTES.playReview.consentMine)).body as AiReviewConsentState;
    const on = await t.call(w.a.student, "PUT", API_ROUTES.playReview.consentMine, {
      allowed: true,
      guardianConfirmed: true,
      providers: shown.providers
    });
    expect(on.status).toBe(200);
    expect(on.body as AiReviewConsentState).toMatchObject({ allowed: true, changedBy: "STUDENT" });

    const review = await t.prisma.aiPlayReview.findFirstOrThrow({ where: { sourceId: ids.puzzle } });
    await t.prisma.aiPlayComment.create({ data: { model: "m", provider: "Test AI", reviewId: review.id, studentId: w.a.student.id, text: "Nice." } });
    const detail = (await t.call(w.a.student, "GET", API_ROUTES.playReview.itemMine("PUZZLE", ids.puzzle))).body as PlayItemDetailResponse;
    expect(detail.comment).toMatchObject({ text: "Nice." });

    const off = await t.call(w.a.coach, "PUT", API_ROUTES.playReview.consent(w.a.student.id), { allowed: false });
    expect(off.status).toBe(200);
    expect(off.body as AiReviewConsentState).toMatchObject({ allowed: false, changedBy: "COACH" });
    expect(await t.prisma.aiPlayComment.count({ where: { studentId: w.a.student.id } })).toBe(0);
    expect(await t.prisma.aiReviewConsent.count({ where: { studentId: w.a.student.id } })).toBe(2);
  });

  it("the student's data export carries the switch history, reviews and credited board moves", async () => {
    const res = await t.call(w.a.student, "GET", API_ROUTES.privacy.dataExport);
    expect(res.status).toBe(200);
    const sections = (res.body as { sections: Record<string, unknown[]> }).sections;
    expect(sections.aiReviewConsents).toHaveLength(2);
    expect(sections.aiPlayReviews).toHaveLength(1);
    expect(sections.classBoardMoves).toHaveLength(1);
    expect(JSON.stringify(sections.aiReviewConsents)).not.toContain("changedById");
  });
});

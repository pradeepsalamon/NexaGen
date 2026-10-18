/* eslint-disable @typescript-eslint/no-explicit-any */
import { API_ROUTES } from "@nexa-chess/types";
import { createTestApp, type TestApp } from "../test/integration/app";
import { resetDatabase } from "../test/integration/db";
import { createWorld } from "../test/integration/access/world";

// The activity queue over HTTP against real Postgres: one running queue per
// class (a hand-written partial unique index), a launch that shares the first
// puzzle through the ordinary live puzzle, and a stale submission refused once
// the coach has moved the class on.

const QUESTION_FEN = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";

describe("Activity queue (real app, real Postgres)", () => {
  let t: TestApp;
  let w: Awaited<ReturnType<typeof createWorld>>;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    w = await createWorld(t.prisma);
  });
  afterAll(async () => {
    await t?.close();
  });

  const classId = () => w.a.liveClass.id;

  async function draft(clientId: string, items: unknown[]) {
    const created = await t.call(w.a.coach, "POST", API_ROUTES.liveClass.activityQueues(classId()), {
      clientId,
      title: `Queue ${clientId}`
    });
    expect(created.status).toBe(201);
    const queueId = (created.body as any).queue.id as string;
    const added = await t.call(w.a.coach, "POST", API_ROUTES.liveClass.activityQueueItems(classId(), queueId), { items });
    expect(added.status).toBe(201);
    return queueId;
  }

  it("rejects a second running queue in the same class at the database", async () => {
    const queue = await t.prisma.liveClassActivityQueue.create({
      data: { liveClassId: classId(), status: "LIVE", title: "Direct 1" }
    });
    await expect(
      t.prisma.liveClassActivityQueue.create({ data: { liveClassId: classId(), status: "LIVE", title: "Direct 2" } })
    ).rejects.toMatchObject({ code: "P2002" });
    // Any number of drafts and finished ones may sit beside it.
    await t.prisma.liveClassActivityQueue.create({ data: { liveClassId: classId(), title: "Draft" } });
    await t.prisma.liveClassActivityQueue.create({ data: { liveClassId: classId(), status: "FINISHED", title: "Done" } });
    await t.prisma.liveClassActivityQueue.deleteMany({ where: { liveClassId: classId() } });
    expect(queue.id).toBeTruthy();
  });

  it("launches once, steps the class through, and refuses a stale attempt", async () => {
    const queueId = await draft("client-run-0001", [
      { kind: "PUZZLE", puzzleId: w.a.privatePuzzle.id },
      { correctUci: "a1a8", fen: QUESTION_FEN, kind: "QUESTION", prompt: "Find mate" }
    ]);
    const other = await draft("client-run-0002", [{ kind: "PUZZLE", puzzleId: w.a.privatePuzzle.id }]);

    const launched = await t.call(w.a.coach, "POST", API_ROUTES.liveClass.activityQueueLaunch(classId(), queueId));
    expect(launched.status).toBe(201);
    const queue = (launched.body as any).queue;
    expect(queue.status).toBe("LIVE");
    expect(queue.items[0].activationError).toBeNull();

    // The first puzzle is the class's live puzzle, linked to the item.
    const item = await t.prisma.liveClassActivityQueueItem.findUniqueOrThrow({ where: { id: queue.items[0].id } });
    const assignment = await t.prisma.liveClassPuzzleAssignment.findUniqueOrThrow({
      where: { id: item.puzzleAssignmentId! }
    });
    expect(assignment).toMatchObject({ puzzleId: w.a.privatePuzzle.id, status: "ACTIVE" });

    // A second launch of the same queue is a no-op; another queue is refused.
    expect((await t.call(w.a.coach, "POST", API_ROUTES.liveClass.activityQueueLaunch(classId(), queueId))).status).toBe(201);
    expect((await t.call(w.a.coach, "POST", API_ROUTES.liveClass.activityQueueLaunch(classId(), other))).status).toBe(409);
    expect(await t.prisma.liveClassPuzzleAssignment.count({ where: { liveClassId: classId() } })).toBe(1);

    // The student sees progress only.
    const seen = await t.call(w.a.student, "GET", API_ROUTES.liveClass.activityQueueCurrent(classId()));
    expect(seen.body).toMatchObject({ queue: { currentNumber: 1, total: 2 } });
    expect(JSON.stringify(seen.body)).not.toContain("a1a8");

    // The student opens an attempt, then the coach moves the class on.
    const attempt = await t.call(w.a.student, "POST", API_ROUTES.liveClass.puzzleAttempt(classId()));
    expect(attempt.status).toBe(201);
    const advanced = await t.call(w.a.coach, "POST", API_ROUTES.liveClass.activityQueueAdvance(classId(), queueId), {
      fromItemId: queue.items[0].id
    });
    expect(advanced.status).toBe(201);
    expect((advanced.body as any).queue.currentItemId).toBe(queue.items[1].id);

    // A double click on the old item does not skip the question.
    const again = await t.call(w.a.coach, "POST", API_ROUTES.liveClass.activityQueueAdvance(classId(), queueId), {
      fromItemId: queue.items[0].id
    });
    expect(again.status).toBe(409);

    // The puzzle closed with the advance, so a late new attempt is refused.
    expect((await t.call(w.a.student, "POST", API_ROUTES.liveClass.puzzleAttempt(classId()))).status).toBeGreaterThanOrEqual(400);
    const poll = await t.prisma.liveClassMovePoll.findFirstOrThrow({ where: { liveClassId: classId(), status: "OPEN" } });
    expect(poll.correctUci).toBe("a1a8");

    const answered = await t.call(w.a.student, "POST", API_ROUTES.liveClass.movePollAnswer(classId()), { uci: "a1a8" });
    expect(answered.status).toBe(201);

    const progress = await t.call(w.a.coach, "GET", API_ROUTES.liveClass.activityQueueProgress(classId(), queueId));
    expect(progress.status).toBe(200);
    const cells = (progress.body as any).cells;
    expect(cells[queue.items[0].id][w.a.student.id].state).toBe("MISSED");
    expect(cells[queue.items[1].id][w.a.student.id]).toEqual({ detail: "Ra8#", state: "CORRECT" });

    // Finishing after the last item; the student's view clears.
    const done = await t.call(w.a.coach, "POST", API_ROUTES.liveClass.activityQueueAdvance(classId(), queueId), {
      fromItemId: queue.items[1].id
    });
    expect((done.body as any).queue.status).toBe("FINISHED");
    expect(await t.prisma.liveClassMovePoll.count({ where: { liveClassId: classId(), status: { not: "ENDED" } } })).toBe(0);
    expect((await t.call(w.a.student, "GET", API_ROUTES.liveClass.activityQueueCurrent(classId()))).body).toEqual({ queue: null });
  });

  it("adds Lichess catalogue picks lowest rating first, once each, and launches the exact position", async () => {
    // One real catalogue line (Rxe4 sets it up), copied under different ids and ratings.
    const line = {
      contentHash: "0000000000000000",
      fen: "8/p4p1p/1p3R2/6pk/3Bb3/1qP3P1/8/4R1K1 w - - 2 38",
      gameUrl: "https://lichess.org/abc#76",
      moves: "e1e4 b3b1 g1f2 b1e4",
      nbPlays: 800,
      passesQualityGate: true,
      popularity: 90,
      ratingDeviation: 75,
      releaseId: "int",
      themes: ["endgame", "fork"]
    };
    const ratings: Record<string, number> = { LQ1500: 1500, LQ1100: 1100, LQ1300: 1300, LQ1200: 1200, LQ0950: 950 };
    await t.prisma.lichessPuzzle.createMany({
      data: Object.entries(ratings).map(([id, rating], i) => ({ ...line, id, randKey: i, rating, ratingBand: Math.floor(rating / 50) }))
    });

    // A draft that already has a hand-made item the coach put first.
    const queueId = await draft("client-lichess-01", [{ kind: "PUZZLE", puzzleId: w.a.privatePuzzle.id }]);
    const path = API_ROUTES.liveClass.activityQueueCatalogItems(classId(), queueId);

    // Students and another batch's coach are refused before anything is materialised.
    expect((await t.call(w.a.student, "POST", path, { sourceIds: ["LQ1100"] })).status).toBe(403);
    expect((await t.call(w.b.coach, "POST", path, { sourceIds: ["LQ1100"] })).status).toBe(403);
    expect(await t.prisma.puzzle.count({ where: { source: "LICHESS" } })).toBe(0);

    // Two identical requests at once (a double click): each puzzle lands once.
    const picks = ["LQ1500", "LQ1100", "LQ1300", "LQ1200", "LQ0950", "LQ1300", "NOPE1"];
    const [first, second] = await Promise.all([
      t.call(w.a.coach, "POST", path, { durationSeconds: 120, sourceIds: picks }),
      t.call(w.a.coach, "POST", path, { durationSeconds: 120, sourceIds: picks })
    ]);
    expect([first.status, second.status]).toEqual([201, 201]);
    const items = await t.prisma.liveClassActivityQueueItem.findMany({
      where: { queueId },
      orderBy: { position: "asc" },
      include: { puzzle: { select: { rating: true, sourceId: true } } }
    });
    expect(items.map((i) => i.position)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(items[0].puzzleId).toBe(w.a.privatePuzzle.id);
    expect(items.slice(1).map((i) => i.puzzle?.rating)).toEqual([950, 1100, 1200, 1300, 1500]);
    expect(items.slice(1).every((i) => i.durationSeconds === 120)).toBe(true);
    const skipped = [first, second].flatMap((r) => (r.body as any).skipped);
    expect(skipped.filter((s: any) => s.reason === "NOT_FOUND").map((s: any) => s.sourceId)).toEqual(["NOPE1", "NOPE1"]);
    expect(skipped.filter((s: any) => s.reason === "ALREADY_QUEUED")).toHaveLength(5);

    // An individual Share (any puzzle, any time) leaves the queue alone.
    const shared = await t.call(w.a.coach, "POST", API_ROUTES.liveClass.puzzle(classId()), { puzzleId: items[3].puzzleId });
    expect(shared.status).toBe(201);
    expect(await t.prisma.liveClassActivityQueueItem.count({ where: { queueId } })).toBe(6);

    // The coach moves their own puzzle to the end; the class starts on the 950.
    const reordered = await t.call(w.a.coach, "PUT", API_ROUTES.liveClass.activityQueueItemOrder(classId(), queueId), {
      ids: [...items.slice(1), items[0]].map((i) => i.id)
    });
    expect(reordered.status).toBe(200);
    const launched = await t.call(w.a.coach, "POST", API_ROUTES.liveClass.activityQueueLaunch(classId(), queueId));
    expect(launched.status).toBe(201);
    const state = await t.call(w.a.student, "GET", API_ROUTES.liveClass.puzzle(classId()));
    const assignment = (state.body as any).assignment;
    expect(assignment.puzzleId).toBe(items[1].puzzleId);
    // The position after the setup move, Black to move — what the solver sees.
    expect(assignment.fen).toBe("8/p4p1p/1p3R2/6pk/3BR3/1qP3P1/8/6K1 b - - 0 38");
    expect(assignment.sideToMove).toBe("black");

    // Launched: no more catalogue additions.
    expect((await t.call(w.a.coach, "POST", path, { sourceIds: ["LQ1100"] })).status).toBe(409);
    await t.call(w.a.coach, "POST", API_ROUTES.liveClass.activityQueueFinish(classId(), queueId));
  });
});

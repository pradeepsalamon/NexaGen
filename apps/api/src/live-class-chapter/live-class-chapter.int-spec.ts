import { API_ROUTES, type DeleteLiveClassChaptersResponse } from "@nexa-chess/types";
import { createTestApp, type TestApp } from "../test/integration/app";
import { resetDatabase } from "../test/integration/db";
import { createWorld } from "../test/integration/access/world";

type World = Awaited<ReturnType<typeof createWorld>>;

const FEN = "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1";
const STATE = { arrows: [], fen: FEN, historyIndex: -1, orientation: "white", pgn: "", squares: {} };

/** "Delete all chapters" against real Postgres: one transaction, scoped to the class's batch. */
describe("live-class chapters: delete all (real app, real Postgres)", () => {
  let t: TestApp;
  let w: World;

  beforeAll(async () => {
    t = await createTestApp();
  });
  beforeEach(async () => {
    await resetDatabase(t.prisma);
    w = await createWorld(t.prisma);
  });
  afterAll(async () => {
    await t?.close();
  });

  const addChapters = async (batchId: string, count: number, puzzleId?: string) => {
    const existing = await t.prisma.liveClassChapter.count({ where: { scopeKey: `batch:${batchId}` } });
    for (let i = 0; i < count; i++) {
      await t.prisma.liveClassChapter.create({
        data: {
          batchId,
          position: existing + i,
          puzzleId: puzzleId ?? null,
          scopeKey: `batch:${batchId}`,
          state: STATE,
          title: `Extra ${existing + i}`
        }
      });
    }
  };
  const idsOf = async (batchId: string) =>
    (await t.prisma.liveClassChapter.findMany({ where: { scopeKey: `batch:${batchId}` }, select: { id: true } })).map(
      (r) => r.id
    );
  const deleteAll = (ids: string[]) =>
    t.call(w.a.coach, "POST", API_ROUTES.liveClass.chapterBulkDelete(w.a.liveClass.id), { ids });

  it("deletes every chapter of the batch and nothing else", async () => {
    await addChapters(w.a.batch.id, 4, w.a.privatePuzzle.id);
    // A queued CHAPTER step pointing at one of them (no FK — it must survive the delete).
    await t.prisma.liveClassActivityQueueItem.create({
      data: { chapterId: w.a.chapter.id, kind: "CHAPTER", position: 1, queueId: w.a.activityQueue.id, title: "Ch" }
    });
    const ids = await idsOf(w.a.batch.id);
    expect(ids).toHaveLength(5);

    const res = await deleteAll(ids);

    expect(res.status).toBe(200);
    expect(res.body as DeleteLiveClassChaptersResponse).toMatchObject({ chapters: [], deleted: 5, scope: "BATCH" });
    expect(await idsOf(w.a.batch.id)).toEqual([]);
    // Side B, the puzzle the chapters came from, the student's attempt and the queue are untouched.
    expect(await idsOf(w.b.batch.id)).toEqual([w.b.chapter.id]);
    expect(await t.prisma.puzzle.findUnique({ where: { id: w.a.privatePuzzle.id } })).not.toBeNull();
    expect(await t.prisma.puzzleAttempt.findUnique({ where: { id: w.a.attempt.id } })).not.toBeNull();
    expect(await t.prisma.liveClassActivityQueueItem.count({ where: { queueId: w.a.activityQueue.id } })).toBe(2);
  });

  it("keeps a chapter added after the confirmation and renumbers it", async () => {
    const confirmed = await idsOf(w.a.batch.id);
    await addChapters(w.a.batch.id, 1);

    const res = await deleteAll(confirmed);

    const body = res.body as DeleteLiveClassChaptersResponse;
    expect(body.deleted).toBe(1);
    expect(body.chapters.map((c) => [c.title, c.position])).toEqual([["Extra 1", 0]]);
    const rows = await t.prisma.liveClassChapter.findMany({ where: { scopeKey: `batch:${w.a.batch.id}` } });
    expect(rows.map((r) => r.position)).toEqual([0]);
  });

  it("is a no-op when repeated, including two requests at once", async () => {
    await addChapters(w.a.batch.id, 3);
    const ids = await idsOf(w.a.batch.id);
    // Signs the coach in first: the test app's per-user session upsert can't race itself.
    expect((await t.call(w.a.coach, "GET", API_ROUTES.liveClass.chapters(w.a.liveClass.id))).status).toBe(200);

    const [first, second] = await Promise.all([deleteAll(ids), deleteAll(ids)]);
    const deleted = [first, second].map((r) => (r.body as DeleteLiveClassChaptersResponse).deleted);
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(deleted.reduce((a, b) => a + b, 0)).toBe(4);

    const retry = await deleteAll(ids);
    expect(retry.body).toMatchObject({ chapters: [], deleted: 0 });
  });

  it("rejects an empty id list", async () => {
    const res = await deleteAll([]);
    expect(res.status).toBe(400);
    expect(await idsOf(w.a.batch.id)).toEqual([w.a.chapter.id]);
  });

  it("refuses the class's student and another batch's coach", async () => {
    const path = API_ROUTES.liveClass.chapterBulkDelete(w.a.liveClass.id);
    expect((await t.call(w.a.student, "POST", path, { ids: [w.a.chapter.id] })).status).toBe(403);
    expect((await t.call(w.b.coach, "POST", path, { ids: [w.a.chapter.id] })).status).toBe(403);
    expect(await idsOf(w.a.batch.id)).toEqual([w.a.chapter.id]);
  });
});

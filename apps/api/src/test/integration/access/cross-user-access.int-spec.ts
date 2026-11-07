import { API_ROUTES } from "@nexa-chess/types";
import { createTestApp, type TestApp } from "../app";
import { resetDatabase } from "../db";
import { CROSS_USER, LIST_CASES, OWN_CASES, WRONG_ROLE, type Case, type World } from "./access-cases";
import { createWorld } from "./world";

describe("cross-user access (real app, real Postgres)", () => {
  let t: TestApp;
  let w: World;

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    w = await createWorld(t.prisma);
  });
  afterAll(async () => {
    await t?.close();
  });

  const run = (c: Case) =>
    t.call(c.as(w), c.method ?? "GET", c.path(w), typeof c.body === "function" ? c.body(w) : c.body);

  it.each(CROSS_USER.map((c) => [c.name, c] as const))("denies: %s", async (_name, c) => {
    const res = await run(c);
    expect(`${res.status} ${c.path(w)}`).toMatch(/^40[34] /);
  });

  it("'delete all' through the coach's own class skips another batch's chapter ids", async () => {
    const res = await t.call(w.a.coach, "POST", API_ROUTES.liveClass.chapterBulkDelete(w.a.liveClass.id), {
      ids: [w.b.chapter.id]
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ deleted: 0 });
    expect(JSON.stringify(res.body)).not.toContain(w.b.chapter.id);
  });

  it.each(OWN_CASES.map((c) => [c.name, c] as const))("allows: %s", async (_name, c) => {
    const res = await run(c);
    expect({ path: c.path(w), status: res.status }).toEqual({ path: c.path(w), status: 200 });
  });

  it.each(LIST_CASES.map((c) => [c.name, c] as const))("list hides side B: %s", async (_name, c) => {
    const res = await run(c);
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    const b = w.b;
    const ids = [b.student, b.class, b.liveClass, b.batch, b.invoice, b.privatePuzzle, b.payrollRecord, b.assignment, b.deployment, b.studentAssignment, b.game, b.boardGame, b.batchChat, b.directChat, b.kbArticle, b.kbSuggestion].map((row) => row.id);
    for (const id of ids) {
      expect(text).not.toContain(id);
    }
  });

  it.each(WRONG_ROLE.map((c) => [c.name, c] as const))("forbids: %s", async (_name, c) => {
    const res = await run(c);
    expect({ path: c.path(w), status: res.status }).toEqual({ path: c.path(w), status: 403 });
  });

  it.each([["student"], ["coach"]] as const)("a %s's data export carries their own rows and no secrets", async (role) => {
    const res = await t.call(w.a[role], "GET", API_ROUTES.privacy.dataExport);
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    const own = role === "student" ? [w.a.student.id, w.a.invoice.id, w.a.attempt.id, w.a.externalAccount.id] : [w.a.coach.id, w.a.class.id];
    for (const id of own) expect(text).toContain(id);
    for (const secret of ["password", "refreshTokenHash", "tokenHash", "secret", "idempotencyKey"]) {
      expect(text).not.toContain(`"${secret}"`);
    }
  });

  it("the cross-user writes above changed nothing", async () => {
    const { a, b } = w;
    const klass = await t.prisma.coachClass.findUniqueOrThrow({ where: { id: b.class.id } });
    expect(klass.notes).not.toBe("hijacked");
    expect((await t.prisma.puzzle.findUnique({ where: { id: b.privatePuzzle.id } }))?.title).toBe("Private B");
    expect((await t.prisma.assignment.findUnique({ where: { id: b.assignment.id } }))?.title).toBe("Homework B");
    // The homework + the puzzle set; no third deployment reached B's batch.
    expect(await t.prisma.assignmentBatch.count({ where: { batchId: b.batch.id } })).toBe(2);
    expect(await t.prisma.puzzleAttempt.count({ where: { studentAssignmentId: { not: null } } })).toBe(0);
    expect((await t.prisma.referralWithdrawal.findUniqueOrThrow({ where: { id: b.referralWithdrawal.id } })).status).toBe("REQUESTED");
    expect((await t.prisma.referralRedemption.findUniqueOrThrow({ where: { id: b.referralRedemption.id } })).status).toBe("PENDING");
    expect(await t.prisma.liveSession.findUnique({ where: { classId: b.liveClass.id } })).toMatchObject({
      recordingStatus: null,
      status: "LIVE"
    });
    expect(await t.prisma.liveChatMessage.count({ where: { senderId: a.student.id } })).toBe(0);
    expect(await t.prisma.chatMessage.count({ where: { senderId: a.student.id } })).toBe(0);
    expect(await t.prisma.knowledgeArticleVersion.findUnique({ where: { id: b.kbSuggestion.id } })).toMatchObject({ status: "SUBMITTED", title: "Suggestion B" });
    expect(await t.prisma.knowledgeArticleVersion.count({ where: { title: "hijacked" } })).toBe(0);
    expect(await t.prisma.knowledgeFeedback.count({ where: { articleId: b.kbArticle.id } })).toBe(0);
    expect(await t.prisma.chessGame.findUnique({ where: { id: b.game.id } })).toMatchObject({ version: 1 });
    expect(await t.prisma.externalChessAccount.findUnique({ where: { id: b.externalAccount.id } })).toMatchObject({ autoSync: false, lastSyncedAt: null });
    expect(await t.prisma.studentProfile.findUnique({ where: { userId: b.student.id } })).toMatchObject({ gameAutoSyncRule: null });
    expect(await t.prisma.conversation.count({ where: { type: { in: ["DIRECT", "GROUP"] } } })).toBe(2);
    expect(await t.prisma.liveClassPuzzleRushEntry.count({ where: { rushId: b.rush.id } })).toBe(0);
    expect(await t.prisma.liveClassPlayoutGame.findUnique({ where: { id: b.playoutGame.id } })).toMatchObject({ ply: 0, status: "IN_PROGRESS" });
    expect(await t.prisma.liveClassPlayoutGame.findUnique({ where: { id: a.playoutGame.id } })).toMatchObject({ hintsUsed: 0, ply: 0, status: "IN_PROGRESS" });
    expect(await t.prisma.liveClassPlayoutGame.count({ where: { runId: { in: [a.playoutRun.id, b.playoutRun.id] } } })).toBe(2);
    expect(await t.prisma.liveClassActivityRun.count({ where: { status: "ACTIVE" } })).toBe(2);
    expect(await t.prisma.libraryActivity.count({ where: { title: "hijacked" } })).toBe(0);
    expect(await t.prisma.revisionItem.count({ where: { source: "COACH" } })).toBe(0);
    expect(await t.prisma.liveClassPuzzleRush.findUnique({ where: { id: b.rush.id } })).toMatchObject({ endedAt: null });
    expect(await t.prisma.liveClassChapter.findMany({ where: { scopeKey: `batch:${b.batch.id}` } })).toEqual([
      expect.objectContaining({ id: b.chapter.id, title: "Chapter B" })
    ]);
    expect(await t.prisma.liveClassActivityQueue.findUnique({ where: { id: b.activityQueue.id } })).toMatchObject({ status: "DRAFT" });
    expect(await t.prisma.liveClassActivityQueueItem.count({ where: { queueId: b.activityQueue.id } })).toBe(1);
    expect(await t.prisma.liveClassActivityQueueItem.count({ where: { puzzleId: b.privatePuzzle.id } })).toBe(1);
  });
});

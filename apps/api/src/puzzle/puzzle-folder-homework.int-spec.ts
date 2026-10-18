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

// Homework-approved folders over HTTP against real Postgres: the Super Admin's
// approval is academy-wide (one column on the folder), covers a coach who joins
// after it, gates every create and deploy in the API, and a revoke closes it.

const FEN = "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1";

describe("Homework-approved puzzle folders (real app, real Postgres)", () => {
  let t: TestApp;
  let w: Awaited<ReturnType<typeof createWorld>>;
  let folderId: string;
  const dueDate = () => new Date(Date.now() + 86_400_000).toISOString();

  const puzzle = (title: string, over: Record<string, unknown> = {}) =>
    t.prisma.puzzle.create({
      data: {
        createdById: w.admin.id,
        createdByRole: UserRole.ADMIN,
        difficulty: PuzzleDifficulty.EASY,
        fen: FEN,
        puzzleType: PuzzleType.CHECKMATE,
        solutionMovesJson: [{ san: "Ra8#", uci: "a1a8" }],
        status: PuzzleStatus.PUBLISHED,
        title,
        topicId: folderId,
        visibility: PuzzleVisibility.GLOBAL,
        ...over
      }
    });

  const fromFolder = (batchId: string) => ({
    activityType: "PUZZLE_SET",
    batchIds: [batchId],
    difficulty: "BEGINNER",
    dueDate: dueDate(),
    sourceTopicId: folderId,
    title: "Forks homework"
  });

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    w = await createWorld(t.prisma);
    folderId = (await t.prisma.puzzleTopic.create({ data: { name: "Forks", slug: "forks" } })).id;
    await puzzle("Fork 10");
    await puzzle("Fork 2");
    // Neither is part of the folder's homework set.
    await puzzle("Draft fork", { status: PuzzleStatus.DRAFT });
    await puzzle("Coach B's fork", {
      createdById: w.b.coach.id,
      createdByRole: UserRole.COACH,
      visibility: PuzzleVisibility.PRIVATE
    });
  });
  afterAll(async () => {
    await t?.close();
  });

  it("approves once for everyone, enforces it in the API, and revokes for everyone", async () => {
    const { superAdmin, admin, a } = w;
    const route = API_ROUTES.puzzles.topicHomework(folderId);

    // ── Not approved: the folder can't be assigned, and only the Super Admin can approve ──
    expect((await t.call(a.coach, "POST", API_ROUTES.assignments.create, fromFolder(a.batch.id))).status).toBe(403);
    expect((await t.call(a.coach, "PUT", route)).status).toBe(403);
    expect((await t.call(admin, "PUT", route)).status).toBe(403);

    const approved = await t.call(superAdmin, "PUT", route);
    expect(approved.status).toBe(200);
    expect((approved.body as any).topic).toMatchObject({
      homeworkBlocker: null,
      homeworkPuzzleCount: 2
    });

    // ── A coach who joins AFTER the approval can assign it with no further step ──
    const lateCoach = await t.prisma.user.update({
      where: { id: (await createUser(t.prisma, UserRole.COACH)).id },
      data: { status: UserStatus.ACTIVE }
    });
    await t.prisma.coachProfile.create({ data: { userId: lateCoach.id } });
    const lateBatch = await t.prisma.batch.create({ data: { name: "Late batch" } });
    await t.prisma.batchCoach.create({ data: { batchId: lateBatch.id, coachId: lateCoach.id } });
    await t.prisma.batchStudent.create({ data: { batchId: lateBatch.id, studentId: a.student.id } });

    const lateTopics = await t.call(lateCoach, "GET", API_ROUTES.puzzles.topics);
    expect((lateTopics.body as any).topics.find((x: any) => x.id === folderId)).toMatchObject({
      canApproveHomework: false,
      homeworkBlocker: null
    });

    const late = await t.call(lateCoach, "POST", API_ROUTES.assignments.create, fromFolder(lateBatch.id));
    expect(late.status).toBe(201);
    // The server built the set from the folder: published library puzzles, natural title order.
    expect((late.body as any).assignment.puzzles.map((p: any) => p.title)).toEqual(["Fork 2", "Fork 10"]);
    expect((late.body as any).assignment.sourceTopic).toEqual({ id: folderId, name: "Forks" });

    const early = await t.call(a.coach, "POST", API_ROUTES.assignments.create, {
      ...fromFolder(a.batch.id),
      batchIds: undefined,
      dueDate: undefined
    });
    expect(early.status).toBe(201);
    const earlyId = (early.body as any).assignment.id;

    // A client can't smuggle its own puzzle list in with a folder.
    const smuggled = await t.call(a.coach, "POST", API_ROUTES.assignments.create, {
      ...fromFolder(a.batch.id),
      puzzleIds: [a.privatePuzzle.id]
    });
    expect(smuggled.status).toBe(400);

    // ── Revoked: no new folder assignment, and no re-deploy of a set made from it ──
    expect((await t.call(admin, "DELETE", route)).status).toBe(403);
    expect((await t.call(superAdmin, "DELETE", route)).status).toBe(200);
    expect((await t.call(lateCoach, "POST", API_ROUTES.assignments.create, fromFolder(lateBatch.id))).status).toBe(403);
    const deploy = { assignmentId: earlyId, batchIds: [a.batch.id], dueDate: dueDate() };
    expect((await t.call(a.coach, "POST", API_ROUTES.assignments.deploy, deploy)).status).toBe(403);

    // Homework already handed out stays with the students.
    expect(await t.prisma.studentAssignment.count({ where: { assignmentBatch: { batchId: lateBatch.id } } })).toBe(1);

    // ── Approved again: deploy works ──
    expect((await t.call(superAdmin, "PUT", route)).status).toBe(200);
    expect((await t.call(a.coach, "POST", API_ROUTES.assignments.deploy, deploy)).status).toBe(201);
  });

  it("refuses an approved folder once it gains a subfolder, and won't approve such a folder", async () => {
    const { superAdmin, a } = w;
    const sub = await t.prisma.puzzleTopic.create({ data: { name: "Knight forks", parentId: folderId, slug: "knight-forks" } });

    expect((await t.call(a.coach, "POST", API_ROUTES.assignments.create, fromFolder(a.batch.id))).status).toBe(400);
    // Still approved (nothing reset it) — just not assignable while it has subfolders.
    expect((await t.prisma.puzzleTopic.findUniqueOrThrow({ where: { id: folderId } })).homeworkApprovedAt).not.toBeNull();

    await t.call(superAdmin, "DELETE", API_ROUTES.puzzles.topicHomework(folderId));
    expect((await t.call(superAdmin, "PUT", API_ROUTES.puzzles.topicHomework(folderId))).status).toBe(400);
    // An empty leaf folder can't be approved either.
    expect((await t.call(superAdmin, "PUT", API_ROUTES.puzzles.topicHomework(sub.id))).status).toBe(400);
  });
});

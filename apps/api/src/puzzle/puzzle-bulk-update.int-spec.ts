import { API_ROUTES, type BulkUpdatePuzzlesResponse } from "@nexa-chess/types";
import {
  PuzzleDifficulty,
  PuzzleStatus,
  PuzzleType,
  PuzzleVisibility,
  UserRole
} from "@prisma/client";
import { createTestApp, type TestApp } from "../test/integration/app";
import { resetDatabase } from "../test/integration/db";
import { createWorld } from "../test/integration/access/world";

// The Puzzle Library's folder bulk edit over HTTP against real Postgres: only
// the selected puzzles and the chosen fields change, a coach can't reach past
// their own puzzles, and a puzzle moved out of the folder is left alone.

const FEN = "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1";

describe("Puzzle bulk edit (real app, real Postgres)", () => {
  let t: TestApp;
  let w: Awaited<ReturnType<typeof createWorld>>;
  let folderId: string;
  let targetId: string;

  const puzzle = (title: string, over: Record<string, unknown> = {}) =>
    t.prisma.puzzle.create({
      data: {
        createdById: w.admin.id,
        createdByRole: UserRole.ADMIN,
        difficulty: PuzzleDifficulty.EASY,
        fen: FEN,
        puzzleType: PuzzleType.CHECKMATE,
        solutionMovesJson: [{ san: "Ra8#", uci: "a1a8" }],
        status: PuzzleStatus.DRAFT,
        tags: ["fork"],
        title,
        topicId: folderId,
        visibility: PuzzleVisibility.GLOBAL,
        ...over
      }
    });

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    w = await createWorld(t.prisma);
    folderId = (await t.prisma.puzzleTopic.create({ data: { name: "Forks", slug: "forks" } })).id;
    targetId = (await t.prisma.puzzleTopic.create({ data: { name: "Pins", slug: "pins" } })).id;
  });
  afterAll(async () => {
    await t?.close();
  });

  it("changes only the selected puzzles and the chosen fields", async () => {
    const a = await puzzle("Fork A", { explanation: "keep me" });
    const b = await puzzle("Fork B");
    const untouched = await puzzle("Fork C");

    const res = await t.call(w.admin, "POST", API_ROUTES.puzzles.bulkUpdate, {
      addTags: ["pin"],
      difficulty: "ADVANCED",
      fromTopicId: folderId,
      ids: [a.id, b.id],
      removeTags: ["fork"],
      status: "PUBLISHED",
      topicId: targetId
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ skipped: [], updated: 2 });

    const after = await t.prisma.puzzle.findUniqueOrThrow({ where: { id: a.id } });
    expect(after).toMatchObject({
      difficulty: "ADVANCED",
      explanation: "keep me",
      fen: FEN,
      puzzleType: "CHECKMATE",
      status: "PUBLISHED",
      tags: ["pin"],
      title: "Fork A",
      topicId: targetId
    });
    expect(after.publishedAt).not.toBeNull();
    expect(await t.prisma.puzzle.findUniqueOrThrow({ where: { id: untouched.id } })).toMatchObject({
      difficulty: "EASY",
      status: "DRAFT",
      tags: ["fork"],
      topicId: folderId
    });
  });

  it("skips puzzles a coach doesn't own and puzzles moved out of the folder", async () => {
    const own = await puzzle("Coach A's fork", {
      createdById: w.a.coach.id,
      createdByRole: UserRole.COACH,
      visibility: PuzzleVisibility.PRIVATE
    });
    const adminOnes = await puzzle("Admin fork");
    const otherCoach = await puzzle("Coach B's fork", {
      createdById: w.b.coach.id,
      createdByRole: UserRole.COACH,
      visibility: PuzzleVisibility.PRIVATE
    });
    const moved = await puzzle("Moved fork", {
      createdById: w.a.coach.id,
      createdByRole: UserRole.COACH,
      topicId: targetId,
      visibility: PuzzleVisibility.PRIVATE
    });

    const res = await t.call(w.a.coach, "POST", API_ROUTES.puzzles.bulkUpdate, {
      difficulty: "EXPERT",
      fromTopicId: folderId,
      ids: [own.id, adminOnes.id, otherCoach.id, moved.id]
    });
    expect(res.status).toBe(201);
    const body = res.body as BulkUpdatePuzzlesResponse;
    expect(body.updated).toBe(1);
    expect(body.skipped.map((s) => s.id).sort()).toEqual(
      [adminOnes.id, otherCoach.id, moved.id].sort()
    );
    // Coach B's private puzzle is never named back to coach A.
    expect(JSON.stringify(res.body)).not.toContain("Coach B's fork");

    const rows = await t.prisma.puzzle.findMany({
      where: { id: { in: [own.id, adminOnes.id, otherCoach.id, moved.id] } },
      select: { id: true, difficulty: true }
    });
    const difficulty = Object.fromEntries(rows.map((r) => [r.id, r.difficulty]));
    expect(difficulty).toEqual({
      [own.id]: "EXPERT",
      [adminOnes.id]: "EASY",
      [otherCoach.id]: "EASY",
      [moved.id]: "EASY"
    });
  });

  it("refuses students, an empty change and an unknown folder", async () => {
    const p = await puzzle("Guarded fork");
    expect(
      (await t.call(w.a.student, "POST", API_ROUTES.puzzles.bulkUpdate, { difficulty: "ADVANCED", ids: [p.id] })).status
    ).toBe(403);
    expect((await t.call(w.admin, "POST", API_ROUTES.puzzles.bulkUpdate, { ids: [p.id] })).status).toBe(400);
    expect(
      (await t.call(w.admin, "POST", API_ROUTES.puzzles.bulkUpdate, { ids: [p.id], topicId: "no-such-folder" })).status
    ).toBe(400);
  });
});

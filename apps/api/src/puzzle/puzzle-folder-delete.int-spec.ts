import { API_ROUTES } from "@nexa-chess/types";
import {
  PuzzleDifficulty,
  PuzzleStatus,
  PuzzleType,
  PuzzleVisibility,
  UserRole
} from "@prisma/client";
import { TrashService } from "../trash/trash.service";
import { createTestApp, type TestApp } from "../test/integration/app";
import { resetDatabase } from "../test/integration/db";
import { createWorld } from "../test/integration/access/world";

// Deleting a puzzle folder over HTTP against real Postgres: the folder, its
// subfolders and every puzzle inside go to Trash as one group, a restore of any
// one row brings the whole folder back, and the retention sweep purges the
// puzzles before the folders (puzzles.topicId is RESTRICT).

const FEN = "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1";

describe("Puzzle folder delete (real app, real Postgres)", () => {
  let t: TestApp;
  let w: Awaited<ReturnType<typeof createWorld>>;
  let rootId: string;
  let childId: string;
  let otherId: string;

  const puzzle = (title: string, topicId: string) =>
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
        topicId,
        visibility: PuzzleVisibility.GLOBAL
      }
    });

  const liveCounts = async () => ({
    puzzles: await t.prisma.puzzle.count({ where: { topicId: { in: [rootId, childId] } } }),
    topics: await t.prisma.puzzleTopic.count({ where: { id: { in: [rootId, childId] } } })
  });

  beforeAll(async () => {
    t = await createTestApp();
    await resetDatabase(t.prisma);
    w = await createWorld(t.prisma);
    rootId = (await t.prisma.puzzleTopic.create({ data: { name: "Tactics", slug: "tactics" } })).id;
    childId = (await t.prisma.puzzleTopic.create({ data: { name: "Forks", parentId: rootId, slug: "forks" } })).id;
    otherId = (await t.prisma.puzzleTopic.create({ data: { name: "Endgames", slug: "endgames" } })).id;
    await puzzle("Tactic 1", rootId);
    await puzzle("Fork 1", childId);
    await puzzle("Fork 2", childId);
    await puzzle("Endgame 1", otherId);
  });
  afterAll(async () => {
    await t?.close();
  });

  it("only admins delete; the whole subtree and its puzzles go to Trash as one group", async () => {
    const route = API_ROUTES.puzzles.topic(rootId);
    expect((await t.call(w.a.coach, "DELETE", route)).status).toBe(403);
    expect(await liveCounts()).toEqual({ puzzles: 3, topics: 2 });

    const res = await t.call(w.admin, "DELETE", route);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ folders: 2, puzzles: 3, success: true });
    expect(await liveCounts()).toEqual({ puzzles: 0, topics: 0 });

    // Untouched: the sibling folder and its puzzle.
    expect(await t.prisma.puzzle.count({ where: { topicId: otherId } })).toBe(1);

    const deleted = await t.prisma.withDeleted.puzzle.findMany({ where: { topicId: { in: [rootId, childId] } } });
    const topics = await t.prisma.withDeleted.puzzleTopic.findMany({ where: { id: { in: [rootId, childId] } } });
    const groups = new Set([...deleted, ...topics].map((row) => row.deleteGroupId));
    expect(groups.size).toBe(1);
    expect([...groups][0]).toEqual(expect.any(String));
  });

  it("restoring one puzzle from Trash brings the whole folder back", async () => {
    const fork = await t.prisma.withDeleted.puzzle.findFirstOrThrow({ where: { title: "Fork 1" } });
    const res = await t.call(w.superAdmin, "POST", API_ROUTES.trash.restoreItem("Puzzle", fork.id));
    expect(res.status).toBeLessThan(300);
    expect(await liveCounts()).toEqual({ puzzles: 3, topics: 2 });
  });

  it("the retention sweep purges puzzles and folders once they expire", async () => {
    expect((await t.call(w.admin, "DELETE", API_ROUTES.puzzles.topic(rootId))).status).toBe(200);
    const longAgo = new Date(Date.now() - 31 * 86_400_000);
    await t.prisma.withDeleted.puzzle.updateMany({ where: { isDeleted: true }, data: { deletedAt: longAgo } });
    await t.prisma.withDeleted.puzzleTopic.updateMany({ where: { isDeleted: true }, data: { deletedAt: longAgo } });

    await t.app.get(TrashService).cleanupExpiredTrash();

    expect(await t.prisma.withDeleted.puzzle.count({ where: { topicId: { in: [rootId, childId] } } })).toBe(0);
    expect(await t.prisma.withDeleted.puzzleTopic.count({ where: { id: { in: [rootId, childId] } } })).toBe(0);
    expect(await t.prisma.puzzle.count({ where: { topicId: otherId } })).toBe(1);
  });
});

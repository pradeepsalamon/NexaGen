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

// Deleting a puzzle folder over HTTP against real Postgres: only an empty folder
// can be deleted (no subfolders, no live puzzles); it goes to Trash, a restore
// brings it back, and the retention sweep purges it.

const FEN = "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1";

describe("Puzzle folder delete (real app, real Postgres)", () => {
  let t: TestApp;
  let w: Awaited<ReturnType<typeof createWorld>>;
  let rootId: string;
  let childId: string;
  let otherId: string;
  let emptyId: string;

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
    emptyId = (await t.prisma.puzzleTopic.create({ data: { name: "Empty", slug: "empty" } })).id;
    await puzzle("Tactic 1", rootId);
    await puzzle("Fork 1", childId);
    await puzzle("Fork 2", childId);
    await puzzle("Endgame 1", otherId);
  });
  afterAll(async () => {
    await t?.close();
  });

  it("refuses a folder that still has subfolders or puzzles, and only admins delete", async () => {
    const res = await t.call(w.admin, "DELETE", API_ROUTES.puzzles.topic(rootId));
    expect(res.status).toBe(400);
    expect((await t.call(w.admin, "DELETE", API_ROUTES.puzzles.topic(childId))).status).toBe(400);
    expect((await t.call(w.admin, "DELETE", API_ROUTES.puzzles.topic(otherId))).status).toBe(400);
    expect((await t.call(w.a.coach, "DELETE", API_ROUTES.puzzles.topic(emptyId))).status).toBe(403);
    expect(await liveCounts()).toEqual({ puzzles: 3, topics: 2 });
    expect(await t.prisma.puzzleTopic.count({ where: { id: emptyId } })).toBe(1);
  });

  it("deletes an empty folder to Trash, and a restore brings it back", async () => {
    const res = await t.call(w.admin, "DELETE", API_ROUTES.puzzles.topic(emptyId));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(await t.prisma.puzzleTopic.count({ where: { id: emptyId } })).toBe(0);
    expect(await liveCounts()).toEqual({ puzzles: 3, topics: 2 });

    const restore = await t.call(w.superAdmin, "POST", API_ROUTES.trash.restoreItem("PuzzleTopic", emptyId));
    expect(restore.status).toBeLessThan(300);
    expect(await t.prisma.puzzleTopic.count({ where: { id: emptyId } })).toBe(1);
  });

  it("the retention sweep purges a deleted folder once it expires", async () => {
    expect((await t.call(w.admin, "DELETE", API_ROUTES.puzzles.topic(emptyId))).status).toBe(200);
    const longAgo = new Date(Date.now() - 31 * 86_400_000);
    await t.prisma.withDeleted.puzzleTopic.updateMany({ where: { isDeleted: true }, data: { deletedAt: longAgo } });

    await t.app.get(TrashService).cleanupExpiredTrash();

    expect(await t.prisma.withDeleted.puzzleTopic.count({ where: { id: emptyId } })).toBe(0);
    expect(await liveCounts()).toEqual({ puzzles: 3, topics: 2 });
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Prisma, UserRole, UserStatus } from "@prisma/client";
import { MAX_LIVE_CLASS_CHAPTERS, type LiveClassChapterState } from "@nexa-chess/types";
import { LiveClassService } from "../live-class/live-class.service";
import { PrismaService } from "../prisma/prisma.service";
import { LiveClassChapterService } from "./live-class-chapter.service";

const TOKEN = "t";
const CLASS_ID = "class-1";
const BATCH_ID = "batch-1";
const AT = new Date("2026-10-17T10:00:00Z");

const asUser = (id: string, role: UserRole) => ({ id, role, status: UserStatus.ACTIVE });
const session = (batchId: string | null = BATCH_ID) => ({ batchId, classId: CLASS_ID, coachId: "coach-1" });

const STATE: LiveClassChapterState = {
  arrows: [["e2", "e4"]],
  fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  historyIndex: 0,
  orientation: "white",
  pgn: "1. e4",
  squares: {}
};

/** An in-memory `live_class_chapters` table, enough for the service's queries. */
function chapterTable() {
  let rows: any[] = [];
  let seq = 0;
  const match = (row: any, where: any = {}) =>
    Object.entries(where).every(([key, value]: [string, any]) =>
      value && typeof value === "object" && "in" in value ? value.in.includes(row[key]) : row[key] === value
    );
  const sorted = () => [...rows].sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
  const table = {
    count: jest.fn(async ({ where }: any) => rows.filter((r) => match(r, where)).length),
    create: jest.fn(async ({ data }: any) => {
      if (data.clientId && rows.some((r) => r.scopeKey === data.scopeKey && r.clientId === data.clientId)) {
        throw new Prisma.PrismaClientKnownRequestError("dup", { clientVersion: "x", code: "P2002" });
      }
      const row = { createdAt: new Date(AT.getTime() + seq), id: `ch-${++seq}`, updatedAt: AT, ...data };
      rows.push(row);
      return row;
    }),
    createMany: jest.fn(async ({ data }: any) => {
      for (const d of data) await table.create({ data: d });
      return { count: data.length };
    }),
    delete: jest.fn(async ({ where }: any) => {
      rows = rows.filter((r) => r.id !== where.id);
    }),
    deleteMany: jest.fn(async ({ where }: any) => {
      const before = rows.length;
      rows = rows.filter((r) => !match(r, where));
      return { count: before - rows.length };
    }),
    findMany: jest.fn(async ({ where }: any) => sorted().filter((r) => match(r, where))),
    findUnique: jest.fn(async ({ where }: any) => {
      if (where.id) return rows.find((r) => r.id === where.id) ?? null;
      const { scopeKey, clientId } = where.scopeKey_clientId;
      return rows.find((r) => r.scopeKey === scopeKey && r.clientId === clientId) ?? null;
    }),
    update: jest.fn(async ({ where, data }: any) => {
      const row = rows.find((r) => r.id === where.id);
      Object.assign(row, data);
      return row;
    })
  };
  return { rows: () => rows, seed: (r: any) => rows.push({ createdAt: AT, updatedAt: AT, ...r }), table };
}

describe("LiveClassChapterService", () => {
  let service: LiveClassChapterService;
  let prisma: any;
  let liveClass: any;
  let db: ReturnType<typeof chapterTable>;

  beforeEach(async () => {
    db = chapterTable();
    prisma = {
      $transaction: jest.fn(async (arg: any) => (typeof arg === "function" ? arg(prisma) : Promise.all(arg))),
      liveClassChapter: db.table,
      puzzle: { findMany: jest.fn().mockResolvedValue([]) }
    };
    liveClass = {
      resolveClassManager: jest
        .fn()
        .mockResolvedValue({ liveSession: session(), user: asUser("coach-1", UserRole.COACH) })
    };
    const module = await Test.createTestingModule({
      providers: [
        LiveClassChapterService,
        { provide: PrismaService, useValue: prisma },
        { provide: LiveClassService, useValue: liveClass }
      ]
    }).compile();
    service = module.get(LiveClassChapterService);
  });

  it("only lets the class's coach or an admin in", async () => {
    liveClass.resolveClassManager.mockRejectedValueOnce(new ForbiddenException());
    await expect(service.list(TOKEN, CLASS_ID)).rejects.toBeInstanceOf(ForbiddenException);
    expect(liveClass.resolveClassManager).toHaveBeenCalledWith(TOKEN, CLASS_ID);
  });

  it("creates chapters under the batch and lists them in order", async () => {
    await service.create(TOKEN, CLASS_ID, { clientId: "client-aaaa", state: STATE, title: "Opening" });
    const res = await service.create(TOKEN, CLASS_ID, { clientId: "client-bbbb", state: STATE, title: "Pins" });

    expect(res.scope).toBe("BATCH");
    expect(res.chapters.map((c) => [c.title, c.position])).toEqual([
      ["Opening", 0],
      ["Pins", 1]
    ]);
    expect(db.rows()[0]).toMatchObject({ batchId: BATCH_ID, liveClassId: null, scopeKey: `batch:${BATCH_ID}` });
    expect(res.chapters[0].state).toEqual(STATE);
  });

  it("keeps a class without a batch to itself", async () => {
    liveClass.resolveClassManager.mockResolvedValue({ liveSession: session(null), user: asUser("coach-1", UserRole.COACH) });
    const res = await service.create(TOKEN, CLASS_ID, { clientId: "client-aaaa", state: STATE, title: "Solo" });
    expect(res.scope).toBe("CLASS");
    expect(db.rows()[0]).toMatchObject({ batchId: null, liveClassId: CLASS_ID, scopeKey: `class:${CLASS_ID}` });
  });

  it("treats a retried create with the same clientId as the same chapter", async () => {
    await service.create(TOKEN, CLASS_ID, { clientId: "client-aaaa", state: STATE, title: "Opening" });
    const res = await service.create(TOKEN, CLASS_ID, { clientId: "client-aaaa", state: STATE, title: "Opening" });
    expect(res.chapters).toHaveLength(1);
  });

  it("refuses to grow past the chapter limit", async () => {
    for (let i = 0; i < MAX_LIVE_CLASS_CHAPTERS; i++) {
      db.seed({ id: `x${i}`, position: i, scopeKey: `batch:${BATCH_ID}`, state: STATE, title: `C${i}` });
    }
    await expect(
      service.create(TOKEN, CLASS_ID, { clientId: "client-aaaa", state: STATE, title: "One more" })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("imports visible published puzzles in order, skipping ones already added", async () => {
    db.seed({ id: "old", position: 0, puzzleId: "p2", scopeKey: `batch:${BATCH_ID}`, state: STATE, title: "Old" });
    prisma.puzzle.findMany.mockResolvedValue([
      { fen: "8/8/8/8/8/8/8/K6k b - - 0 1", id: "p3", title: "Black to move" },
      { fen: "8/8/8/8/8/8/8/K6k w - - 0 1", id: "p2", title: "Dup" }
    ]);

    const res = await service.importPuzzles(TOKEN, CLASS_ID, { puzzleIds: ["p2", "p3", "hidden"] });

    const where = prisma.puzzle.findMany.mock.calls[0][0].where;
    expect(where.status).toBe("PUBLISHED");
    expect(where.OR).toEqual([{ visibility: "GLOBAL" }, { createdById: "coach-1" }]);
    expect(res.chapters.map((c) => c.title)).toEqual(["Old", "Black to move"]);
    expect(res.chapters[1]).toMatchObject({ position: 1, puzzleId: "p3" });
    expect(res.chapters[1].state).toMatchObject({ historyIndex: -1, orientation: "black", pgn: "" });
  });

  it("does not filter puzzle visibility for an admin", async () => {
    liveClass.resolveClassManager.mockResolvedValue({ liveSession: session(), user: asUser("admin-1", UserRole.ADMIN) });
    await service.importPuzzles(TOKEN, CLASS_ID, { puzzleIds: ["p1"] });
    expect(prisma.puzzle.findMany.mock.calls[0][0].where.OR).toBeUndefined();
  });

  it("renames and saves the board into a chapter", async () => {
    db.seed({ id: "c1", position: 0, scopeKey: `batch:${BATCH_ID}`, state: STATE, title: "Old" });
    const nextState = { ...STATE, historyIndex: -1 };
    const res = await service.update(TOKEN, CLASS_ID, "c1", { state: nextState, title: "New" });
    expect(res.chapters[0]).toMatchObject({ state: nextState, title: "New" });
  });

  it("hides another batch's chapter behind a 404", async () => {
    db.seed({ id: "theirs", position: 0, scopeKey: "batch:other", state: STATE, title: "Theirs" });
    await expect(service.update(TOKEN, CLASS_ID, "theirs", { title: "Mine now" })).rejects.toBeInstanceOf(
      NotFoundException
    );
    await expect(service.remove(TOKEN, CLASS_ID, "theirs")).rejects.toBeInstanceOf(NotFoundException);
    expect(db.rows()).toHaveLength(1);
  });

  it("reorders only with the complete current list", async () => {
    for (const [i, id] of ["a", "b", "c"].entries()) {
      db.seed({ id, position: i, scopeKey: `batch:${BATCH_ID}`, state: STATE, title: id.toUpperCase() });
    }
    const res = await service.reorder(TOKEN, CLASS_ID, { ids: ["c", "a", "b"] });
    expect(res.chapters.map((c) => c.id)).toEqual(["c", "a", "b"]);

    await expect(service.reorder(TOKEN, CLASS_ID, { ids: ["c", "a"] })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.reorder(TOKEN, CLASS_ID, { ids: ["c", "c", "a"] })).rejects.toBeInstanceOf(
      ConflictException
    );
  });

  it("deletes one chapter and closes the gap in the order", async () => {
    for (const [i, id] of ["a", "b", "c"].entries()) {
      db.seed({ id, position: i, scopeKey: `batch:${BATCH_ID}`, state: STATE, title: id });
    }
    const res = await service.remove(TOKEN, CLASS_ID, "b");
    expect(res.chapters.map((c) => [c.id, c.position])).toEqual([
      ["a", 0],
      ["c", 1]
    ]);
    expect(db.rows().find((r) => r.id === "c").position).toBe(1);
  });

  describe("delete all (removeMany)", () => {
    const seedScope = (scopeKey: string, ids: string[]) =>
      ids.forEach((id, i) => db.seed({ id, position: i, scopeKey, state: STATE, title: id }));

    it("deletes every confirmed chapter in the class's scope", async () => {
      seedScope(`batch:${BATCH_ID}`, ["a", "b", "c", "d"]);
      const res = await service.removeMany(TOKEN, CLASS_ID, { ids: ["a", "b", "c", "d"] });
      expect(res).toMatchObject({ chapters: [], deleted: 4, scope: "BATCH" });
      expect(db.rows()).toHaveLength(0);
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it("never touches another batch's or class's chapters, even when their ids are sent", async () => {
      seedScope(`batch:${BATCH_ID}`, ["mine"]);
      seedScope("batch:other", ["theirs"]);
      seedScope(`class:${CLASS_ID}`, ["solo"]);
      const res = await service.removeMany(TOKEN, CLASS_ID, { ids: ["mine", "theirs", "solo"] });
      expect(res.deleted).toBe(1);
      expect(db.rows().map((r) => r.id).sort()).toEqual(["solo", "theirs"]);
      expect(db.table.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["mine", "theirs", "solo"] }, scopeKey: `batch:${BATCH_ID}` }
      });
    });

    it("keeps a chapter added after the confirmation and renumbers it", async () => {
      seedScope(`batch:${BATCH_ID}`, ["a", "b", "late"]);
      const res = await service.removeMany(TOKEN, CLASS_ID, { ids: ["a", "b"] });
      expect(res.chapters.map((c) => [c.id, c.position])).toEqual([["late", 0]]);
      expect(db.rows().find((r) => r.id === "late").position).toBe(0);
    });

    it("treats a duplicate or retried request as a no-op", async () => {
      seedScope(`batch:${BATCH_ID}`, ["a", "b"]);
      const first = await service.removeMany(TOKEN, CLASS_ID, { ids: ["a", "b", "a"] });
      const retry = await service.removeMany(TOKEN, CLASS_ID, { ids: ["a", "b"] });
      expect(first.deleted).toBe(2);
      expect(retry).toMatchObject({ chapters: [], deleted: 0 });
    });

    it("succeeds with nothing to delete on an empty list", async () => {
      const res = await service.removeMany(TOKEN, CLASS_ID, { ids: ["gone"] });
      expect(res).toMatchObject({ chapters: [], deleted: 0 });
      expect(db.table.update).not.toHaveBeenCalled();
    });

    it("refuses a caller who isn't the class's coach or an admin, deleting nothing", async () => {
      seedScope(`batch:${BATCH_ID}`, ["a"]);
      liveClass.resolveClassManager.mockRejectedValueOnce(new ForbiddenException());
      await expect(service.removeMany(TOKEN, CLASS_ID, { ids: ["a"] })).rejects.toBeInstanceOf(ForbiddenException);
      expect(db.table.deleteMany).not.toHaveBeenCalled();
      expect(db.rows()).toHaveLength(1);
    });

    it("propagates a failed transaction without reporting a delete", async () => {
      seedScope(`batch:${BATCH_ID}`, ["a", "b"]);
      prisma.$transaction.mockRejectedValueOnce(new Error("connection lost"));
      await expect(service.removeMany(TOKEN, CLASS_ID, { ids: ["a", "b"] })).rejects.toThrow("connection lost");
      expect(db.rows()).toHaveLength(2);
    });

    it("leaves puzzles alone — only chapter rows are deleted", async () => {
      db.seed({ id: "p", position: 0, puzzleId: "puzzle-1", scopeKey: `batch:${BATCH_ID}`, state: STATE, title: "P" });
      prisma.puzzle.delete = jest.fn();
      prisma.puzzle.deleteMany = jest.fn();
      await service.removeMany(TOKEN, CLASS_ID, { ids: ["p"] });
      expect(prisma.puzzle.delete).not.toHaveBeenCalled();
      expect(prisma.puzzle.deleteMany).not.toHaveBeenCalled();
    });
  });

  it("drops a stored row whose state no longer parses", async () => {
    db.seed({ id: "bad", position: 0, scopeKey: `batch:${BATCH_ID}`, state: { fen: "" }, title: "Broken" });
    db.seed({ id: "ok", position: 1, scopeKey: `batch:${BATCH_ID}`, state: STATE, title: "Fine" });
    const res = await service.list(TOKEN, CLASS_ID);
    expect(res.chapters.map((c) => c.id)).toEqual(["ok"]);
  });
});

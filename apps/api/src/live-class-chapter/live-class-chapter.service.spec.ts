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
    Object.entries(where).every(([key, value]) => row[key] === value);
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

  it("drops a stored row whose state no longer parses", async () => {
    db.seed({ id: "bad", position: 0, scopeKey: `batch:${BATCH_ID}`, state: { fen: "" }, title: "Broken" });
    db.seed({ id: "ok", position: 1, scopeKey: `batch:${BATCH_ID}`, state: STATE, title: "Fine" });
    const res = await service.list(TOKEN, CLASS_ID);
    expect(res.chapters.map((c) => c.id)).toEqual(["ok"]);
  });
});

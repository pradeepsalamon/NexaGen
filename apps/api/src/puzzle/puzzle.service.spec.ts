/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { PuzzleSource, PuzzleStatus, PuzzleVisibility, UserRole, UserStatus } from "@prisma/client";
import { AssignmentEvaluationService } from "../assignment/assignment-evaluation.service";
import { PrismaService } from "../prisma/prisma.service";
import { StockfishService } from "../stockfish/stockfish.service";
import { TrashRepository } from "../trash/trash.repository";
import { puzzleContentHash } from "./puzzle-content-hash";
import { PuzzleService } from "./puzzle.service";

const TOKEN = "access-token";
const ADMIN_ID = "admin-1";
const COACH_A = "coach-a";
const COACH_B = "coach-b";

// White to move, mate in one: Ra8#.
const MATE_FEN = "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1";
const MATE_MOVE = { uci: "a1a8", san: "Ra8#" };

const asRole = (id: string, role: UserRole) => ({ id, role, status: UserStatus.ACTIVE });

describe("PuzzleService", () => {
  let service: PuzzleService;
  let jwt: { verifyAsync: jest.Mock };
  let prisma: any;
  let trash: { softDelete: jest.Mock };

  const puzzleRow = (over: Record<string, unknown> = {}) => ({
    id: "pz-1",
    topicId: "topic-1",
    title: "Win the queen",
    description: null,
    puzzleType: "TACTICAL",
    difficulty: "EASY",
    fen: MATE_FEN,
    solutionMovesJson: [MATE_MOVE],
    explanation: null,
    hintsJson: [],
    tags: [],
    estimatedSeconds: null,
    status: PuzzleStatus.DRAFT,
    visibility: PuzzleVisibility.PRIVATE,
    createdById: COACH_A,
    createdByRole: UserRole.COACH,
    publishedAt: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    topic: { name: "Fork" },
    createdBy: { firstName: "Coach", lastName: "A" },
    _count: { attempts: 0 },
    ...over
  });

  beforeEach(async () => {
    jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: COACH_A, type: "access" }) };
    trash = { softDelete: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(asRole(COACH_A, UserRole.COACH)) },
      puzzle: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }) => puzzleRow(data)),
        update: jest.fn().mockImplementation(({ data }) => puzzleRow(data)),
        delete: jest.fn()
      },
      puzzleTopic: {
        findUnique: jest.fn().mockResolvedValue({ id: "topic-1", name: "Fork" }),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(3)
      },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma))
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PuzzleService,
        { provide: JwtService, useValue: jwt },
        { provide: PrismaService, useValue: prisma },
        { provide: TrashRepository, useValue: trash },
        {
          provide: AssignmentEvaluationService,
          useValue: new AssignmentEvaluationService({
            isAvailable: () => false
          } as unknown as StockfishService)
        }
      ]
    }).compile();

    service = moduleRef.get(PuzzleService);
  });

  it("a coach cannot open another coach's private puzzle", async () => {
    prisma.puzzle.findUnique.mockResolvedValue(puzzleRow({ createdById: COACH_B }));
    await expect(service.get(TOKEN, "pz-1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("forces a coach-authored puzzle to PRIVATE even if GLOBAL is requested", async () => {
    const res = await service.create(TOKEN, {
      title: "T",
      topicId: "topic-1",
      puzzleType: "TACTICAL",
      difficulty: "EASY",
      fen: MATE_FEN,
      solutionMoves: [MATE_MOVE],
      visibility: "GLOBAL"
    } as never);
    expect(res.puzzle.visibility).toBe("PRIVATE");
  });

  it("an admin-authored puzzle defaults to GLOBAL", async () => {
    prisma.user.findUnique.mockResolvedValue(asRole(ADMIN_ID, UserRole.ADMIN));
    jwt.verifyAsync.mockResolvedValue({ sub: ADMIN_ID, type: "access" });
    const res = await service.create(TOKEN, {
      title: "T",
      topicId: "topic-1",
      puzzleType: "TACTICAL",
      difficulty: "EASY",
      fen: MATE_FEN,
      solutionMoves: [MATE_MOVE]
    } as never);
    expect(res.puzzle.visibility).toBe("GLOBAL");
  });

  it("a coach cannot edit an admin-owned puzzle", async () => {
    prisma.puzzle.findUnique.mockResolvedValue(
      puzzleRow({ createdById: ADMIN_ID, visibility: PuzzleVisibility.GLOBAL })
    );
    await expect(service.update(TOKEN, "pz-1", { title: "x" })).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it("rejects publishing a puzzle with no solution line", async () => {
    prisma.puzzle.findUnique.mockResolvedValue(puzzleRow({ solutionMovesJson: [] }));
    await expect(
      service.setPublished(TOKEN, "pz-1", { published: true })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("importMany creates every valid puzzle and reports the bad ones", async () => {
    const base = {
      topicId: "topic-1",
      puzzleType: "TACTICAL" as const,
      difficulty: "EASY" as const,
      solutionMoves: []
    };
    const res = await service.importMany(TOKEN, {
      puzzles: [
        { ...base, title: "Good", fen: MATE_FEN, solutionMoves: [MATE_MOVE] },
        { ...base, title: "Bad", fen: "not a fen" },
        { ...base, title: "Position only", fen: MATE_FEN }
      ]
    });
    expect(res.created).toBe(2);
    expect(res.failed).toEqual([expect.objectContaining({ index: 1, title: "Bad" })]);
    expect(prisma.puzzle.create).toHaveBeenCalledTimes(2);
    expect(prisma.puzzleTopic.findUnique).toHaveBeenCalledTimes(1);
  });

  it("duplicate creates a PRIVATE DRAFT owned by the caller", async () => {
    prisma.puzzle.findUnique.mockResolvedValue(puzzleRow({ status: PuzzleStatus.PUBLISHED }));
    await service.duplicate(TOKEN, "pz-1");
    const data = prisma.puzzle.create.mock.calls[0][0].data;
    expect(data.status).toBe(PuzzleStatus.DRAFT);
    expect(data.visibility).toBe(PuzzleVisibility.PRIVATE);
    expect(data.createdById).toBe(COACH_A);
  });

  it("stores the content hash on create and when the line changes", async () => {
    await service.create(TOKEN, {
      title: "T",
      topicId: "topic-1",
      puzzleType: "TACTICAL",
      difficulty: "EASY",
      fen: MATE_FEN,
      solutionMoves: [MATE_MOVE]
    } as never);
    expect(prisma.puzzle.create.mock.calls[0][0].data.contentHash).toBe(
      puzzleContentHash(MATE_FEN, [MATE_MOVE])
    );

    prisma.puzzle.findUnique.mockResolvedValue(puzzleRow());
    await service.update(TOKEN, "pz-1", { title: "Renamed" });
    expect(prisma.puzzle.update.mock.calls[0][0].data).not.toHaveProperty("contentHash");

    await service.update(TOKEN, "pz-1", { solutionMoves: [{ uci: "a1a7", san: "Ra7" }] });
    expect(prisma.puzzle.update.mock.calls[1][0].data.contentHash).toBe(
      puzzleContentHash(MATE_FEN, [{ uci: "a1a7" }])
    );
  });

  it("refuses a position or line edit on a Lichess puzzle", async () => {
    prisma.puzzle.findUnique.mockResolvedValue(
      puzzleRow({ source: PuzzleSource.LICHESS, sourceId: "00abc" })
    );
    await expect(
      service.update(TOKEN, "pz-1", { solutionMoves: [{ uci: "a1a7", san: "Ra7" }] })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update(TOKEN, "pz-1", { title: "Renamed" })).resolves.toBeDefined();
  });

  it("duplicate copies the content hash, rating and setup move as a NEXA puzzle", async () => {
    prisma.puzzle.findUnique.mockResolvedValue(
      puzzleRow({ source: PuzzleSource.LICHESS, sourceId: "00abc", rating: 1450, setupMoveUci: "h7h6" })
    );
    await service.duplicate(TOKEN, "pz-1");
    const data = prisma.puzzle.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ rating: 1450, setupMoveUci: "h7h6" });
    expect(data.contentHash).toBe(puzzleContentHash(MATE_FEN, [MATE_MOVE]));
    expect(data).not.toHaveProperty("source");
    expect(data).not.toHaveProperty("sourceId");
  });

  it("remove soft-deletes through the Trash repository", async () => {
    prisma.puzzle.findUnique.mockResolvedValue(puzzleRow());
    await service.remove(TOKEN, "pz-1");
    expect(trash.softDelete).toHaveBeenCalledWith(prisma, "Puzzle", "pz-1", COACH_A);
    expect(prisma.puzzle.delete).not.toHaveBeenCalled();
  });

  it("sorts and pages titles in the database, tie-broken by id", async () => {
    prisma.puzzle.findMany.mockResolvedValue([]);

    await service.list(TOKEN, { page: 2, pageSize: 3 } as any);
    expect(prisma.puzzle.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ orderBy: [{ title: "asc" }, { id: "asc" }], skip: 3, take: 3 })
    );

    await service.list(TOKEN, { page: 1, pageSize: 2, sort: "title", order: "desc" } as any);
    expect(prisma.puzzle.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ orderBy: [{ title: "desc" }, { id: "asc" }] })
    );
  });

  it("filters by exact piece placement inside the caller's visibility (PDF import duplicate check)", async () => {
    prisma.puzzle.findMany.mockResolvedValue([]);
    await service.list(TOKEN, { placement: "4k3/8/8/8/8/8/8/4K3" } as any);
    const where = prisma.puzzle.findMany.mock.calls.at(-1)[0].where;
    expect(where.AND).toContainEqual({ fen: { startsWith: "4k3/8/8/8/8/8/8/4K3 " } });
    // The coach's visibility scope is still the outer filter.
    expect(where.OR).toEqual([{ visibility: PuzzleVisibility.GLOBAL }, { createdById: COACH_A }]);

    await expect(service.list(TOKEN, { placement: "x' OR 1=1" } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.list(TOKEN, { placement: "8/8/8" } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  describe("system folders (Lichess, asked in class)", () => {
    beforeEach(() => {
      prisma.puzzleTopic.findFirst.mockResolvedValue({ id: "folder-lichess" });
      prisma.puzzleTopic.findMany.mockResolvedValue([{ id: "folder-lichess" }, { id: "folder-live" }]);
    });

    const lastWhere = () => prisma.puzzle.findMany.mock.calls.at(-1)[0].where;

    it("is left out of the library unless it is the folder being opened", async () => {
      await service.list(TOKEN, {} as any);
      expect(lastWhere().AND).toContainEqual({ topicId: { notIn: ["folder-lichess", "folder-live"] } });

      await service.list(TOKEN, { topicId: "folder-lichess", topicScope: "direct" } as any);
      expect(lastWhere().AND).toContainEqual({ topicId: { notIn: ["folder-live"] } });
    });

    it("is counted on its own in stats", async () => {
      prisma.puzzle.count.mockImplementation(({ where }: any) =>
        where.topicId === "folder-lichess" ? 7 : 2
      );
      const res = await service.stats(TOKEN);
      expect(res.trainingCache).toBe(7);
      expect(res.total).toBe(2);
      expect(prisma.puzzle.count.mock.calls[0][0].where.topicId).toEqual({
        notIn: ["folder-lichess", "folder-live"]
      });
    });
  });

  it("labels a catalogue copy's author as Lichess", async () => {
    prisma.puzzle.findUnique.mockResolvedValue(
      puzzleRow({ source: PuzzleSource.LICHESS, visibility: PuzzleVisibility.GLOBAL, createdById: null, createdBy: null })
    );
    const res = await service.get(TOKEN, "pz-1");
    expect(res.puzzle.createdByName).toBe("Lichess");
    expect(res.puzzle.source).toBe(PuzzleSource.LICHESS);
  });

  it("importMany warns about a position + line already in the library, but still creates it", async () => {
    prisma.puzzle.create.mockImplementation(({ data }: any) => puzzleRow({ ...data, id: "pz-new" }));
    prisma.puzzle.findMany.mockResolvedValue([
      { id: "pz-old", title: "Back rank", contentHash: puzzleContentHash(MATE_FEN, [MATE_MOVE]) }
    ]);
    const res = await service.importMany(TOKEN, {
      puzzles: [
        {
          topicId: "topic-1",
          puzzleType: "TACTICAL",
          difficulty: "EASY",
          title: "Again",
          fen: MATE_FEN,
          solutionMoves: [MATE_MOVE]
        }
      ]
    });
    expect(res.created).toBe(1);
    expect(res.duplicates).toEqual([
      { index: 0, title: "Again", existingPuzzleId: "pz-old", existingTitle: "Back rank" }
    ]);
    // Only puzzles the coach can see, other than the ones just created.
    expect(prisma.puzzle.findMany.mock.calls[0][0].where).toMatchObject({
      OR: [{ visibility: PuzzleVisibility.GLOBAL }, { createdById: COACH_A }],
      id: { notIn: ["pz-new"] }
    });
  });

  describe("bulkUpdate", () => {
    const asAdmin = () => {
      prisma.user.findUnique.mockResolvedValue(asRole(ADMIN_ID, UserRole.ADMIN));
      jwt.verifyAsync.mockResolvedValue({ sub: ADMIN_ID, type: "access" });
    };

    it("writes only the requested fields, to the selected puzzles", async () => {
      asAdmin();
      prisma.puzzleTopic.findUnique.mockResolvedValue({ slug: "endgames" });
      prisma.puzzle.findMany.mockResolvedValue([
        puzzleRow({ id: "pz-1", tags: ["fork", "old"] }),
        puzzleRow({ id: "pz-2", tags: [] })
      ]);

      const res = await service.bulkUpdate(TOKEN, {
        ids: ["pz-1", "pz-2"],
        topicId: "topic-2",
        addTags: ["Pin"],
        removeTags: ["OLD"]
      });

      expect(res).toEqual({ updated: 2, skipped: [] });
      expect(prisma.puzzle.findMany.mock.calls[0][0].where.id).toEqual({ in: ["pz-1", "pz-2"] });
      expect(prisma.puzzle.update).toHaveBeenCalledWith({
        where: { id: "pz-1" },
        data: { updatedById: ADMIN_ID, topicId: "topic-2", tags: ["fork", "Pin"] }
      });
      expect(prisma.puzzle.update).toHaveBeenCalledWith({
        where: { id: "pz-2" },
        data: { updatedById: ADMIN_ID, topicId: "topic-2", tags: ["Pin"] }
      });
    });

    it("skips another coach's puzzle, one moved out of the folder, and a missing one", async () => {
      prisma.puzzle.findMany.mockResolvedValue([
        puzzleRow({ id: "mine" }),
        puzzleRow({ id: "theirs", createdById: COACH_B, visibility: PuzzleVisibility.GLOBAL }),
        puzzleRow({ id: "moved", topicId: "topic-9" })
      ]);

      const res = await service.bulkUpdate(TOKEN, {
        ids: ["mine", "theirs", "moved", "gone"],
        fromTopicId: "topic-1",
        difficulty: "ADVANCED"
      });

      expect(res.updated).toBe(1);
      expect(res.skipped.map((s) => s.id)).toEqual(["theirs", "moved", "gone"]);
      expect(prisma.puzzle.update).toHaveBeenCalledTimes(1);
      expect(prisma.puzzle.update.mock.calls[0][0].where).toEqual({ id: "mine" });
    });

    it("never publishes a puzzle without a solution, and leaves the others' status dates alone", async () => {
      asAdmin();
      prisma.puzzle.findMany.mockResolvedValue([
        puzzleRow({ id: "empty", solutionMovesJson: [] }),
        puzzleRow({ id: "live", status: PuzzleStatus.PUBLISHED }),
        puzzleRow({ id: "draft" })
      ]);

      const res = await service.bulkUpdate(TOKEN, { ids: ["empty", "live", "draft"], status: "PUBLISHED" });

      expect(res.updated).toBe(2);
      expect(res.skipped).toEqual([expect.objectContaining({ id: "empty" })]);
      const byId = Object.fromEntries(
        prisma.puzzle.update.mock.calls.map(([arg]: any[]) => [arg.where.id, arg.data])
      );
      expect(byId.live).toEqual({ updatedById: ADMIN_ID });
      expect(byId.draft).toMatchObject({ status: PuzzleStatus.PUBLISHED, publishedById: ADMIN_ID });
    });

    it("replaces text in titles and skips a title that would become empty", async () => {
      asAdmin();
      prisma.puzzle.findMany.mockResolvedValue([
        puzzleRow({ id: "a", title: "Fork 1" }),
        puzzleRow({ id: "b", title: "Fork" })
      ]);

      const res = await service.bulkUpdate(TOKEN, {
        ids: ["a", "b"],
        titleReplace: { find: "Fork", replace: "" }
      });

      expect(res.updated).toBe(1);
      expect(res.skipped).toEqual([expect.objectContaining({ id: "b" })]);
      expect(prisma.puzzle.update).toHaveBeenCalledWith({
        where: { id: "a" },
        data: { updatedById: ADMIN_ID, title: "1" }
      });
    });

    it("refuses a tag change that would exceed the tag limit", async () => {
      asAdmin();
      prisma.puzzle.findMany.mockResolvedValue([
        puzzleRow({ id: "full", tags: Array.from({ length: 12 }, (_, i) => `t${i}`) })
      ]);
      const res = await service.bulkUpdate(TOKEN, { ids: ["full"], addTags: ["extra"] });
      expect(res).toEqual({ updated: 0, skipped: [expect.objectContaining({ id: "full" })] });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("rejects a missing or system target folder before touching any puzzle", async () => {
      asAdmin();
      prisma.puzzleTopic.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.bulkUpdate(TOKEN, { ids: ["pz-1"], topicId: "nope" })
      ).rejects.toBeInstanceOf(BadRequestException);
      prisma.puzzleTopic.findUnique.mockResolvedValueOnce({ slug: "__lichess" });
      await expect(
        service.bulkUpdate(TOKEN, { ids: ["pz-1"], topicId: "lichess-folder" })
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.puzzle.findMany).not.toHaveBeenCalled();
    });
  });
});

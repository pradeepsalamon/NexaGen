/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { LICHESS_FOLDER_SLUG } from "@nexa-chess/types";
import {
  Prisma,
  PuzzleDifficulty,
  PuzzleSource,
  PuzzleStatus,
  PuzzleType,
  PuzzleVisibility,
  UserRole,
  UserStatus
} from "@prisma/client";
import { AssignmentEvaluationService } from "../assignment/assignment-evaluation.service";
import { PrismaService } from "../prisma/prisma.service";
import { StockfishService } from "../stockfish/stockfish.service";
import { TrashRepository } from "../trash/trash.repository";
import { puzzleContentHash } from "./puzzle-content-hash";
import {
  PuzzleCatalogService,
  buildLichessPuzzleCopy,
  catalogPuzzleTitle,
  decodeCatalogCursor,
  decodeCatalogRatingCursor,
  difficultyForRating,
  encodeCatalogCursor,
  encodeCatalogRatingCursor,
  puzzleTypeForThemes
} from "./puzzle-catalog.service";

const TOKEN = "access-token";
const ADMIN_ID = "admin-1";
const COACH_ID = "coach-1";

// A real catalogue row (2026-10-02 dump): Rxe4 is the setup, then Qb1+ Kf2 Qxe4 forks.
const ROW = {
  id: "KsvGQ",
  fen: "8/p4p1p/1p3R2/6pk/3Bb3/1qP3P1/8/4R1K1 w - - 2 38",
  moves: "e1e4 b3b1 g1f2 b1e4",
  rating: 1444,
  ratingDeviation: 75,
  popularity: 90,
  nbPlays: 800,
  themes: ["crushing", "endgame", "fork", "short"],
  openingTags: [],
  gameUrl: "https://lichess.org/abc#76",
  ratingBand: 28,
  randKey: 123,
  contentHash: "x",
  passesQualityGate: true,
  retiredAt: null,
  releaseId: "r1"
};
const POST_SETUP_FEN = "8/p4p1p/1p3R2/6pk/3BR3/1qP3P1/8/6K1 b - - 0 38";

const evaluation = new AssignmentEvaluationService({ isAvailable: () => false } as unknown as StockfishService);
const asRole = (id: string, role: UserRole) => ({ id, role, status: UserStatus.ACTIVE });

describe("catalogue transform (spec §3)", () => {
  it("copies the post-setup position, the line, the rating and the themes", () => {
    const copy = buildLichessPuzzleCopy(ROW, evaluation);
    expect(copy.fen).toBe(POST_SETUP_FEN);
    expect(copy.setupMoveUci).toBe("e1e4");
    expect(copy.solutionMovesJson).toEqual([
      { uci: "b3b1", san: "Qb1+" },
      { uci: "g1f2", san: "Kf2" },
      { uci: "b1e4", san: "Qxe4" }
    ]);
    expect(copy.contentHash).toBe(
      puzzleContentHash(POST_SETUP_FEN, [{ uci: "b3b1" }, { uci: "g1f2" }, { uci: "b1e4" }])
    );
    expect(copy).toMatchObject({
      title: "Fork · 1444",
      puzzleType: PuzzleType.ENDGAME,
      difficulty: PuzzleDifficulty.INTERMEDIATE,
      rating: 1444,
      tags: ROW.themes,
      hintsJson: [],
      status: PuzzleStatus.PUBLISHED,
      visibility: PuzzleVisibility.GLOBAL,
      source: PuzzleSource.LICHESS,
      sourceId: "KsvGQ"
    });
  });

  it("rejects a row whose setup move is illegal", () => {
    expect(() => buildLichessPuzzleCopy({ ...ROW, moves: "e1e8 b3b1" }, evaluation)).toThrow(BadRequestException);
  });

  it.each([
    [899, PuzzleDifficulty.BEGINNER],
    [900, PuzzleDifficulty.EASY],
    [1149, PuzzleDifficulty.EASY],
    [1150, PuzzleDifficulty.INTERMEDIATE],
    [1450, PuzzleDifficulty.ADVANCED],
    [1750, PuzzleDifficulty.EXPERT]
  ])("rating %i is %s", (rating, difficulty) => {
    expect(difficultyForRating(rating)).toBe(difficulty);
  });

  it.each([
    [["fork", "smotheredMate"], PuzzleType.CHECKMATE],
    [["mate", "short"], PuzzleType.CHECKMATE],
    [["rookEndgame"], PuzzleType.ENDGAME],
    [["endgame", "fork"], PuzzleType.ENDGAME],
    [["opening", "pin"], PuzzleType.OPENING],
    [["pin"], PuzzleType.TACTICAL]
  ])("themes %j are %s", (themes, type) => {
    expect(puzzleTypeForThemes(themes)).toBe(type);
  });

  it("names the primary motif, mate patterns first, else 'Puzzle'", () => {
    expect(catalogPuzzleTitle(["fork", "backRankMate", "mateIn2"], 1200)).toBe("Back rank mate · 1200");
    expect(catalogPuzzleTitle(["crushing", "short"], 900)).toBe("Puzzle · 900");
  });

  it("round-trips a cursor and rejects garbage", () => {
    const cursor = { band: 28, randKey: 2147483647, id: "KsvGQ" };
    expect(decodeCatalogCursor(encodeCatalogCursor(cursor))).toEqual(cursor);
    expect(() => decodeCatalogCursor("28.1.'; drop")).toThrow(BadRequestException);
  });

  it("round-trips a rating cursor, and never confuses it with a walk cursor", () => {
    expect(decodeCatalogRatingCursor(encodeCatalogRatingCursor({ rating: 950, id: "KsvGQ" }))).toEqual({
      rating: 950,
      id: "KsvGQ"
    });
    expect(() => decodeCatalogRatingCursor("28.123.KsvGQ")).toThrow(BadRequestException);
    expect(() => decodeCatalogCursor("r.950.KsvGQ")).toThrow(BadRequestException);
    expect(() => decodeCatalogRatingCursor("r.950.'; drop")).toThrow(BadRequestException);
  });
});

describe("PuzzleCatalogService", () => {
  let service: PuzzleCatalogService;
  let prisma: any;
  let tx: any;
  let trash: { restore: jest.Mock };
  let role: UserRole;

  const copy = (over: Record<string, unknown> = {}) => ({
    id: "pz-1",
    title: "Fork · 1444",
    topicId: "folder-lichess",
    status: PuzzleStatus.PUBLISHED,
    contentHash: "hash-1",
    isDeleted: false,
    topic: { name: "Lichess", slug: LICHESS_FOLDER_SLUG },
    ...over
  });

  beforeEach(async () => {
    role = UserRole.COACH;
    trash = { restore: jest.fn() };
    tx = { $executeRawUnsafe: jest.fn(), $queryRaw: jest.fn().mockResolvedValue([]) };
    prisma = {
      user: { findUnique: jest.fn(() => asRole(role === UserRole.COACH ? COACH_ID : ADMIN_ID, role)) },
      lichessPuzzle: { findUnique: jest.fn().mockResolvedValue(ROW) },
      puzzle: {
        create: jest.fn(({ data }) => copy({ id: "pz-new", topicId: data.topicId, contentHash: data.contentHash })),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn()
      },
      puzzleTopic: {
        create: jest.fn().mockResolvedValue({ id: "folder-lichess" }),
        findUnique: jest.fn().mockResolvedValue({ id: "folder-forks", name: "Forks", slug: "forks" })
      },
      withDeleted: {
        puzzle: { findFirst: jest.fn().mockResolvedValue(null) },
        puzzleTopic: {
          findFirst: jest.fn().mockResolvedValue({ id: "folder-lichess", isDeleted: false }),
          delete: jest.fn()
        }
      },
      $transaction: jest.fn((cb: (client: unknown) => unknown) => cb(tx))
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PuzzleCatalogService,
        { provide: JwtService, useValue: { verifyAsync: jest.fn(() => ({ sub: "u", type: "access" })) } },
        { provide: PrismaService, useValue: prisma },
        { provide: TrashRepository, useValue: trash },
        { provide: AssignmentEvaluationService, useValue: evaluation }
      ]
    }).compile();
    service = moduleRef.get(PuzzleCatalogService);
  });

  describe("list", () => {
    it("never sends a solution and pages with a cursor from the extra row", async () => {
      tx.$queryRaw.mockResolvedValue([ROW, { ...ROW, id: "KsvGR", randKey: 124 }]);
      prisma.puzzle.findMany.mockResolvedValue([
        { id: "pz-1", sourceId: "KsvGQ", topic: { name: "Forks", slug: "forks" } }
      ]);

      const res = await service.list(TOKEN, { pageSize: 1, seed: 5 });

      expect(res.hasMore).toBe(true);
      expect(res.nextCursor).toBe("28.123.KsvGQ");
      expect(res.puzzles).toHaveLength(1);
      const [row] = res.puzzles;
      expect(row).toMatchObject({
        sourceId: "KsvGQ",
        postSetupFen: POST_SETUP_FEN,
        setupMove: { uci: "e1e4", san: "Rxe4" },
        sideToMove: "black",
        inLibrary: { puzzleId: "pz-1", topicName: "Forks", adopted: true }
      });
      expect(row).not.toHaveProperty("solutionMoves");
      expect(row).not.toHaveProperty("moves");
      // Both guards run inside the same transaction as the query.
      expect(tx.$executeRawUnsafe).toHaveBeenCalledWith("SET LOCAL statement_timeout = '3s'");
      expect(tx.$executeRawUnsafe).toHaveBeenCalledWith("SET LOCAL plan_cache_mode = force_custom_plan");
    });

    it("keeps the quality gate for a coach even when asked to include below-gate rows", async () => {
      await service.list(TOKEN, { includeBelowGate: true });
      expect(sqlOf(tx.$queryRaw)).toContain(`"passesQualityGate"`);

      role = UserRole.ADMIN;
      await service.list(TOKEN, { includeBelowGate: true });
      expect(sqlOf(tx.$queryRaw)).not.toContain(`"passesQualityGate"`);
    });

    it("turns a statement timeout into an empty, flagged page", async () => {
      tx.$queryRaw.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("canceling statement due to statement timeout", {
          code: "P2010",
          clientVersion: "6",
          meta: { code: "57014" }
        })
      );
      await expect(service.list(TOKEN, { themes: ["killBoxMate"] })).resolves.toEqual({
        puzzles: [],
        nextCursor: null,
        hasMore: false,
        timedOut: true
      });
    });

    it("sorts by exact rating then id, low to high, with a rating cursor", async () => {
      tx.$queryRaw.mockResolvedValue([ROW, { ...ROW, id: "KsvGR", rating: 1450 }]);
      const res = await service.list(TOKEN, { pageSize: 1, ratingMin: 1000, ratingMax: 1500, sort: "rating_asc", seed: 9 });
      const sql = sqlOf(tx.$queryRaw);
      expect(sql).toContain("ORDER BY rating, id");
      expect(sql).not.toContain('"ratingBand" BETWEEN');
      expect(sql).not.toContain("(rating, id) >"); // first page: no keyset
      expect(res.nextCursor).toBe("r.1444.KsvGQ");

      await service.list(TOKEN, { cursor: res.nextCursor!, pageSize: 1, sort: "rating_asc" });
      const next = tx.$queryRaw.mock.calls[tx.$queryRaw.mock.calls.length - 1];
      expect(sqlOf(tx.$queryRaw)).toContain("(rating, id) > (");
      expect(Prisma.sql(next[0], ...next.slice(1)).values).toEqual(expect.arrayContaining([1444, "KsvGQ"]));
    });

    it("sorts high to low with the keyset reversed", async () => {
      await service.list(TOKEN, { cursor: "r.1600.abc", sort: "rating_desc" });
      const sql = sqlOf(tx.$queryRaw);
      expect(sql).toContain("ORDER BY rating DESC, id DESC");
      expect(sql).toContain("(rating, id) < (");
    });

    it("keeps the shuffled walk order when no sort is sent", async () => {
      await service.list(TOKEN, { ratingMin: 1000, ratingMax: 1500 });
      const sql = sqlOf(tx.$queryRaw);
      expect(sql).toContain(`ORDER BY "ratingBand", "randKey", id`);
      await expect(service.list(TOKEN, { cursor: "r.1444.KsvGQ" })).rejects.toThrow(BadRequestException);
      await expect(service.list(TOKEN, { cursor: "28.1.KsvGQ", sort: "rating_asc" })).rejects.toThrow(
        BadRequestException
      );
    });

    it("refuses an inverted rating window and students", async () => {
      await expect(service.list(TOKEN, { ratingMin: 1600, ratingMax: 1200 })).rejects.toThrow(BadRequestException);
      role = UserRole.STUDENT;
      await expect(service.list(TOKEN, {})).rejects.toThrow(ForbiddenException);
    });
  });

  it("preview is the route that carries the solution", async () => {
    const res = await service.preview(TOKEN, "KsvGQ");
    expect(res.puzzle.solutionMoves.map((m) => m.san)).toEqual(["Qb1+", "Kf2", "Qxe4"]);
    expect(res.puzzle.gameUrl).toBe(ROW.gameUrl);

    prisma.lichessPuzzle.findUnique.mockResolvedValue(null);
    await expect(service.preview(TOKEN, "nope0")).rejects.toThrow(NotFoundException);
  });

  describe("materialise (spec §4)", () => {
    it("creates one copy in the system folder with no author", async () => {
      await expect(service.materialiseOne(TOKEN, { sourceId: "KsvGQ" })).resolves.toEqual({ puzzleId: "pz-new" });
      expect(prisma.puzzle.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            topicId: "folder-lichess",
            createdById: null,
            createdByRole: UserRole.ADMIN,
            source: PuzzleSource.LICHESS,
            sourceId: "KsvGQ"
          })
        })
      );
    });

    it("returns an existing copy instead of creating a second", async () => {
      prisma.withDeleted.puzzle.findFirst.mockResolvedValue(copy());
      await expect(service.materialiseOne(TOKEN, { sourceId: "KsvGQ" })).resolves.toEqual({ puzzleId: "pz-1" });
      expect(prisma.puzzle.create).not.toHaveBeenCalled();
    });

    it("re-reads the winner when a concurrent materialise hits the unique index", async () => {
      prisma.withDeleted.puzzle.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(copy({ id: "pz-race" }));
      prisma.puzzle.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("dup", {
          code: "P2002",
          clientVersion: "6",
          meta: { target: ["source", "sourceId"] }
        })
      );
      await expect(service.materialiseOne(TOKEN, { sourceId: "KsvGQ" })).resolves.toEqual({ puzzleId: "pz-race" });
    });

    it("refuses a copy in the Trash or an archived one, and an unknown id", async () => {
      prisma.withDeleted.puzzle.findFirst.mockResolvedValue(copy({ isDeleted: true }));
      await expect(service.materialiseOne(TOKEN, { sourceId: "KsvGQ" })).rejects.toThrow(ConflictException);

      prisma.withDeleted.puzzle.findFirst.mockResolvedValue(copy({ status: PuzzleStatus.ARCHIVED }));
      await expect(service.materialiseOne(TOKEN, { sourceId: "KsvGQ" })).rejects.toThrow(ConflictException);

      prisma.withDeleted.puzzle.findFirst.mockResolvedValue(null);
      prisma.lichessPuzzle.findUnique.mockResolvedValue(null);
      await expect(service.materialiseOne(TOKEN, { sourceId: "nope0" })).rejects.toThrow(NotFoundException);
    });

    it("creates the system folder on first use and restores a trashed one", async () => {
      prisma.withDeleted.puzzleTopic.findFirst.mockResolvedValueOnce(null);
      await expect(service.ensureLichessFolder(COACH_ID)).resolves.toBe("folder-lichess");
      expect(prisma.puzzleTopic.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ slug: LICHESS_FOLDER_SLUG }) })
      );

      prisma.withDeleted.puzzleTopic.findFirst.mockResolvedValueOnce({ id: "folder-old", isDeleted: true });
      await expect(service.ensureLichessFolder(COACH_ID)).resolves.toBe("folder-old");
      expect(trash.restore).toHaveBeenCalledWith("PuzzleTopic", "folder-old", COACH_ID);
    });

    it("re-reads the folder a concurrent first use created, and steps around an admin's 'Lichess'", async () => {
      const dup = () =>
        new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "6", meta: { target: ["slug"] } });
      prisma.withDeleted.puzzleTopic.findFirst.mockResolvedValue(null);
      prisma.puzzleTopic.findFirst = jest.fn().mockResolvedValueOnce({ id: "folder-winner" });
      prisma.puzzleTopic.create.mockRejectedValueOnce(dup());
      await expect(service.ensureLichessFolder(COACH_ID)).resolves.toBe("folder-winner");

      // Name taken by an admin folder, no live system folder: the next name is tried.
      prisma.puzzleTopic.findFirst.mockResolvedValue(null);
      prisma.puzzleTopic.create.mockRejectedValueOnce(dup()).mockResolvedValueOnce({ id: "folder-new" });
      await expect(service.ensureLichessFolder(COACH_ID)).resolves.toBe("folder-new");
      expect(prisma.puzzleTopic.create.mock.calls.at(-1)[0].data.name).toBe("Lichess catalogue");
    });
  });

  describe("adopt", () => {
    beforeEach(() => {
      role = UserRole.ADMIN;
    });

    it("is admin-only and never targets the system folder", async () => {
      role = UserRole.COACH;
      await expect(service.adopt(TOKEN, { sourceIds: ["KsvGQ"], topicId: "folder-forks" })).rejects.toThrow(
        ForbiddenException
      );
      role = UserRole.ADMIN;
      prisma.puzzleTopic.findUnique.mockResolvedValue({ id: "folder-lichess", name: "Lichess", slug: LICHESS_FOLDER_SLUG });
      await expect(service.adopt(TOKEN, { sourceIds: ["KsvGQ"], topicId: "folder-lichess" })).rejects.toThrow(
        BadRequestException
      );
    });

    it("reports one outcome per source id", async () => {
      const existing: Record<string, unknown> = {
        MOVE1: copy({ id: "pz-move", contentHash: "hash-dup" }),
        HERE1: copy({ id: "pz-here", topicId: "folder-forks", topic: { name: "Forks", slug: "forks" } }),
        DRAFT: copy({ id: "pz-draft", status: PuzzleStatus.DRAFT }),
        TRASH: copy({ id: "pz-trash", isDeleted: true })
      };
      prisma.withDeleted.puzzle.findFirst.mockImplementation(
        ({ where }: any) => existing[where.sourceId] ?? null
      );
      prisma.lichessPuzzle.findUnique.mockImplementation(({ where }: any) =>
        where.id === "GONE0" ? null : { ...ROW, id: where.id }
      );
      prisma.puzzle.findMany.mockResolvedValue([{ id: "pz-mine", title: "My fork", contentHash: "hash-dup" }]);

      const res = await service.adopt(TOKEN, {
        sourceIds: ["KsvGQ", "MOVE1", "HERE1", "DRAFT", "TRASH", "GONE0", "KsvGQ"],
        topicId: "folder-forks"
      });

      expect(res.adopted).toBe(1);
      expect(res.moved).toBe(1);
      expect(res.results.map((r) => [r.sourceId, r.outcome])).toEqual([
        ["KsvGQ", "CREATED"],
        ["MOVE1", "MOVED"],
        ["HERE1", "ALREADY_IN_FOLDER"],
        ["DRAFT", "NOT_PUBLISHED"],
        ["TRASH", "IN_TRASH"],
        ["GONE0", "NOT_FOUND"]
      ]);
      expect(res.results[1].duplicateOf).toEqual({ puzzleId: "pz-mine", title: "My fork" });
      expect(res.results[2].topicName).toBe("Forks");
      expect(prisma.puzzle.update).toHaveBeenCalledTimes(1);
      expect(prisma.puzzle.update).toHaveBeenCalledWith({
        where: { id: "pz-move" },
        data: { topicId: "folder-forks", updatedById: ADMIN_ID }
      });
      expect(prisma.puzzle.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ topicId: "folder-forks", createdById: ADMIN_ID }) })
      );
    });
  });
});

/** The SQL text of the last `$queryRaw` tagged-template call. */
function sqlOf(mock: jest.Mock): string {
  const [strings, ...values] = mock.mock.calls[mock.mock.calls.length - 1];
  return Prisma.sql(strings, ...values).sql;
}

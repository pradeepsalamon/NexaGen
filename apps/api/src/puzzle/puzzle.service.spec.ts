/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { PuzzleStatus, PuzzleVisibility, UserRole, UserStatus } from "@prisma/client";
import { AssignmentEvaluationService } from "../assignment/assignment-evaluation.service";
import { PrismaService } from "../prisma/prisma.service";
import { StockfishService } from "../stockfish/stockfish.service";
import { TrashRepository } from "../trash/trash.repository";
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
});

/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { PuzzleStatus, PuzzleVisibility, UserRole, UserStatus } from "@prisma/client";
import { AnalyticsEventService } from "../analytics/analytics-event.service";
import { AssignmentEvaluationService } from "../assignment/assignment-evaluation.service";
import { PrismaService } from "../prisma/prisma.service";
import { StockfishService } from "../stockfish/stockfish.service";
import { PuzzleAttemptService } from "./puzzle-attempt.service";

const TOKEN = "t";
const STUDENT_ID = "student-1";

// White to move, mate in one: Ra8#.
const MATE_FEN = "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1";
const MATE_MOVE = { uci: "a1a8", san: "Ra8#" };

const asRole = (id: string, role: UserRole) => ({ id, role, status: UserStatus.ACTIVE });

describe("PuzzleAttemptService", () => {
  let service: PuzzleAttemptService;
  let prisma: any;

  const globalPuzzle = (over: Record<string, unknown> = {}) => ({
    id: "pz-1",
    topicId: "t1",
    title: "Mate",
    description: null,
    puzzleType: "CHECKMATE",
    difficulty: "EASY",
    fen: MATE_FEN,
    solutionMovesJson: [MATE_MOVE],
    explanation: "Back rank.",
    hintsJson: ["Open file."],
    tags: [],
    estimatedSeconds: null,
    status: PuzzleStatus.PUBLISHED,
    visibility: PuzzleVisibility.GLOBAL,
    createdById: "coach-x",
    createdByRole: UserRole.COACH,
    publishedAt: new Date(),
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    topic: { name: "Back Rank" },
    createdBy: { firstName: "C", lastName: "X" },
    ...over
  });

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn().mockResolvedValue(asRole(STUDENT_ID, UserRole.STUDENT)) },
      puzzle: {
        findUnique: jest.fn().mockResolvedValue(globalPuzzle()),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0)
      },
      puzzleAttempt: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(({ data }) => ({
          id: "att-1",
          status: "IN_PROGRESS",
          movesJson: [],
          scorePercent: null,
          accuracyPercent: null,
          hintsUsed: 0,
          durationSeconds: 0,
          result: null,
          startedAt: new Date(),
          completedAt: null,
          ...data
        })),
        update: jest.fn().mockImplementation(({ data }) => ({
          id: "att-1",
          puzzleId: "pz-1",
          attemptNumber: 1,
          status: "IN_PROGRESS",
          movesJson: [],
          scorePercent: null,
          accuracyPercent: null,
          hintsUsed: 0,
          durationSeconds: 0,
          result: null,
          startedAt: new Date(),
          completedAt: null,
          ...data
        })),
        groupBy: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _max: { scorePercent: null } })
      },
      batchStudent: { findMany: jest.fn().mockResolvedValue([]) },
      liveClassPuzzleAssignment: { findFirst: jest.fn().mockResolvedValue(null) }
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PuzzleAttemptService,
        { provide: JwtService, useValue: { verifyAsync: jest.fn().mockResolvedValue({ sub: STUDENT_ID, type: "access" }) } },
        { provide: PrismaService, useValue: prisma },
        { provide: AnalyticsEventService, useValue: { record: jest.fn() } },
        {
          provide: AssignmentEvaluationService,
          useValue: new AssignmentEvaluationService({
            isAvailable: () => false
          } as unknown as StockfishService)
        }
      ]
    }).compile();

    service = moduleRef.get(PuzzleAttemptService);
  });

  it("404s on an unpublished puzzle", async () => {
    prisma.puzzle.findUnique.mockResolvedValue(globalPuzzle({ status: PuzzleStatus.DRAFT }));
    await expect(service.start(TOKEN, "pz-1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("hides another coach's private puzzle from an unrelated student", async () => {
    prisma.puzzle.findUnique.mockResolvedValue(
      globalPuzzle({ visibility: PuzzleVisibility.PRIVATE })
    );
    prisma.puzzle.findFirst.mockResolvedValue(null); // not visible via any batch coach
    await expect(service.start(TOKEN, "pz-1")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("starts an attempt and returns the position", async () => {
    const res = await service.start(TOKEN, "pz-1");
    expect(res.attempt.solutionLength).toBe(1);
    expect(res.attempt.studentColor).toBe("white");
    expect(res.attempt.fen).toContain("R5K1");
  });

  it("scores a correct submission as solved", async () => {
    prisma.puzzleAttempt.findUnique.mockResolvedValue({
      id: "att-1",
      puzzleId: "pz-1",
      studentId: STUDENT_ID,
      attemptNumber: 1,
      status: "IN_PROGRESS",
      movesJson: [],
      hintsUsed: 0,
      durationSeconds: 0
    });
    const res = await service.submit(TOKEN, "pz-1", "att-1", {
      moves: [{ ply: 1, uci: "a1a8", san: "Ra8#", fenAfter: "R5bk1/5ppp/8/8/8/8/8/6K1 b - - 1 1" }]
    });
    expect(res.solved).toBe(true);
    expect(res.scorePercent).toBe(100);
  });

  it("rejects submitting an in-class attempt after the coach ended the puzzle", async () => {
    prisma.puzzleAttempt.findUnique.mockResolvedValue({
      id: "att-1",
      puzzleId: "pz-1",
      studentId: STUDENT_ID,
      status: "IN_PROGRESS",
      liveClassId: "class-1",
      movesJson: [],
      hintsUsed: 0,
      durationSeconds: 0
    });
    prisma.liveClassPuzzleAssignment.findFirst.mockResolvedValue({
      status: "ENDED",
      durationSeconds: null,
      startedAt: new Date()
    });
    await expect(
      service.submit(TOKEN, "pz-1", "att-1", {
        moves: [{ ply: 1, uci: "a1a8", san: "Ra8#", fenAfter: "R5bk1/5ppp/8/8/8/8/8/6K1 b - - 1 1" }]
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects an in-class attempt once the timer (plus grace) has elapsed", async () => {
    prisma.puzzleAttempt.findUnique.mockResolvedValue({
      id: "att-1",
      puzzleId: "pz-1",
      studentId: STUDENT_ID,
      status: "IN_PROGRESS",
      liveClassId: "class-1",
      movesJson: [],
      hintsUsed: 0,
      durationSeconds: 0
    });
    prisma.liveClassPuzzleAssignment.findFirst.mockResolvedValue({
      status: "ACTIVE",
      durationSeconds: 120,
      startedAt: new Date(Date.now() - 5 * 60 * 1000)
    });
    await expect(
      service.saveProgress(TOKEN, "pz-1", "att-1", { moves: [] })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects saving progress on a submitted attempt", async () => {
    prisma.puzzleAttempt.findUnique.mockResolvedValue({
      id: "att-1",
      puzzleId: "pz-1",
      studentId: STUDENT_ID,
      status: "SOLVED",
      movesJson: [],
      hintsUsed: 0,
      durationSeconds: 0
    });
    await expect(
      service.saveProgress(TOKEN, "pz-1", "att-1", { moves: [] })
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

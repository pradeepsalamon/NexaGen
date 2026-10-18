/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";
import { PuzzleAttemptContext, PuzzleStatus, UserRole, UserStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ProgressRecorderService } from "../progress/progress-recorder.service";
import { PuzzleCatalogService } from "./puzzle-catalog.service";
import { PuzzleTrainingService, trainingStartKey } from "./puzzle-training.service";

const TOKEN = "access-token";
const STUDENT_ID = "student-1";
const puzzleRef = { difficulty: "INTERMEDIATE", rating: 1450, tags: ["fork", "short"] };

const attemptRow = (over: Record<string, unknown> = {}) => ({
  id: "att-1",
  puzzleId: "pz-1",
  studentId: STUDENT_ID,
  status: "IN_PROGRESS",
  context: PuzzleAttemptContext.TRAINING,
  movesJson: [],
  wrongMoves: 0,
  hintsUsed: 0,
  startedAt: new Date(),
  completedAt: null,
  puzzle: puzzleRef,
  ...over
});

describe("PuzzleTrainingService", () => {
  let service: PuzzleTrainingService;
  let prisma: any;
  let tx: any;
  let catalog: { materialise: jest.Mock; ensureLichessFolder: jest.Mock };
  let progress: { recordPuzzleResult: jest.Mock };

  beforeEach(async () => {
    tx = { $executeRawUnsafe: jest.fn(), $queryRaw: jest.fn().mockResolvedValue([]) };
    prisma = {
      user: {
        findUnique: jest.fn(() => ({ id: STUDENT_ID, role: UserRole.STUDENT, status: UserStatus.ACTIVE, timezone: "UTC" }))
      },
      batchStudent: {
        findFirst: jest.fn().mockResolvedValue({ id: "bs-1" }),
        findMany: jest.fn().mockResolvedValue([])
      },
      studentProgress: { findUnique: jest.fn().mockResolvedValue({ puzzleRating: 1400 }) },
      puzzleAttempt: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(2), // slot MIXED, no theme
        create: jest.fn(({ data }) => attemptRow({ id: "att-new", puzzleId: data.puzzleId })),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        groupBy: jest.fn().mockResolvedValue([])
      },
      puzzle: { findMany: jest.fn().mockResolvedValue([]) },
      puzzleRatingChange: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn((cb: (client: unknown) => unknown) => cb(tx))
    };
    catalog = {
      ensureLichessFolder: jest.fn().mockResolvedValue("folder-lichess"),
      materialise: jest.fn(async (sourceId: string) => ({
        outcome: "CREATED",
        puzzle: { id: `pz-${sourceId}`, status: PuzzleStatus.PUBLISHED }
      }))
    };
    progress = { recordPuzzleResult: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PuzzleTrainingService,
        { provide: JwtService, useValue: { verifyAsync: jest.fn(() => ({ sub: STUDENT_ID, type: "access" })) } },
        { provide: PrismaService, useValue: prisma },
        { provide: PuzzleCatalogService, useValue: catalog },
        { provide: ProgressRecorderService, useValue: progress }
      ]
    }).compile();
    service = moduleRef.get(PuzzleTrainingService);
  });

  it("refuses a student whose batches don't allow training", async () => {
    prisma.batchStudent.findFirst.mockResolvedValue(null);
    await expect(service.next(TOKEN, {})).rejects.toThrow(ForbiddenException);
  });

  it("refuses coaches", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "c", role: UserRole.COACH, status: UserStatus.ACTIVE });
    await expect(service.next(TOKEN, {})).rejects.toThrow(ForbiddenException);
  });

  it("hands back a puzzle served moments ago with no moves (double click)", async () => {
    prisma.puzzleAttempt.findFirst.mockResolvedValue(attemptRow());
    const res = await service.next(TOKEN, {});
    expect(res.pick).toMatchObject({ attemptId: "att-1", puzzleId: "pz-1", puzzleRating: 1450 });
    expect(prisma.puzzleAttempt.updateMany).not.toHaveBeenCalled();
    expect(prisma.puzzleAttempt.create).not.toHaveBeenCalled();
  });

  it("counts a skipped puzzle as a rated miss before picking the next", async () => {
    prisma.puzzleAttempt.findFirst.mockResolvedValue(attemptRow({ movesJson: [{ uci: "e2e4" }] }));
    tx.$queryRaw.mockResolvedValue([{ id: "AAAAA", rating: 1400, randKey: 5, contentHash: "h-new" }]);
    await service.next(TOKEN, {});
    expect(prisma.puzzleAttempt.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "att-1", status: "IN_PROGRESS" } })
    );
    expect(progress.recordPuzzleResult).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId: "att-1", rating: 1450, solved: false })
    );
  });

  it("walks the catalogue from the target band, skipping content the student has seen", async () => {
    prisma.puzzleAttempt.findMany
      .mockResolvedValueOnce([]) // recent results
      .mockResolvedValueOnce([{ puzzleId: "pz-old", puzzle: { contentHash: "h-seen" } }]); // seen set
    tx.$queryRaw.mockResolvedValueOnce([
      { id: "SEEN1", rating: 1440, randKey: 10, contentHash: "h-seen" },
      { id: "FRESH", rating: 1445, randKey: 11, contentHash: "h-new" }
    ]);
    const res = await service.next(TOKEN, {});
    expect(catalog.materialise).toHaveBeenCalledTimes(1);
    expect(catalog.materialise).toHaveBeenCalledWith("FRESH", expect.anything());
    expect(prisma.puzzleAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ context: PuzzleAttemptContext.TRAINING, puzzleId: "pz-FRESH" })
      })
    );
    expect(res.pick).toMatchObject({ attemptId: "att-new", slot: "MIXED", theme: null });
  });

  it("falls back to the academy library, closest rating first, when the catalogue has nothing", async () => {
    prisma.puzzle.findMany.mockResolvedValue([
      { id: "far", rating: 2200, difficulty: "EXPERT", contentHash: null, solutionMovesJson: [{ uci: "a" }] },
      { id: "near", rating: 1460, difficulty: "ADVANCED", contentHash: null, solutionMovesJson: [{ uci: "a" }] },
      { id: "empty", rating: 1450, difficulty: "ADVANCED", contentHash: null, solutionMovesJson: [] }
    ]);
    // Shortlist of two usable puzzles, picked by the start key.
    const res = await service.next(TOKEN, {});
    const expected = ["near", "far"][trainingStartKey(STUDENT_ID, 2) % 2];
    expect(res.pick.puzzleId).toBe(expected);
  });

  it("is a 404 when nothing new exists anywhere", async () => {
    await expect(service.next(TOKEN, {})).rejects.toThrow(NotFoundException);
  });

  it("reports rating, the open puzzle and recent results with their rating change", async () => {
    prisma.studentProgress.findUnique.mockResolvedValue({
      currentStreak: 3,
      lastActiveDay: null,
      peakRating: 1500,
      puzzleRating: 1420,
      ratedPuzzles: 12
    });
    prisma.puzzleAttempt.findFirst.mockResolvedValue(attemptRow());
    prisma.puzzleAttempt.findMany.mockResolvedValue([
      attemptRow({ id: "done-1", status: "SOLVED", completedAt: new Date("2026-10-12T08:00:00Z") })
    ]);
    prisma.puzzleRatingChange.findMany.mockResolvedValue([{ attemptId: "done-1", before: 1400, after: 1420 }]);
    const res = await service.status(TOKEN);
    expect(res).toMatchObject({
      enabled: true,
      rating: 1420,
      ratedPuzzles: 12,
      current: { attemptId: "att-1" },
      recent: [{ attemptId: "done-1", ratingChange: 20, solved: true }]
    });
  });
});

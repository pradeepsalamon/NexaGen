/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PuzzleStatus, PuzzleVisibility, UserRole } from "@prisma/client";
import { MessagingDispatchService } from "../messaging/messaging-dispatch.service";
import { PrismaService } from "../prisma/prisma.service";
import { AssignmentPuzzleSetService } from "./assignment-puzzle-set.service";

const COACH = { id: "coach-1", role: UserRole.COACH };
const ADMIN = { id: "admin-1", role: UserRole.ADMIN };
const FEN = "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1";

const puzzle = (over: Record<string, unknown> = {}) => ({
  id: "pz-1",
  title: "Mate",
  fen: FEN,
  status: PuzzleStatus.PUBLISHED,
  visibility: PuzzleVisibility.GLOBAL,
  createdById: "someone",
  scoringJson: null,
  solutionMovesJson: [{ uci: "a1a8", san: "Ra8#" }],
  ...over
});

describe("AssignmentPuzzleSetService", () => {
  let service: AssignmentPuzzleSetService;
  let prisma: any;
  let messaging: { dispatchInBackground: jest.Mock };

  beforeEach(async () => {
    prisma = {
      puzzle: { findMany: jest.fn().mockResolvedValue([puzzle()]) },
      puzzleScoringSettings: { findUnique: jest.fn().mockResolvedValue(null) },
      assignmentPuzzle: { findFirst: jest.fn().mockResolvedValue({ id: "ap-1" }), findMany: jest.fn().mockResolvedValue([]) },
      puzzleAttempt: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      studentAssignment: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]), update: jest.fn() }
    };
    messaging = { dispatchInBackground: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AssignmentPuzzleSetService,
        { provide: PrismaService, useValue: prisma },
        { provide: MessagingDispatchService, useValue: messaging }
      ]
    }).compile();
    service = moduleRef.get(AssignmentPuzzleSetService);
  });

  describe("resolvePuzzles", () => {
    it("keeps the given order and freezes admin default → puzzle → set scoring", async () => {
      prisma.puzzle.findMany.mockResolvedValue([
        puzzle({ id: "pz-2", scoringJson: { basePoints: 15, hintPenalty: 1 } }),
        puzzle({ id: "pz-1" })
      ]);
      prisma.puzzleScoringSettings.findUnique.mockResolvedValue({ scoringJson: { basePoints: 12, wrongMovePenalty: 2 } });

      const { rows, firstFen } = await service.resolvePuzzles(COACH, ["pz-1", "pz-2"], { hintPenalty: 5 });

      expect(firstFen).toBe(FEN);
      expect(rows.map((r) => [r.puzzleId, r.position])).toEqual([["pz-1", 0], ["pz-2", 1]]);
      expect(rows[0].scoringJson).toMatchObject({ basePoints: 12, wrongMovePenalty: 2, hintPenalty: 5 });
      // The puzzle's own override beats the admin default; the set's beats both.
      expect(rows[1].scoringJson).toMatchObject({ basePoints: 15, wrongMovePenalty: 2, hintPenalty: 5 });
    });

    it("lets a coach use their own private puzzles but not another coach's", async () => {
      prisma.puzzle.findMany.mockResolvedValue([
        puzzle({ visibility: PuzzleVisibility.PRIVATE, createdById: COACH.id })
      ]);
      await expect(service.resolvePuzzles(COACH, ["pz-1"], null)).resolves.toBeDefined();

      prisma.puzzle.findMany.mockResolvedValue([
        puzzle({ visibility: PuzzleVisibility.PRIVATE, createdById: "coach-2" })
      ]);
      await expect(service.resolvePuzzles(COACH, ["pz-1"], null)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("keeps private puzzles out of an admin's shared library set", async () => {
      prisma.puzzle.findMany.mockResolvedValue([
        puzzle({ visibility: PuzzleVisibility.PRIVATE, createdById: ADMIN.id })
      ]);
      await expect(service.resolvePuzzles(ADMIN, ["pz-1"], null)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("rejects drafts, missing puzzles, duplicates and an empty set", async () => {
      prisma.puzzle.findMany.mockResolvedValue([puzzle({ status: PuzzleStatus.DRAFT })]);
      await expect(service.resolvePuzzles(COACH, ["pz-1"], null)).rejects.toBeInstanceOf(BadRequestException);

      prisma.puzzle.findMany.mockResolvedValue([]);
      await expect(service.resolvePuzzles(COACH, ["pz-1"], null)).rejects.toBeInstanceOf(NotFoundException);

      await expect(service.resolvePuzzles(COACH, ["pz-1", "pz-1"], null)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.resolvePuzzles(COACH, [], null)).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("startContext", () => {
    const studentRow = (assignment: Record<string, unknown> = {}) => ({
      id: "sa-1",
      studentId: "student-1",
      assignmentBatch: {
        assignment: {
          id: "asg-1",
          activityType: "PUZZLE_SET",
          maxAttempts: 2,
          allowRetry: true,
          allowHints: true,
          ...assignment
        }
      }
    });

    it("404s for another student's assignment or a puzzle outside the set", async () => {
      prisma.studentAssignment.findUnique.mockResolvedValue(studentRow());
      await expect(service.startContext("sa-1", "student-2", "pz-1")).rejects.toBeInstanceOf(NotFoundException);

      prisma.assignmentPuzzle.findFirst.mockResolvedValue(null);
      await expect(service.startContext("sa-1", "student-1", "pz-9")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("enforces the assignment's tries per puzzle, but always lets an open try resume", async () => {
      prisma.studentAssignment.findUnique.mockResolvedValue(studentRow());
      prisma.puzzleAttempt.findMany.mockResolvedValue([{ status: "FAILED" }, { status: "FAILED" }]);
      await expect(service.startContext("sa-1", "student-1", "pz-1")).rejects.toBeInstanceOf(BadRequestException);

      prisma.puzzleAttempt.findMany.mockResolvedValue([{ status: "FAILED" }, { status: "IN_PROGRESS" }]);
      await expect(service.startContext("sa-1", "student-1", "pz-1")).resolves.toEqual({
        allowHints: true,
        hasOpenAttempt: true
      });
    });

    it("treats no-retry as one try", async () => {
      prisma.studentAssignment.findUnique.mockResolvedValue(studentRow({ maxAttempts: null, allowRetry: false }));
      prisma.puzzleAttempt.findMany.mockResolvedValue([{ status: "SOLVED" }]);
      await expect(service.startContext("sa-1", "student-1", "pz-1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("refuses an assignment that isn't a puzzle set", async () => {
      prisma.studentAssignment.findUnique.mockResolvedValue(studentRow({ activityType: "SOLVE_LINE" }));
      await expect(service.startContext("sa-1", "student-1", "pz-1")).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("homework-approved folders", () => {
    const topic = (over: Record<string, unknown> = {}) => ({
      id: "t1",
      name: "Forks",
      slug: "forks",
      homeworkApprovedAt: new Date(),
      ...over
    });

    beforeEach(() => {
      prisma.puzzleTopic = { findUnique: jest.fn().mockResolvedValue(topic()), count: jest.fn().mockResolvedValue(0) };
      prisma.puzzle.count = jest.fn().mockResolvedValue(2);
      prisma.puzzle.findMany.mockResolvedValue([
        { id: "pz-1", title: "Fork 1", difficulty: "EASY", tags: [] },
        { id: "pz-2", title: "Fork 2", difficulty: "EASY", tags: ["knight"] }
      ]);
    });

    it("hands back an approved folder's published library puzzles, in title order", async () => {
      await expect(service.assignableFolderPuzzleIds("t1")).resolves.toEqual(["pz-1", "pz-2"]);
      expect(prisma.puzzle.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: PuzzleStatus.PUBLISHED, topicId: "t1", visibility: PuzzleVisibility.GLOBAL },
          orderBy: [{ title: "asc" }, { createdAt: "asc" }]
        })
      );
    });

    it("403s a folder that was never approved, or whose approval was revoked", async () => {
      prisma.puzzleTopic.findUnique.mockResolvedValue(topic({ homeworkApprovedAt: null }));
      await expect(service.assignableFolderPuzzleIds("t1")).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("400s an approved folder that gained subfolders or lost its puzzles", async () => {
      prisma.puzzleTopic.count.mockResolvedValue(1);
      await expect(service.assignableFolderPuzzleIds("t1")).rejects.toBeInstanceOf(BadRequestException);

      prisma.puzzleTopic.count.mockResolvedValue(0);
      prisma.puzzle.count.mockResolvedValue(0);
      await expect(service.assignableFolderPuzzleIds("t1")).rejects.toBeInstanceOf(BadRequestException);
    });

    it("404s a folder that is gone", async () => {
      prisma.puzzleTopic.findUnique.mockResolvedValue(null);
      await expect(service.folderHomework("t1")).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("loadSets", () => {
    it("returns each set in order with the library puzzle's live title, difficulty and tags", async () => {
      prisma.assignmentPuzzle.findMany.mockResolvedValue([
        {
          assignmentId: "asg-1",
          puzzleId: "pz-2",
          position: 0,
          scoringJson: {},
          puzzle: { title: "Fork", fen: FEN, difficulty: "EASY", puzzleType: "TACTIC", solutionMovesJson: [{}, {}], tags: ["fork", "knight"], topic: { name: "Tactics" } }
        },
        {
          assignmentId: "asg-1",
          puzzleId: "pz-1",
          position: 1,
          scoringJson: {},
          puzzle: { title: "Mate", fen: FEN, difficulty: "ADVANCED", puzzleType: "CHECKMATE", solutionMovesJson: [{}], tags: [], topic: null }
        }
      ]);

      const sets = await service.loadSets(["asg-1"]);
      const set = sets.get("asg-1") ?? [];

      expect(set.map((p) => [p.position, p.puzzleId, p.title, p.difficulty, p.tags])).toEqual([
        [0, "pz-2", "Fork", "EASY", ["fork", "knight"]],
        [1, "pz-1", "Mate", "ADVANCED", []]
      ]);
      expect(set[0]).toMatchObject({ solutionLength: 2, topicName: "Tactics" });
      expect(set[1].topicName).toBeNull();
    });
  });

  describe("refreshRollup", () => {
    it("messages the coach once, when the set first becomes complete", async () => {
      const sa = {
        id: "sa-1",
        studentId: "student-1",
        assignmentBatchId: "dep-1",
        status: "IN_PROGRESS",
        completedAt: null,
        student: { firstName: "Ana", lastName: null },
        assignmentBatch: {
          assignedById: "coach-1",
          assignment: { id: "asg-1", activityType: "PUZZLE_SET", maxAttempts: null, allowRetry: true, allowHints: true, leaderboardJson: null }
        }
      };
      prisma.studentAssignment.findUnique.mockResolvedValue(sa);
      prisma.studentAssignment.findMany.mockResolvedValue([
        { id: "sa-1", student: { id: "student-1", firstName: "Ana", lastName: null } }
      ]);
      prisma.assignmentPuzzle.findMany.mockResolvedValue([
        {
          assignmentId: "asg-1",
          puzzleId: "pz-1",
          position: 0,
          scoringJson: {},
          puzzle: { title: "Mate", fen: FEN, difficulty: "EASY", puzzleType: "CHECKMATE", solutionMovesJson: [{}], topic: { name: "T" } }
        }
      ]);
      prisma.puzzleAttempt.findMany.mockResolvedValue([
        {
          studentAssignmentId: "sa-1",
          puzzleId: "pz-1",
          status: "SOLVED",
          scorePercent: 100,
          accuracyPercent: 100,
          hintsUsed: 0,
          wrongMoves: 0,
          durationSeconds: 20,
          startedAt: new Date(),
          completedAt: new Date()
        }
      ]);

      const result = await service.refreshRollup("sa-1", { notify: true });

      expect(result?.status).toBe("COMPLETED");
      expect(prisma.studentAssignment.update).toHaveBeenCalledWith({
        where: { id: "sa-1" },
        data: expect.objectContaining({ status: "COMPLETED", bestScorePercent: 100, attemptCount: 1 })
      });
      expect(messaging.dispatchInBackground).toHaveBeenCalledWith(
        expect.objectContaining({ event: "ASSIGNMENT_GRADED", outcome: "1/1 solved" })
      );

      // Already complete → no second message.
      messaging.dispatchInBackground.mockClear();
      prisma.studentAssignment.findUnique.mockResolvedValue({ ...sa, status: "COMPLETED", completedAt: new Date() });
      await service.refreshRollup("sa-1", { notify: true });
      expect(messaging.dispatchInBackground).not.toHaveBeenCalled();
    });
  });
});

/* eslint-disable @typescript-eslint/no-explicit-any */
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PuzzleStatus, PuzzleVisibility, UserRole, UserStatus } from "@prisma/client";
import { LiveClassService } from "../live-class/live-class.service";
import { LiveKitService } from "../live-class/livekit.service";
import { PrismaService } from "../prisma/prisma.service";
import { LiveClassPuzzleService } from "./live-class-puzzle.service";
import { PuzzleAttemptService } from "./puzzle-attempt.service";

const TOKEN = "t";
const CLASS_ID = "class-1";
const COACH_ID = "coach-1";
const STUDENT_ID = "student-1";
const FEN = "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1";

const asUser = (id: string, role: UserRole) => ({ id, role, status: UserStatus.ACTIVE });
const liveSession = { id: "ls-1", classId: CLASS_ID, coachId: COACH_ID, roomName: "room-1", status: "LIVE" };

const puzzleRow = (over: Record<string, unknown> = {}) => ({
  id: "pz-1",
  title: "Mate in one",
  fen: FEN,
  solutionMovesJson: [{ uci: "a1a8", san: "Ra8#" }],
  puzzleType: "CHECKMATE",
  difficulty: "EASY",
  status: PuzzleStatus.PUBLISHED,
  visibility: PuzzleVisibility.GLOBAL,
  createdById: COACH_ID,
  topic: { name: "Back Rank" },
  ...over
});

const assignmentRow = (over: Record<string, unknown> = {}) => ({
  id: "a-1",
  liveClassId: CLASS_ID,
  puzzleId: "pz-1",
  status: "ACTIVE",
  revealLeaderboard: true,
  durationSeconds: null,
  startedAt: new Date("2026-09-06T10:00:00Z"),
  endedAt: null,
  puzzle: puzzleRow(),
  ...over
});

const attempt = (over: Record<string, unknown> = {}) => ({
  studentId: STUDENT_ID,
  status: "SOLVED",
  scorePercent: 100,
  accuracyPercent: 100,
  durationSeconds: 20,
  hintsUsed: 0,
  completedAt: new Date("2026-09-06T10:01:00Z"),
  student: { id: STUDENT_ID, firstName: "Sam", lastName: "Student" },
  ...over
});

describe("LiveClassPuzzleService", () => {
  let service: LiveClassPuzzleService;
  let prisma: any;
  let liveClass: any;
  let attempts: any;

  beforeEach(async () => {
    prisma = {
      puzzle: { findUnique: jest.fn().mockResolvedValue(puzzleRow()) },
      liveClassPuzzleAssignment: {
        findFirst: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn().mockResolvedValue(assignmentRow({ status: "ENDED" })),
        create: jest.fn().mockResolvedValue(assignmentRow())
      },
      puzzleAttempt: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockImplementation(async (fn: any) => fn(prisma))
    };
    liveClass = {
      resolveClassManager: jest
        .fn()
        .mockResolvedValue({ user: asUser(COACH_ID, UserRole.COACH), liveSession }),
      resolveParticipant: jest
        .fn()
        .mockResolvedValue({ user: asUser(STUDENT_ID, UserRole.STUDENT), liveSession })
    };
    attempts = { start: jest.fn().mockResolvedValue({ attempt: { attempt: { id: "att-1" } } }) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        LiveClassPuzzleService,
        { provide: PrismaService, useValue: prisma },
        { provide: LiveKitService, useValue: { broadcastData: jest.fn().mockResolvedValue(undefined) } },
        { provide: LiveClassService, useValue: liveClass },
        { provide: PuzzleAttemptService, useValue: attempts }
      ]
    }).compile();

    service = moduleRef.get(LiveClassPuzzleService);
  });

  describe("assign", () => {
    it("404s on an unpublished puzzle", async () => {
      prisma.puzzle.findUnique.mockResolvedValue(puzzleRow({ status: PuzzleStatus.DRAFT }));
      await expect(service.assign(TOKEN, CLASS_ID, { puzzleId: "pz-1" })).rejects.toBeInstanceOf(
        NotFoundException
      );
    });

    it("forbids a coach assigning another coach's private puzzle", async () => {
      prisma.puzzle.findUnique.mockResolvedValue(
        puzzleRow({ visibility: PuzzleVisibility.PRIVATE, createdById: "other-coach" })
      );
      await expect(service.assign(TOKEN, CLASS_ID, { puzzleId: "pz-1" })).rejects.toBeInstanceOf(
        ForbiddenException
      );
    });

    it("ends the prior active puzzle, creates the new one and broadcasts", async () => {
      const res = await service.assign(TOKEN, CLASS_ID, { puzzleId: "pz-1" });
      expect(liveClass.resolveClassManager).toHaveBeenCalledWith(TOKEN, CLASS_ID, {
        requireLive: true
      });
      expect(prisma.liveClassPuzzleAssignment.updateMany).toHaveBeenCalledWith({
        where: { liveClassId: CLASS_ID, status: "ACTIVE" },
        data: expect.objectContaining({ status: "ENDED" })
      });
      expect(prisma.liveClassPuzzleAssignment.create).toHaveBeenCalled();
      expect(res.assignment?.puzzleId).toBe("pz-1");
      expect(res.assignment?.sideToMove).toBe("white");
    });
  });

  describe("startAttempt", () => {
    it("rejects a non-student", async () => {
      liveClass.resolveParticipant.mockResolvedValue({
        user: asUser(COACH_ID, UserRole.COACH),
        liveSession
      });
      await expect(service.startAttempt(TOKEN, CLASS_ID)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("404s when no puzzle is active", async () => {
      prisma.liveClassPuzzleAssignment.findFirst.mockResolvedValue(null);
      await expect(service.startAttempt(TOKEN, CLASS_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("delegates to PuzzleAttemptService.start stamping liveClassId", async () => {
      prisma.liveClassPuzzleAssignment.findFirst.mockResolvedValue(assignmentRow());
      await service.startAttempt(TOKEN, CLASS_ID);
      expect(attempts.start).toHaveBeenCalledWith(TOKEN, "pz-1", { liveClassId: CLASS_ID });
    });
  });

  describe("leaderboard", () => {
    beforeEach(() => {
      prisma.liveClassPuzzleAssignment.findFirst.mockResolvedValue(assignmentRow());
    });

    it("ranks by score desc then duration asc, best attempt per student", async () => {
      prisma.puzzleAttempt.findMany.mockResolvedValue([
        attempt({ studentId: "s-slow", scorePercent: 100, durationSeconds: 40, student: { id: "s-slow", firstName: "Slow", lastName: null } }),
        attempt({ studentId: "s-fast", scorePercent: 100, durationSeconds: 10, student: { id: "s-fast", firstName: "Fast", lastName: null } }),
        attempt({ studentId: "s-fast", scorePercent: 50, durationSeconds: 5, student: { id: "s-fast", firstName: "Fast", lastName: null } }),
        attempt({ studentId: "s-mid", status: "IN_PROGRESS", scorePercent: null, student: { id: "s-mid", firstName: "Mid", lastName: null } })
      ]);
      const res = await service.leaderboard(TOKEN, CLASS_ID);
      expect(res.entries.map((e) => e.studentId)).toEqual(["s-fast", "s-slow"]);
      expect(res.entries[0].rank).toBe(1);
      expect(res.solvingCount).toBe(1);
    });

    it("hides peers from a student when revealLeaderboard is false", async () => {
      prisma.liveClassPuzzleAssignment.findFirst.mockResolvedValue(
        assignmentRow({ revealLeaderboard: false })
      );
      prisma.puzzleAttempt.findMany.mockResolvedValue([
        attempt({ studentId: STUDENT_ID }),
        attempt({ studentId: "s-other", student: { id: "s-other", firstName: "Other", lastName: null } })
      ]);
      const res = await service.leaderboard(TOKEN, CLASS_ID);
      expect(res.entries).toHaveLength(1);
      expect(res.entries[0].studentId).toBe(STUDENT_ID);
      expect(res.revealLeaderboard).toBe(false);
    });
  });
});

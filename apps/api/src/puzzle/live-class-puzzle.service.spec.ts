/* eslint-disable @typescript-eslint/no-explicit-any */
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { PuzzleStatus, PuzzleVisibility, UserRole, UserStatus } from "@prisma/client";
import { LiveClassService } from "../live-class/live-class.service";
import { LiveKitService } from "../live-class/livekit.service";
import { PrismaService } from "../prisma/prisma.service";
import { LiveClassPuzzleService } from "./live-class-puzzle.service";
import { PuzzleAttemptService } from "./puzzle-attempt.service";
import { PuzzleScoringSettingsService } from "./puzzle-scoring-settings.service";

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
  attemptNumber: 1,
  status: "SOLVED",
  scorePercent: 100,
  accuracyPercent: 100,
  durationSeconds: 20,
  hintsUsed: 0,
  wrongMoves: 0,
  movesJson: [],
  completedAt: new Date("2026-09-06T10:01:00Z"),
  updatedAt: new Date("2026-09-06T10:01:00Z"),
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
      liveSession: { findUnique: jest.fn().mockResolvedValue(null) },
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
        { provide: PuzzleAttemptService, useValue: attempts },
        {
          provide: PuzzleScoringSettingsService,
          useValue: { defaults: jest.fn().mockResolvedValue({ leaderboard: null, scoring: null }) }
        }
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
      const row = assignmentRow();
      expect(attempts.start).toHaveBeenCalledWith(TOKEN, "pz-1", {
        liveClassId: CLASS_ID,
        startedAfter: row.startedAt
      });
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
      expect(res.stillSolving).toHaveLength(0);
      expect(res.notStarted).toHaveLength(0);
    });

    it("lists batch-enrolled students who haven't attempted as notStarted", async () => {
      prisma.liveSession.findUnique.mockResolvedValue({
        batch: {
          students: [
            { student: { id: STUDENT_ID, firstName: "Sam", lastName: "Student" } },
            { student: { id: "s-idle", firstName: "Idle", lastName: "Student" } }
          ]
        }
      });
      prisma.puzzleAttempt.findMany.mockResolvedValue([attempt({ studentId: STUDENT_ID })]);
      const res = await service.leaderboard(TOKEN, CLASS_ID);
      expect(res.entries.map((e) => e.studentId)).toEqual([STUDENT_ID]);
      expect(res.notStarted).toEqual([{ studentId: "s-idle", studentName: "Idle Student" }]);
      expect(res.stillSolving).toHaveLength(0);
    });

    it("lists a batch-enrolled student who is still solving", async () => {
      prisma.liveSession.findUnique.mockResolvedValue({
        batch: { students: [{ student: { id: "s-solving", firstName: "Solving", lastName: null } }] }
      });
      prisma.puzzleAttempt.findMany.mockResolvedValue([
        attempt({
          studentId: "s-solving",
          status: "IN_PROGRESS",
          scorePercent: null,
          student: { id: "s-solving", firstName: "Solving", lastName: null }
        })
      ]);
      const res = await service.leaderboard(TOKEN, CLASS_ID);
      expect(res.entries).toHaveLength(0);
      expect(res.solvingCount).toBe(1);
      expect(res.stillSolving).toEqual([{ studentId: "s-solving", studentName: "Solving" }]);
      expect(res.notStarted).toHaveLength(0);
    });

    it("includes an attempted-but-left-batch student in the correct list via rosterMap fallback", async () => {
      prisma.liveSession.findUnique.mockResolvedValue({
        batch: { students: [] } // Roster is empty
      });
      prisma.puzzleAttempt.findMany.mockResolvedValue([
        attempt({ studentId: "s-left", status: "SOLVED", scorePercent: 100, student: { id: "s-left", firstName: "Left", lastName: null } }),
        attempt({ studentId: "s-left-prog", status: "IN_PROGRESS", scorePercent: null, student: { id: "s-left-prog", firstName: "LeftProg", lastName: null } })
      ]);
      const res = await service.leaderboard(TOKEN, CLASS_ID);
      expect(res.entries).toHaveLength(1);
      expect(res.entries[0].studentId).toBe("s-left");
      expect(res.stillSolving).toHaveLength(1);
      expect(res.stillSolving[0].studentId).toBe("s-left-prog");
    });

    it("excludes a student from stillSolving if they have a completed attempt", async () => {
      prisma.liveSession.findUnique.mockResolvedValue({
        batch: { students: [{ student: { id: STUDENT_ID, firstName: "Sam", lastName: "Student" } }] }
      });
      prisma.puzzleAttempt.findMany.mockResolvedValue([
        attempt({ studentId: STUDENT_ID, status: "SOLVED", attemptNumber: 1 }),
        attempt({ studentId: STUDENT_ID, status: "IN_PROGRESS", attemptNumber: 2, scorePercent: null })
      ]);
      const res = await service.leaderboard(TOKEN, CLASS_ID);
      expect(res.entries).toHaveLength(1);
      expect(res.entries[0].studentId).toBe(STUDENT_ID);
      expect(res.stillSolving).toHaveLength(0); // Excluded because they have a best attempt
      expect(res.notStarted).toHaveLength(0);
    });
  });

  describe("boards", () => {
    beforeEach(() => {
      prisma.liveClassPuzzleAssignment.findFirst.mockResolvedValue(assignmentRow());
    });

    it("returns NOT_STARTED with the puzzle's starting fen for a roster student with no attempt", async () => {
      prisma.liveSession.findUnique.mockResolvedValue({
        batch: { students: [{ student: { id: "s-idle", firstName: "Idle", lastName: null } }] }
      });
      prisma.puzzleAttempt.findMany.mockResolvedValue([]);
      const res = await service.boards(TOKEN, CLASS_ID);
      expect(liveClass.resolveClassManager).toHaveBeenCalledWith(TOKEN, CLASS_ID);
      expect(res.boards).toEqual([
        {
          studentId: "s-idle",
          studentName: "Idle",
          status: "NOT_STARTED",
          fen: null,
          moveCount: 0,
          lastMoveSan: null,
          updatedAt: null
        }
      ]);
      expect(res.puzzleFen).toBe(FEN);
    });

    it("returns the last move's fen for an in-progress attempt", async () => {
      prisma.liveSession.findUnique.mockResolvedValue({
        batch: { students: [{ student: { id: STUDENT_ID, firstName: "Sam", lastName: "Student" } }] }
      });
      prisma.puzzleAttempt.findMany.mockResolvedValue([
        attempt({
          studentId: STUDENT_ID,
          status: "IN_PROGRESS",
          attemptNumber: 1,
          scorePercent: null,
          movesJson: [{ ply: 1, uci: "a1a8", san: "Ra8+", fenAfter: "next-fen" }]
        })
      ]);
      const res = await service.boards(TOKEN, CLASS_ID);
      expect(res.boards).toEqual([
        {
          studentId: STUDENT_ID,
          studentName: "Sam Student",
          status: "IN_PROGRESS",
          fen: "next-fen",
          moveCount: 1,
          lastMoveSan: "Ra8+",
          updatedAt: expect.any(String)
        }
      ]);
    });

    it("returns empty default object when no assignment has ever been created", async () => {
      prisma.liveClassPuzzleAssignment.findFirst.mockResolvedValue(null);
      const res = await service.boards(TOKEN, CLASS_ID);
      expect(res).toEqual({ assignmentId: null, puzzleFen: "", orientation: "white", boards: [] });
    });

    it("surfaces the most recent attempt based on attemptNumber", async () => {
      prisma.liveSession.findUnique.mockResolvedValue({
        batch: { students: [{ student: { id: STUDENT_ID, firstName: "Sam", lastName: null } }] }
      });
      prisma.puzzleAttempt.findMany.mockResolvedValue([
        attempt({ studentId: STUDENT_ID, attemptNumber: 1, status: "IN_PROGRESS", movesJson: [{ ply: 1, uci: "a1a2", san: "Ra2", fenAfter: "old-fen" }] }),
        attempt({ studentId: STUDENT_ID, attemptNumber: 2, status: "IN_PROGRESS", movesJson: [{ ply: 1, uci: "a1a8", san: "Ra8+", fenAfter: "new-fen" }] })
      ]);
      const res = await service.boards(TOKEN, CLASS_ID);
      expect(res.boards[0].fen).toBe("new-fen");
    });

    it("reports SOLVED and FAILED status with their final fen", async () => {
      prisma.liveSession.findUnique.mockResolvedValue({
        batch: { students: [{ student: { id: "s1", firstName: "S1", lastName: null } }, { student: { id: "s2", firstName: "S2", lastName: null } }] }
      });
      prisma.puzzleAttempt.findMany.mockResolvedValue([
        attempt({ studentId: "s1", status: "SOLVED", movesJson: [{ ply: 1, fenAfter: "solved-fen" }], student: { id: "s1", firstName: "S1", lastName: null } }),
        attempt({ studentId: "s2", status: "FAILED", movesJson: [{ ply: 1, fenAfter: "failed-fen" }], student: { id: "s2", firstName: "S2", lastName: null } })
      ]);
      const res = await service.boards(TOKEN, CLASS_ID);
      const s1 = res.boards.find((b) => b.studentId === "s1");
      const s2 = res.boards.find((b) => b.studentId === "s2");
      expect(s1?.status).toBe("SOLVED");
      expect(s1?.fen).toBe("solved-fen");
      expect(s2?.status).toBe("FAILED");
      expect(s2?.fen).toBe("failed-fen");
    });

    it("sorts boards by studentName ascending", async () => {
      prisma.liveSession.findUnique.mockResolvedValue({
        batch: {
          students: [
            { student: { id: "s-z", firstName: "Zebra", lastName: null } },
            { student: { id: "s-a", firstName: "Alpha", lastName: null } }
          ]
        }
      });
      prisma.puzzleAttempt.findMany.mockResolvedValue([]);
      const res = await service.boards(TOKEN, CLASS_ID);
      expect(res.boards.map((b) => b.studentName)).toEqual(["Alpha", "Zebra"]);
    });

    it("includes a student who left the batch via attempted-row fallback", async () => {
      prisma.liveSession.findUnique.mockResolvedValue({
        batch: { students: [] } // Empty roster
      });
      prisma.puzzleAttempt.findMany.mockResolvedValue([
        attempt({ studentId: "s-left", student: { id: "s-left", firstName: "Left", lastName: null } })
      ]);
      const res = await service.boards(TOKEN, CLASS_ID);
      expect(res.boards).toHaveLength(1);
      expect(res.boards[0].studentId).toBe("s-left");
    });

    it("includes attempted students for a batch-less live session", async () => {
      prisma.liveSession.findUnique.mockResolvedValue({
        batch: null // Batch-less
      });
      prisma.puzzleAttempt.findMany.mockResolvedValue([
        attempt({ studentId: "s-one-off", student: { id: "s-one-off", firstName: "OneOff", lastName: null } })
      ]);
      const res = await service.boards(TOKEN, CLASS_ID);
      expect(res.boards).toHaveLength(1);
      expect(res.boards[0].studentId).toBe("s-one-off");
    });

    it("propagates authorization errors from resolveClassManager", async () => {
      liveClass.resolveClassManager.mockRejectedValue(new ForbiddenException());
      await expect(service.boards(TOKEN, CLASS_ID)).rejects.toBeInstanceOf(ForbiddenException);
      expect(liveClass.resolveClassManager).toHaveBeenCalledWith(TOKEN, CLASS_ID);
    });
  });
  describe("points & leaderboard rules", () => {
    const scoring = {
      allowNegative: false,
      basePoints: 100,
      firstSolveBonuses: [30, 10],
      hintPenalty: 10,
      maxAttempts: null,
      partialCredit: true,
      speedBonusMax: 0,
      speedBonusSeconds: 120,
      wrongMovePenalty: 15
    };
    const leaderboard = {
      anonymize: false,
      rankBy: "POINTS",
      showStats: true,
      topN: null,
      visibility: "LIVE"
    };
    const student = (id: string) => ({ id, firstName: id, lastName: null });

    it("ranks by points: wrong moves cost points, first solvers earn a bonus", async () => {
      prisma.liveClassPuzzleAssignment.findFirst.mockResolvedValue(
        assignmentRow({ leaderboardJson: leaderboard, scoringJson: scoring })
      );
      prisma.puzzleAttempt.findMany.mockResolvedValue([
        // Solved first but made 3 wrong moves: 100 + 30 − 45 = 85
        attempt({ studentId: "s-a", wrongMoves: 3, completedAt: new Date("2026-09-06T10:00:30Z"), student: student("s-a") }),
        // Solved second, clean: 100 + 10 = 110
        attempt({ studentId: "s-b", completedAt: new Date("2026-09-06T10:00:40Z"), student: student("s-b") }),
        // Half the line, no solve: partial 50
        attempt({ studentId: "s-c", status: "FAILED", scorePercent: 50, student: student("s-c") })
      ]);
      liveClass.resolveParticipant.mockResolvedValue({ user: asUser(COACH_ID, UserRole.COACH), liveSession });

      const res = await service.leaderboard(TOKEN, CLASS_ID);
      expect(res.entries.map((e) => [e.studentId, e.points])).toEqual([
        ["s-b", 110],
        ["s-a", 85],
        ["s-c", 50]
      ]);
      expect(res.entries[1].breakdown).toMatchObject({ firstSolveBonus: 30, wrongMovePenalty: 45 });
    });

    it("applies the coach's manual adjustment, even to a student with no attempt", async () => {
      prisma.liveSession.findUnique.mockResolvedValue({
        batch: { students: [{ student: student("s-verbal") }] }
      });
      prisma.liveClassPuzzleAssignment.findFirst.mockResolvedValue(
        assignmentRow({
          adjustmentsJson: { "s-a": -20, "s-verbal": 40 },
          leaderboardJson: leaderboard,
          scoringJson: scoring
        })
      );
      prisma.puzzleAttempt.findMany.mockResolvedValue([
        attempt({ studentId: "s-a", student: student("s-a") })
      ]);
      liveClass.resolveParticipant.mockResolvedValue({ user: asUser(COACH_ID, UserRole.COACH), liveSession });

      const res = await service.leaderboard(TOKEN, CLASS_ID);
      // s-a: 100 + 30 (first solve) − 20 = 110; s-verbal: +40
      expect(res.entries.map((e) => [e.studentId, e.points])).toEqual([
        ["s-a", 110],
        ["s-verbal", 40]
      ]);
      expect(res.notStarted).toHaveLength(0);
    });

    it("AFTER_END shows a student only their own row while the puzzle runs, everyone after", async () => {
      const rows = [
        attempt({ studentId: STUDENT_ID }),
        attempt({ studentId: "s-other", student: student("s-other") })
      ];
      prisma.puzzleAttempt.findMany.mockResolvedValue(rows);

      prisma.liveClassPuzzleAssignment.findFirst.mockResolvedValue(
        assignmentRow({ leaderboardJson: { ...leaderboard, visibility: "AFTER_END" }, scoringJson: scoring })
      );
      const during = await service.leaderboard(TOKEN, CLASS_ID);
      expect(during.entries.map((e) => e.studentId)).toEqual([STUDENT_ID]);
      expect(during.self?.rank).toBeNull();
      expect(during.showingAll).toBe(false);

      prisma.liveClassPuzzleAssignment.findFirst
        .mockResolvedValueOnce(null) // no active
        .mockResolvedValueOnce(
          assignmentRow({
            leaderboardJson: { ...leaderboard, visibility: "AFTER_END" },
            scoringJson: scoring,
            status: "ENDED"
          })
        );
      const after = await service.leaderboard(TOKEN, CLASS_ID);
      expect(after.entries).toHaveLength(2);
      expect(after.active).toBe(false);
    });

    it("anonymizes other students and caps to the top N for students", async () => {
      prisma.liveClassPuzzleAssignment.findFirst.mockResolvedValue(
        assignmentRow({ leaderboardJson: { ...leaderboard, anonymize: true, topN: 1 }, scoringJson: scoring })
      );
      prisma.puzzleAttempt.findMany.mockResolvedValue([
        attempt({ studentId: "s-top", completedAt: new Date("2026-09-06T10:00:10Z"), student: student("s-top") }),
        attempt({ studentId: "s-mid", completedAt: new Date("2026-09-06T10:00:20Z"), student: student("s-mid") }),
        attempt({ studentId: STUDENT_ID, status: "FAILED", scorePercent: 0 })
      ]);
      const res = await service.leaderboard(TOKEN, CLASS_ID);
      expect(res.entries.map((e) => e.studentName)).toEqual(["Student 1", "Sam Student"]);
      expect(res.entries.some((e) => e.studentId === "s-top")).toBe(false);
    });

    it("refuses a fresh attempt once a student has used all their tries", async () => {
      prisma.liveClassPuzzleAssignment.findFirst.mockResolvedValue(
        assignmentRow({ scoringJson: { ...scoring, maxAttempts: 1 } })
      );
      prisma.puzzleAttempt.findMany.mockResolvedValue([{ status: "FAILED" }]);
      await expect(service.startAttempt(TOKEN, CLASS_ID)).rejects.toBeInstanceOf(BadRequestException);
      expect(attempts.start).not.toHaveBeenCalled();

      // ...but an attempt still in progress is always resumable.
      prisma.puzzleAttempt.findMany.mockResolvedValue([{ status: "FAILED" }, { status: "IN_PROGRESS" }]);
      await service.startAttempt(TOKEN, CLASS_ID);
      expect(attempts.start).toHaveBeenCalled();
    });

    it("adds a manual adjustment onto the existing one", async () => {
      prisma.liveClassPuzzleAssignment.findFirst.mockResolvedValue(assignmentRow({ scoringJson: scoring }));
      prisma.liveClassPuzzleAssignment.findUniqueOrThrow = jest
        .fn()
        .mockResolvedValue({ adjustmentsJson: { "s-a": 10 } });
      await service.adjust(TOKEN, CLASS_ID, { studentId: "s-a", delta: 5 });
      expect(prisma.liveClassPuzzleAssignment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { adjustmentsJson: { "s-a": 15 } } })
      );
    });

    it("freezes the admin default, the puzzle override and the coach's pick onto the assignment", async () => {
      prisma.puzzle.findUnique.mockResolvedValue(puzzleRow({ scoringJson: { basePoints: 300, hintPenalty: 0 } }));
      await service.assign(TOKEN, CLASS_ID, {
        puzzleId: "pz-1",
        leaderboard: { visibility: "AFTER_END" },
        scoring: { wrongMovePenalty: 25 }
      });
      const data = prisma.liveClassPuzzleAssignment.create.mock.calls[0][0].data;
      expect(data.scoringJson).toMatchObject({ basePoints: 300, hintPenalty: 0, wrongMovePenalty: 25 });
      expect(data.leaderboardJson).toMatchObject({ visibility: "AFTER_END" });
      expect(data.revealLeaderboard).toBe(false);
    });
  });
});

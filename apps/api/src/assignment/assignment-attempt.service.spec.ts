import { BadRequestException, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserRole, UserStatus } from "@prisma/client";
import type { SolutionMove } from "@nexa-chess/types";
import { AssignmentAttemptService } from "./assignment-attempt.service";
import { AssignmentEvaluationService } from "./assignment-evaluation.service";
import { PrismaService } from "../prisma/prisma.service";
import { StockfishService } from "../stockfish/stockfish.service";

const TOKEN = "t";
const STUDENT_ID = "student-1";
const SA_ID = "sa-1";
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const SOLUTION: SolutionMove[] = [
  { uci: "e2e4", san: "e4" },
  { uci: "e7e5", san: "e5" },
  { uci: "d1h5", san: "Qh5" },
  { uci: "b8c6", san: "Nc6" },
  { uci: "f1c4", san: "Bc4" },
  { uci: "g8f6", san: "Nf6" },
  { uci: "h5f7", san: "Qxf7#" }
];

const move = (uci: string) => ({ ply: 1, uci, san: uci, fenAfter: START });

function makeAssignment(over: Record<string, unknown> = {}) {
  return {
    activityType: "SOLVE_LINE",
    startFen: START,
    solutionMovesJson: SOLUTION,
    orientation: "white",
    studentColor: "white",
    engineLevel: null,
    passThresholdPercent: 100,
    maxAttempts: 3,
    allowHints: false,
    allowRetry: true,
    requiredCompletionPercent: 100,
    ...over
  };
}

function makeSa(over: Record<string, unknown> = {}) {
  return {
    id: SA_ID,
    studentId: STUDENT_ID,
    status: "IN_PROGRESS",
    completedAt: null,
    bestScorePercent: null,
    bestAccuracyPercent: null,
    attemptCount: 0,
    attempts: [],
    assignmentBatch: { assignment: makeAssignment() },
    ...over
  };
}

describe("AssignmentAttemptService", () => {
  let service: AssignmentAttemptService;
  let prisma: {
    user: { findUnique: jest.Mock };
    studentAssignment: { findUnique: jest.Mock; update: jest.Mock };
    studentAssignmentAttempt: { create: jest.Mock; update: jest.Mock; findFirst: jest.Mock };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: STUDENT_ID, type: "access" }) };
    prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: STUDENT_ID, role: UserRole.STUDENT, status: UserStatus.ACTIVE })
      },
      studentAssignment: {
        findUnique: jest.fn().mockResolvedValue(makeSa()),
        update: jest.fn().mockResolvedValue({})
      },
      studentAssignmentAttempt: {
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
        findFirst: jest.fn().mockResolvedValue(null)
      },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma))
    };

    const evaluation = new AssignmentEvaluationService({
      isAvailable: () => false,
      getBestMove: jest.fn()
    } as unknown as StockfishService);

    service = new AssignmentAttemptService(
      jwt as unknown as JwtService,
      prisma as unknown as PrismaService,
      evaluation
    );
  });

  it("404s when the student does not own the assignment", async () => {
    prisma.studentAssignment.findUnique.mockResolvedValue({ id: SA_ID, studentId: "other" });
    await expect(service.start(TOKEN, SA_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects starting an attempt on a REPLAY assignment", async () => {
    prisma.studentAssignment.findUnique.mockResolvedValue(
      makeSa({ assignmentBatch: { assignment: makeAssignment({ activityType: "REPLAY" }) } })
    );
    await expect(service.start(TOKEN, SA_ID)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("creates attempt #1 and reports remaining attempts", async () => {
    const { attempt } = await service.start(TOKEN, SA_ID);
    expect(prisma.studentAssignmentAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { studentAssignmentId: SA_ID, attemptNumber: 1 } })
    );
    expect(attempt.attemptsRemaining).toBe(2);
    expect(attempt.solutionLength).toBe(7);
  });

  it("refuses a new attempt once maxAttempts is reached", async () => {
    prisma.studentAssignment.findUnique.mockResolvedValue(
      makeSa({
        attempts: [
          { id: "a1", attemptNumber: 1, status: "FAILED" },
          { id: "a2", attemptNumber: 2, status: "FAILED" },
          { id: "a3", attemptNumber: 3, status: "FAILED" }
        ]
      })
    );
    await expect(service.start(TOKEN, SA_ID)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("resumes an existing in-progress attempt instead of creating another", async () => {
    prisma.studentAssignment.findUnique.mockResolvedValue(
      makeSa({
        attempts: [
          {
            id: "att-open",
            attemptNumber: 1,
            status: "IN_PROGRESS",
            movesJson: [],
            scorePercent: null,
            accuracyPercent: null,
            hintsUsed: 0,
            durationSeconds: 0,
            result: null,
            startedAt: new Date(),
            completedAt: null
          }
        ]
      })
    );
    const { attempt } = await service.start(TOKEN, SA_ID);
    expect(prisma.studentAssignmentAttempt.create).not.toHaveBeenCalled();
    expect(attempt.attempt.id).toBe("att-open");
  });

  it("evaluates a fully-correct SOLVE_LINE submission as passed + completed", async () => {
    prisma.studentAssignment.findUnique.mockResolvedValue(
      makeSa({
        attempts: [
          {
            id: "att-1",
            attemptNumber: 1,
            status: "IN_PROGRESS",
            movesJson: [],
            hintsUsed: 0,
            durationSeconds: 0
          }
        ]
      })
    );

    const result = await service.submit(TOKEN, SA_ID, "att-1", {
      moves: SOLUTION.map((m) => move(m.uci)),
      durationSeconds: 42
    });

    expect(result.scorePercent).toBe(100);
    expect(result.passed).toBe(true);
    expect(result.assignmentStatus).toBe("COMPLETED");
    expect(result.solutionMoves).toHaveLength(7);
    expect(prisma.studentAssignment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "COMPLETED", bestScorePercent: 100 }) })
    );
  });

  it("does not leak the solution on a failed submission with attempts left", async () => {
    prisma.studentAssignment.findUnique.mockResolvedValue(
      makeSa({
        attempts: [
          {
            id: "att-1",
            attemptNumber: 1,
            status: "IN_PROGRESS",
            movesJson: [],
            hintsUsed: 0,
            durationSeconds: 0
          }
        ]
      })
    );

    const result = await service.submit(TOKEN, SA_ID, "att-1", {
      moves: [move("e2e4"), move("e7e5"), move("d1h5"), move("b8c6"), move("f1c4"), move("g8f6"), move("h5h4")]
    });

    expect(result.passed).toBe(false);
    expect(result.status).toBe("FAILED");
    expect(result.solutionMoves).toBeNull();
    expect(result.attemptsRemaining).toBe(2);
  });

  it("rejects saving progress against an already-submitted attempt", async () => {
    prisma.studentAssignment.findUnique.mockResolvedValue(
      makeSa({ attempts: [{ id: "att-1", attemptNumber: 1, status: "COMPLETED" }] })
    );
    await expect(
      service.saveProgress(TOKEN, SA_ID, "att-1", { moves: [] })
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

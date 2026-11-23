import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserRole, UserStatus } from "@prisma/client";
import type { AttemptMove, SolutionMove } from "@nexa-chess/types";
import { Chess } from "../common/chess/chess";
import { AssignmentAttemptService } from "./assignment-attempt.service";
import { AssignmentEvaluationService } from "./assignment-evaluation.service";
import { AnalyticsEventService } from "../analytics/analytics-event.service";
import { MessagingDispatchService } from "../messaging/messaging-dispatch.service";
import { PrismaService } from "../prisma/prisma.service";
import { ProgressRecorderService } from "../progress/progress-recorder.service";
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
    minMoves: null,
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
    studentAssignmentAttempt: {
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      findFirst: jest.Mock;
    };
    $transaction: jest.Mock;
  };

  beforeEach(() => {
    const currentAttempt: Record<string, unknown> = {
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
      completedAt: null
    };
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
        updateMany: jest.fn().mockImplementation(({ data }) => {
          Object.assign(currentAttempt, data);
          return Promise.resolve({ count: 1 });
        }),
        findUniqueOrThrow: jest.fn().mockImplementation(() => currentAttempt),
        findFirst: jest.fn().mockResolvedValue(null)
      },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma))
    };

    const evaluation = new AssignmentEvaluationService({
      isAvailable: () => false,
      getBestMove: jest.fn()
    } as unknown as StockfishService);

    const messaging = { dispatchInBackground: jest.fn() };
    const analyticsEvents = { record: jest.fn().mockResolvedValue(undefined) };

    service = new AssignmentAttemptService(
      jwt as unknown as JwtService,
      prisma as unknown as PrismaService,
      evaluation,
      messaging as unknown as MessagingDispatchService,
      analyticsEvents as unknown as AnalyticsEventService,
      { recordPractice: jest.fn() } as unknown as ProgressRecorderService
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

  it("holds a FREE_ANALYSIS submission until the move target is reached", async () => {
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
        ],
        assignmentBatch: { assignment: makeAssignment({ activityType: "FREE_ANALYSIS", minMoves: 3 }) }
      })
    );
    const line = SOLUTION.map((m) => move(m.uci));

    await expect(service.submit(TOKEN, SA_ID, "att-1", { moves: line.slice(0, 2) })).rejects.toThrow(
      "Play at least 3 moves"
    );
    expect(prisma.studentAssignment.update).not.toHaveBeenCalled();

    const result = await service.submit(TOKEN, SA_ID, "att-1", { moves: line.slice(0, 3) });
    expect(result.assignmentStatus).toBe("COMPLETED");
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

  describe("SOLVE_LINE wrong tries (review S4)", () => {
    const openAttempt = (over: Record<string, unknown> = {}) => ({
      id: "att-1",
      attemptNumber: 1,
      status: "IN_PROGRESS",
      movesJson: [],
      hintsUsed: 0,
      wrongMoves: 0,
      durationSeconds: 0,
      ...over
    });
    const withAttempt = (attempt: Record<string, unknown>, assignment: Record<string, unknown> = {}) =>
      prisma.studentAssignment.findUnique.mockResolvedValue(
        makeSa({ attempts: [attempt], assignmentBatch: { assignment: makeAssignment(assignment) } })
      );
    const line = (...ucis: string[]) => ucis.map((uci, i) => ({ ply: i + 1, uci, san: uci, fenAfter: START }));

    it("counts a wrong move once, not again when the same line is re-sent", async () => {
      withAttempt(openAttempt());
      const res = await service.saveProgress(TOKEN, SA_ID, "att-1", { moves: line("d2d4") });
      expect(res.moveFeedback?.correct).toBe(false);
      expect(prisma.studentAssignmentAttempt.update.mock.calls[0][0].data.wrongMoves).toEqual({ increment: 1 });

      withAttempt(openAttempt({ movesJson: line("d2d4"), wrongMoves: 1 }));
      await service.saveProgress(TOKEN, SA_ID, "att-1", { moves: line("d2d4") });
      expect(prisma.studentAssignmentAttempt.update.mock.calls[1][0].data).not.toHaveProperty("wrongMoves");
    });

    it("does not count a right move", async () => {
      withAttempt(openAttempt());
      await service.saveProgress(TOKEN, SA_ID, "att-1", { moves: line("e2e4") });
      expect(prisma.studentAssignmentAttempt.update.mock.calls[0][0].data).not.toHaveProperty("wrongMoves");
    });

    it("takes each wrong try off the score of a line found by trial", async () => {
      withAttempt(openAttempt({ wrongMoves: 2 }));
      const full = SOLUTION.map((m, i) => ({ ply: i + 1, uci: m.uci, san: m.san, fenAfter: START }));
      const res = await service.submit(TOKEN, SA_ID, "att-1", { moves: full });
      // 4 student plies, all right, plus 2 wrong tries: 4 / 6.
      expect(res.scorePercent).toBe(67);
      expect(res.result).toBe("SOLVED");
      expect(res.passed).toBe(false);
    });

    it("with retries off, refuses another try and scores the stored line, not a resubmitted one", async () => {
      withAttempt(openAttempt({ movesJson: line("d2d4"), wrongMoves: 1 }), { allowRetry: false });
      await expect(
        service.saveProgress(TOKEN, SA_ID, "att-1", { moves: line("e2e4") })
      ).rejects.toBeInstanceOf(BadRequestException);

      const full = SOLUTION.map((m, i) => ({ ply: i + 1, uci: m.uci, san: m.san, fenAfter: START }));
      const res = await service.submit(TOKEN, SA_ID, "att-1", { moves: full });
      expect(res.scorePercent).toBe(0);
      expect(res.result).toBe("PARTIAL");
    });
  });

  describe("hint", () => {
    const openAttempt = (over: Record<string, unknown> = {}) => ({
      id: "att-1",
      attemptNumber: 1,
      status: "IN_PROGRESS",
      movesJson: [],
      hintsUsed: 0,
      durationSeconds: 0,
      ...over
    });

    it("refuses when hints are disabled for the assignment", async () => {
      prisma.studentAssignment.findUnique.mockResolvedValue(
        makeSa({ attempts: [openAttempt()] })
      );
      await expect(
        service.hint(TOKEN, SA_ID, "att-1", { moves: [], level: 1 })
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("returns a progressive hint and increments hintsUsed", async () => {
      prisma.studentAssignment.findUnique.mockResolvedValue(
        makeSa({
          attempts: [openAttempt()],
          assignmentBatch: { assignment: makeAssignment({ allowHints: true }) }
        })
      );

      const l1 = await service.hint(TOKEN, SA_ID, "att-1", { moves: [], level: 1 });
      expect(l1).toMatchObject({ level: 1, onTrack: true, pieceType: "p", fromSquare: null });
      expect(l1.hintsUsed).toBe(1);

      const l3 = await service.hint(TOKEN, SA_ID, "att-1", { moves: [], level: 3 });
      expect(l3).toMatchObject({ level: 3, fromSquare: "e2", toSquare: "e4", san: "e4" });
      expect(prisma.studentAssignmentAttempt.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { hintsUsed: 1 } })
      );
    });

    it("reports onTrack:false without spending a hint when the line has drifted", async () => {
      prisma.studentAssignment.findUnique.mockResolvedValue(
        makeSa({
          attempts: [openAttempt()],
          assignmentBatch: { assignment: makeAssignment({ allowHints: true }) }
        })
      );
      prisma.studentAssignmentAttempt.update.mockClear();

      const hint = await service.hint(TOKEN, SA_ID, "att-1", { moves: [move("d2d4")], level: 2 });
      expect(hint.onTrack).toBe(false);
      expect(hint.hintsUsed).toBe(0);
      expect(prisma.studentAssignmentAttempt.update).not.toHaveBeenCalled();
    });
  });

  it("rejects saving progress against an already-submitted attempt", async () => {
    prisma.studentAssignment.findUnique.mockResolvedValue(
      makeSa({ attempts: [{ id: "att-1", attemptNumber: 1, status: "COMPLETED" }] })
    );
    await expect(
      service.saveProgress(TOKEN, SA_ID, "att-1", { moves: [] })
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  describe("PLAY_VS_ENGINE: the game is stored on the server (review S2/S3)", () => {
    const UPDATED_AT = new Date("2026-11-23T10:00:00.000Z");
    let getBestMove: jest.Mock;

    /** A stored line with real SAN and FENs, as the server writes it. */
    function line(...ucis: string[]): AttemptMove[] {
      const board = new Chess(START);
      return ucis.map((uci, i) => {
        const res = board.move({ from: uci.slice(0, 2), to: uci.slice(2, 4) });
        return { ply: i + 1, uci, san: res.san, fenAfter: board.fen() };
      });
    }

    function engineSa(movesJson: AttemptMove[], over: Record<string, unknown> = {}) {
      return makeSa({
        attempts: [
          { id: "att-1", attemptNumber: 1, status: "IN_PROGRESS", movesJson, hintsUsed: 0, durationSeconds: 0, updatedAt: UPDATED_AT }
        ],
        assignmentBatch: {
          assignment: makeAssignment({
            activityType: "PLAY_VS_ENGINE",
            solutionMovesJson: null,
            passThresholdPercent: 50,
            engineLevel: 5,
            ...over
          })
        }
      });
    }

    beforeEach(() => {
      getBestMove = jest.fn().mockResolvedValue({ uci: "e7e5" });
      const evaluation = new AssignmentEvaluationService({
        isAvailable: () => true,
        getBestMove,
        analyzePosition: jest.fn().mockRejectedValue(new Error("not in this test"))
      } as unknown as StockfishService);
      service = new AssignmentAttemptService(
        { verifyAsync: jest.fn().mockResolvedValue({ sub: STUDENT_ID, type: "access" }) } as unknown as JwtService,
        prisma as unknown as PrismaService,
        evaluation,
        { dispatchInBackground: jest.fn() } as unknown as MessagingDispatchService,
        { record: jest.fn().mockResolvedValue(undefined) } as unknown as AnalyticsEventService,
        { recordPractice: jest.fn() } as unknown as ProgressRecorderService
      );
    });

    it("adds the student's move and the engine's reply from the stored position, claimed on the row", async () => {
      prisma.studentAssignment.findUnique.mockResolvedValue(engineSa([]));

      const res = await service.engineMove(TOKEN, SA_ID, "att-1", { uci: "e2e4", ply: 0 });

      expect(res.moves.map((m) => m.san)).toEqual(["e4", "e5"]);
      // The engine was asked about the server's position, never a client FEN.
      expect(getBestMove.mock.calls[0][0]).toBe(line("e2e4")[0].fenAfter);
      expect(prisma.studentAssignmentAttempt.updateMany).toHaveBeenCalledWith({
        where: { id: "att-1", status: "IN_PROGRESS", updatedAt: UPDATED_AT },
        data: { movesJson: res.moves }
      });
    });

    it("refuses with 409 when the client's move count differs from the stored game", async () => {
      prisma.studentAssignment.findUnique.mockResolvedValue(engineSa(line("e2e4", "e7e5")));
      await expect(
        service.engineMove(TOKEN, SA_ID, "att-1", { uci: "g1f3", ply: 0 })
      ).rejects.toBeInstanceOf(ConflictException);
      expect(getBestMove).not.toHaveBeenCalled();
    });

    it("refuses an illegal move, and a move on the engine's turn", async () => {
      prisma.studentAssignment.findUnique.mockResolvedValue(engineSa([]));
      await expect(
        service.engineMove(TOKEN, SA_ID, "att-1", { uci: "e2e5", ply: 0 })
      ).rejects.toBeInstanceOf(BadRequestException);

      prisma.studentAssignment.findUnique.mockResolvedValue(engineSa(line("e2e4")));
      await expect(
        service.engineMove(TOKEN, SA_ID, "att-1", { uci: "e7e5", ply: 1 })
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(getBestMove).not.toHaveBeenCalled();
    });

    it("loses a race with another request (409) instead of forking the game", async () => {
      prisma.studentAssignment.findUnique.mockResolvedValue(engineSa([]));
      prisma.studentAssignmentAttempt.updateMany.mockResolvedValueOnce({ count: 0 });
      await expect(
        service.engineMove(TOKEN, SA_ID, "att-1", { uci: "e2e4", ply: 0 })
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("plays the engine's first move when the student has Black", async () => {
      prisma.studentAssignment.findUnique.mockResolvedValue(
        engineSa([], { studentColor: "black", orientation: "black" })
      );
      getBestMove.mockResolvedValue({ uci: "d2d4" });
      const res = await service.engineMove(TOKEN, SA_ID, "att-1", { ply: 0 });
      expect(res.moves.map((m) => m.san)).toEqual(["d4"]);
    });

    it("scores the stored game, not the move list the client submits", async () => {
      // Stored: the student (White) is mated. Submitted: a line where White mates.
      prisma.studentAssignment.findUnique.mockResolvedValue(
        engineSa(line("f2f3", "e7e5", "g2g4", "d8h4"))
      );
      const forged = SOLUTION.map((m, i) => ({ ply: i + 1, uci: m.uci, san: m.san, fenAfter: START }));

      const res = await service.submit(TOKEN, SA_ID, "att-1", { moves: forged });

      expect(res.result).toBe("LOSS");
      expect(res.scorePercent).toBe(0);
    });

    it("never saves the client's moves for an engine game on save-progress", async () => {
      prisma.studentAssignment.findUnique.mockResolvedValue(engineSa([]));
      await service.saveProgress(TOKEN, SA_ID, "att-1", { moves: [move("e2e4")], durationSeconds: 30 });
      const data = prisma.studentAssignmentAttempt.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty("movesJson");
      expect(data.durationSeconds).toBe(30);
    });
  });
});

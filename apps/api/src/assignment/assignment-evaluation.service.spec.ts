import { BadRequestException } from "@nestjs/common";
import type { AttemptMove, SolutionMove } from "@nexa-chess/types";
import { AssignmentEvaluationService, assertValidFen } from "./assignment-evaluation.service";
import { StockfishService } from "../stockfish/stockfish.service";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

// Scholar's mate as a SOLVE_LINE — white to move, white is the student.
const SCHOLARS: SolutionMove[] = [
  { uci: "e2e4", san: "e4" },
  { uci: "e7e5", san: "e5" },
  { uci: "d1h5", san: "Qh5" },
  { uci: "b8c6", san: "Nc6" },
  { uci: "f1c4", san: "Bc4" },
  { uci: "g8f6", san: "Nf6" },
  { uci: "h5f7", san: "Qxf7#" }
];

const move = (uci: string): AttemptMove => ({ ply: 1, uci, san: uci, fenAfter: START });

describe("AssignmentEvaluationService", () => {
  let service: AssignmentEvaluationService;
  const stockfish = {
    isAvailable: jest.fn().mockReturnValue(false),
    getBestMove: jest.fn()
  };

  beforeEach(() => {
    service = new AssignmentEvaluationService(stockfish as unknown as StockfishService);
  });

  describe("assertValidFen", () => {
    it("accepts a valid FEN and falls back to the start position for empty input", () => {
      expect(assertValidFen(START)).toContain("rnbqkbnr");
      expect(assertValidFen("")).toContain("rnbqkbnr");
    });

    it("rejects a malformed FEN", () => {
      expect(() => assertValidFen("not a fen")).toThrow(BadRequestException);
    });
  });

  describe("normalizeSolution", () => {
    it("rebuilds SAN for a legal line", () => {
      const out = service.normalizeSolution(START, SCHOLARS.map((m) => ({ uci: m.uci, san: "?" })));
      expect(out.map((m) => m.san)).toEqual(SCHOLARS.map((m) => m.san));
    });

    it("throws on the first illegal move", () => {
      expect(() =>
        service.normalizeSolution(START, [{ uci: "e2e5", san: "?" }])
      ).toThrow(BadRequestException);
    });
  });

  describe("evaluateSolveLine", () => {
    it("scores a fully correct line 100% and marks it solved", () => {
      const played = SCHOLARS.map((m) => move(m.uci));
      const result = service.evaluateSolveLine(START, SCHOLARS, played, "white");
      expect(result.scorePercent).toBe(100);
      expect(result.accuracyPercent).toBe(100);
      expect(result.solved).toBe(true);
      expect(result.totalStudentPlies).toBe(4);
      expect(result.review).toHaveLength(4);
    });

    it("gives partial credit when the final move is wrong", () => {
      const played = [
        ...SCHOLARS.slice(0, 6).map((m) => move(m.uci)),
        move("h5h4")
      ];
      const result = service.evaluateSolveLine(START, SCHOLARS, played, "white");
      expect(result.correctStudentPlies).toBe(3);
      expect(result.scorePercent).toBe(75);
      expect(result.solved).toBe(false);
      expect(result.review[3].correct).toBe(false);
    });

    it("marks unplayed student moves as pending (null) in the review", () => {
      const played = [move("e2e4"), move("e7e5")];
      const result = service.evaluateSolveLine(START, SCHOLARS, played, "white");
      expect(result.review[0].correct).toBe(true);
      expect(result.review[1].correct).toBeNull();
      expect(result.scorePercent).toBe(25);
    });
  });

  describe("solveLineFeedback", () => {
    it("reveals only the forced opponent reply after a correct student move", () => {
      const fb = service.solveLineFeedback(START, SCHOLARS, [move("e2e4")], "white");
      expect(fb.correct).toBe(true);
      expect(fb.opponentReply?.uci).toBe("e7e5");
      expect(fb.lineComplete).toBe(false);
    });

    it("does not reveal the student's own next move", () => {
      const played = SCHOLARS.slice(0, 6).map((m) => move(m.uci));
      const fb = service.solveLineFeedback(START, SCHOLARS, played, "white");
      expect(fb.correct).toBe(true);
      expect(fb.opponentReply).toBeNull();
    });

    it("flags an incorrect move", () => {
      const fb = service.solveLineFeedback(START, SCHOLARS, [move("d2d4")], "white");
      expect(fb.correct).toBe(false);
      expect(fb.opponentReply).toBeNull();
    });
  });

  describe("evaluateEngineGame", () => {
    const foolsMate =
      "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3";

    it("awards 100% when the student has checkmated the engine", () => {
      const result = service.evaluateEngineGame(foolsMate, "black", [], false);
      expect(result).toEqual({ scorePercent: 100, result: "WIN", finished: true });
    });

    it("returns a loss on resignation", () => {
      const result = service.evaluateEngineGame(START, "white", [], true);
      expect(result).toEqual({ scorePercent: 0, result: "LOSS", finished: true });
    });

    it("reports the game as unfinished when it is still in progress", () => {
      const result = service.evaluateEngineGame(START, "white", [move("e2e4")], false);
      expect(result.finished).toBe(false);
    });
  });

  describe("engineReply", () => {
    it("returns unavailable when the engine pool is down", async () => {
      const reply = await service.engineReply(START, 5);
      expect(reply.available).toBe(false);
    });

    it("plays the engine's move when the pool is up", async () => {
      stockfish.isAvailable.mockReturnValue(true);
      stockfish.getBestMove.mockResolvedValue({ uci: "e2e4", san: "e4" });
      const reply = await service.engineReply(START, 5);
      expect(reply).toMatchObject({ available: true, gameOver: false, uci: "e2e4" });
      expect(reply.fenAfter).toContain(" b ");
    });
  });
});

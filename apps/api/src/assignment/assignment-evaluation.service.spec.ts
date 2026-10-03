import { BadRequestException } from "@nestjs/common";
import { SOLVE_LINE_MATE_FIXTURES, type AttemptMove, type SolutionMove } from "@nexa-chess/types";
import { Chess } from "chess.js";
import {
  AssignmentEvaluationService,
  assertValidFen,
  cpToWinPercent,
  isAcceptedMateAlternative,
  moveAccuracy
} from "./assignment-evaluation.service";
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
    getBestMove: jest.fn(),
    analyzePosition: jest.fn()
  };

  beforeEach(() => {
    service = new AssignmentEvaluationService(stockfish as unknown as StockfishService);
    stockfish.isAvailable.mockReturnValue(false);
    stockfish.analyzePosition.mockReset();
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

  describe("solveLineHint", () => {
    it("escalates from piece to origin square to full move", () => {
      const l1 = service.solveLineHint(START, SCHOLARS, [], "white", 1);
      expect(l1).toMatchObject({ level: 1, onTrack: true, pieceType: "p", fromSquare: null, toSquare: null });

      const l2 = service.solveLineHint(START, SCHOLARS, [], "white", 2);
      expect(l2).toMatchObject({ level: 2, fromSquare: "e2", toSquare: null, san: null });

      const l3 = service.solveLineHint(START, SCHOLARS, [], "white", 3);
      expect(l3).toMatchObject({ level: 3, fromSquare: "e2", toSquare: "e4", san: "e4", uci: "e2e4" });
    });

    it("hints the next student move after correct progress", () => {
      const played = [move("e2e4"), move("e7e5")];
      const hint = service.solveLineHint(START, SCHOLARS, played, "white", 3);
      expect(hint).toMatchObject({ onTrack: true, san: "Qh5", fromSquare: "d1" });
    });

    it("flags a drifted line and gives nothing away", () => {
      const hint = service.solveLineHint(START, SCHOLARS, [move("d2d4")], "white", 3);
      expect(hint.onTrack).toBe(false);
      expect(hint.san).toBeNull();
      expect(hint.fromSquare).toBeNull();
    });

    it("reports lineComplete once every solution move is played", () => {
      const played = SCHOLARS.map((m) => move(m.uci));
      const hint = service.solveLineHint(START, SCHOLARS, played, "white", 1);
      expect(hint.lineComplete).toBe(true);
    });
  });

  describe("isAcceptedMateAlternative", () => {
    const line = (ucis: string[]): SolutionMove[] => ucis.map((uci) => ({ uci, san: uci }));
    const studentOf = (fen: string) => (new Chess(fen).turn() === "w" ? "white" : "black");

    it.each(SOLVE_LINE_MATE_FIXTURES)("$name", (fx) => {
      expect(
        isAcceptedMateAlternative(
          fx.fen,
          line(fx.solution),
          fx.played.map(move),
          move(fx.candidate),
          studentOf(fx.fen)
        )
      ).toBe(fx.accepted);
    });

    it("refuses a candidate on the opponent's ply", () => {
      const fx = SOLVE_LINE_MATE_FIXTURES[0];
      expect(
        isAcceptedMateAlternative(fx.fen, line(fx.solution), [], move(fx.candidate), "black")
      ).toBe(false);
    });
  });

  describe("any mate solves a mate line", () => {
    const BACK_RANK_LONG = "7k/6pp/8/2p5/8/8/1R6/R5K1 w - - 0 1";
    const LINE: SolutionMove[] = [
      { uci: "b2b7", san: "Rb7" },
      { uci: "c5c4", san: "c4" },
      { uci: "a1a8", san: "Ra8#" }
    ];

    it("scores an alternative final mate as a full solve", () => {
      const played = [move("b2b7"), move("c5c4"), { ...move("b7b8"), san: "Rb8#" }];
      const result = service.evaluateSolveLine(BACK_RANK_LONG, LINE, played, "white");
      expect(result).toMatchObject({ solved: true, scorePercent: 100, accuracyPercent: 100 });
      expect(result.review[1]).toMatchObject({ yourMove: "Rb8#", expectedMove: "Ra8#", correct: true });
    });

    it("scores an early mate as a full solve and drops the unplayed book plies", () => {
      const result = service.evaluateSolveLine(BACK_RANK_LONG, LINE, [move("a1a8")], "white");
      expect(result).toMatchObject({ solved: true, scorePercent: 100, accuracyPercent: 100 });
      expect(result.review).toHaveLength(1);
      expect(result.review[0]).toMatchObject({ expectedMove: "Rb7", correct: true });
    });

    it("completes the line in move feedback with no opponent reply", () => {
      const fb = service.solveLineFeedback(BACK_RANK_LONG, LINE, [move("a1a8")], "white");
      expect(fb).toMatchObject({ correct: true, lineComplete: true, opponentReply: null });
    });

    it("gives no further hint once mated", () => {
      const hint = service.solveLineHint(BACK_RANK_LONG, LINE, [move("a1a8")], "white", 3);
      expect(hint).toMatchObject({ onTrack: true, lineComplete: true, san: null });
    });

    it("still rejects a mate when the book line does not end in mate", () => {
      const quiet: SolutionMove[] = [{ uci: "a1a7", san: "Ra7" }];
      const fen = "7k/6pp/8/8/8/8/1R6/R5K1 w - - 0 1";
      const fb = service.solveLineFeedback(fen, quiet, [move("a1a8")], "white");
      expect(fb).toMatchObject({ correct: false, lineComplete: false });
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

  describe("accuracy helpers", () => {
    it("maps centipawns to a win probability around 50% at equality", () => {
      expect(cpToWinPercent(0)).toBeCloseTo(50, 5);
      expect(cpToWinPercent(100_000)).toBeGreaterThan(99);
      expect(cpToWinPercent(-100_000)).toBeLessThan(1);
    });

    it("rewards a move that holds the evaluation and punishes a blunder", () => {
      expect(moveAccuracy(60, 60)).toBeGreaterThan(99);
      expect(moveAccuracy(70, 20)).toBeLessThan(20);
    });
  });

  describe("engineGameAccuracy", () => {
    it("returns null when the engine pool is down", async () => {
      stockfish.isAvailable.mockReturnValue(false);
      const acc = await service.engineGameAccuracy(START, "white", [move("e2e4")]);
      expect(acc).toBeNull();
    });

    it("scores a game high when the eval holds across the student's moves", async () => {
      stockfish.isAvailable.mockReturnValue(true);
      // Student stays ~+0.3 from their own perspective before and after each move.
      stockfish.analyzePosition.mockImplementation((fen: string) => {
        const whiteToMove = fen.includes(" w ");
        return Promise.resolve({
          evaluation: whiteToMove ? 0.3 : -0.3,
          mate: null,
          bestMove: "",
          bestMoveUci: "",
          depth: 12,
          pv: [],
          pvUci: []
        });
      });
      const acc = await service.engineGameAccuracy(START, "white", [
        move("e2e4"),
        move("e7e5"),
        move("g1f3")
      ]);
      expect(acc).not.toBeNull();
      expect(acc as number).toBeGreaterThan(95);
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

import type { MatchMove } from "@nexa-chess/types";
import { Chess } from "./chess";
import {
  clockAfterMove,
  type GameClockState,
  hasMatingMaterial,
  outcomeAfterMove,
  playUciMove,
  remainingClockMs,
  replayGame,
  resignationOutcome,
  sideToMove,
  timeoutOutcome
} from "./game-engine";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const CLOCK_START_PLY = 2;

function play(fen: string, ucis: string[]): Chess {
  const chess = new Chess(fen);
  for (const uci of ucis) {
    if (!playUciMove(chess, uci)) throw new Error(`illegal in fixture: ${uci}`);
  }
  return chess;
}

describe("game-engine", () => {
  describe("sideToMove", () => {
    it("reads the side from the FEN while the game is on", () => {
      expect(sideToMove({ fen: START, ongoing: true })).toBe("white");
      expect(sideToMove({ fen: play(START, ["e2e4"]).fen(), ongoing: true })).toBe("black");
    });

    it("is null once the game is over", () => {
      expect(sideToMove({ fen: START, ongoing: false })).toBeNull();
    });
  });

  describe("remainingClockMs", () => {
    const turnSince = new Date("2026-11-09T10:00:00.000Z");
    const at = (ms: number) => new Date(turnSince.getTime() + ms);
    const base: GameClockState = {
      blackClockMs: 60_000,
      fen: START,
      ongoing: true,
      ply: 4,
      turnSince,
      whiteClockMs: 30_000
    };

    it("runs only the side to move's clock", () => {
      expect(remainingClockMs(base, "white", at(5_000), CLOCK_START_PLY)).toBe(25_000);
      expect(remainingClockMs(base, "black", at(5_000), CLOCK_START_PLY)).toBe(60_000);
    });

    it("does not run before the clock start ply", () => {
      expect(remainingClockMs({ ...base, ply: 1 }, "white", at(5_000), CLOCK_START_PLY)).toBe(30_000);
      expect(remainingClockMs({ ...base, ply: 2 }, "white", at(5_000), CLOCK_START_PLY)).toBe(25_000);
    });

    it("goes negative past the flag (the caller decides the timeout)", () => {
      expect(remainingClockMs(base, "white", at(31_000), CLOCK_START_PLY)).toBe(-1_000);
    });

    it("stops once the game is over", () => {
      expect(remainingClockMs({ ...base, ongoing: false }, "white", at(5_000), CLOCK_START_PLY)).toBe(30_000);
    });

    it("is null for an untimed game", () => {
      expect(
        remainingClockMs({ ...base, blackClockMs: null, whiteClockMs: null }, "white", at(5_000), CLOCK_START_PLY)
      ).toBeNull();
    });
  });

  describe("clockAfterMove", () => {
    it("adds the increment from the clock start ply on", () => {
      expect(clockAfterMove(10_000, 1, 2_000, CLOCK_START_PLY)).toBe(10_000);
      expect(clockAfterMove(10_000, 2, 2_000, CLOCK_START_PLY)).toBe(12_000);
    });

    it("is null for an untimed game", () => {
      expect(clockAfterMove(null, 5, 2_000, CLOCK_START_PLY)).toBeNull();
    });
  });

  describe("hasMatingMaterial / timeoutOutcome", () => {
    it.each([
      ["8/8/8/4k3/8/8/8/4K3 w - - 0 1", "white", false], // bare king
      ["8/8/8/4k3/8/8/8/3NK3 w - - 0 1", "white", false], // one knight
      ["8/8/8/4k3/8/8/8/3BK3 w - - 0 1", "white", false], // one bishop
      ["8/8/8/4k3/8/8/8/2NNK3 w - - 0 1", "white", true], // two minors
      ["8/8/8/4k3/8/8/4P3/4K3 w - - 0 1", "white", true], // a pawn
      ["8/8/8/4k3/8/8/8/3RK3 w - - 0 1", "white", true],
      ["8/8/8/4k3/8/8/8/3QK3 w - - 0 1", "white", true],
      ["4k3/4q3/8/8/8/8/8/4K3 w - - 0 1", "black", true],
      ["4k3/8/8/8/8/8/8/3QK3 w - - 0 1", "black", false]
    ] as const)("%s → %s mating material: %s", (fen, color, expected) => {
      expect(hasMatingMaterial(fen, color)).toBe(expected);
    });

    it("the flagged side loses when the opponent can still mate", () => {
      expect(timeoutOutcome("4k3/4q3/8/8/8/8/8/4K3 w - - 0 1", "white")).toEqual({
        endReason: "TIMEOUT",
        result: "BLACK_WON"
      });
      expect(timeoutOutcome("4k3/8/8/8/8/8/8/3QK3 b - - 0 1", "black")).toEqual({
        endReason: "TIMEOUT",
        result: "WHITE_WON"
      });
    });

    it("is a draw when the opponent has no mating material", () => {
      expect(timeoutOutcome("4k3/8/8/8/8/8/8/3QK3 w - - 0 1", "white")).toEqual({
        endReason: "TIMEOUT",
        result: "DRAW"
      });
    });
  });

  it("resignationOutcome gives the game to the other side", () => {
    expect(resignationOutcome("white")).toEqual({ endReason: "RESIGNATION", result: "BLACK_WON" });
    expect(resignationOutcome("black")).toEqual({ endReason: "RESIGNATION", result: "WHITE_WON" });
  });

  describe("playUciMove", () => {
    it("plays a legal move and returns SAN + normalized UCI", () => {
      const chess = new Chess(START);
      expect(playUciMove(chess, "g1f3")).toEqual({ san: "Nf3", uci: "g1f3" });
      expect(chess.fen().split(" ")[1]).toBe("b");
    });

    it.each(["e2e5", "e7e5", "zz99", "", "e2"])("rejects %p without changing the position", (uci) => {
      const chess = new Chess(START);
      expect(playUciMove(chess, uci)).toBeNull();
      expect(chess.fen()).toBe(START);
    });

    it("plays a promotion", () => {
      const chess = new Chess("8/P6k/8/8/8/8/8/K7 w - - 0 1");
      expect(playUciMove(chess, "a7a8q")).toEqual({ san: "a8=Q", uci: "a7a8q" });
    });
  });

  describe("outcomeAfterMove", () => {
    it("checkmate is a win for the mover", () => {
      const chess = play(START, ["f2f3", "e7e5", "g2g4", "d8h4"]);
      expect(outcomeAfterMove(chess, "black")).toEqual({ endReason: "CHECKMATE", result: "BLACK_WON" });
    });

    it("stalemate", () => {
      const stalemated = play("k7/8/1QK5/8/8/8/8/8 w - - 0 1", ["c6c7"]);
      expect(outcomeAfterMove(stalemated, "white")).toEqual({ endReason: "STALEMATE", result: "DRAW" });
    });

    it("insufficient material", () => {
      const chess = play("8/8/8/4k3/8/8/4q3/4K3 w - - 0 1", ["e1e2"]);
      expect(outcomeAfterMove(chess, "white")).toEqual({ endReason: "INSUFFICIENT_MATERIAL", result: "DRAW" });
    });

    it("threefold repetition", () => {
      const chess = play(START, ["g1f3", "g8f6", "f3g1", "f6g8", "g1f3", "g8f6", "f3g1", "f6g8"]);
      expect(outcomeAfterMove(chess, "black")).toEqual({ endReason: "THREEFOLD_REPETITION", result: "DRAW" });
    });

    it("fifty-move rule", () => {
      const chess = play("4k3/8/8/8/8/8/8/R3K3 w - - 99 80", ["a1a2"]);
      expect(outcomeAfterMove(chess, "white")).toEqual({ endReason: "FIFTY_MOVE_RULE", result: "DRAW" });
    });

    it("null while the game goes on", () => {
      expect(outcomeAfterMove(play(START, ["e2e4"]), "white")).toBeNull();
    });
  });

  describe("replayGame", () => {
    const moves: MatchMove[] = [
      { san: "Nf3", uci: "g1f3" },
      { san: "Nf6", uci: "g8f6" },
      { san: "Ng1", uci: "f3g1" },
      { san: "Ng8", uci: "f6g8" },
      { san: "Nf3", uci: "g1f3" },
      { san: "Nf6", uci: "g8f6" },
      { san: "Ng1", uci: "f3g1" }
    ];

    it("replays the history so repetition sees the whole game", () => {
      const current = play(START, moves.map((m) => m.uci)).fen();
      const chess = replayGame(START, moves, current);
      expect(chess.fen()).toBe(current);
      playUciMove(chess, "f6g8");
      expect(chess.isThreefoldRepetition()).toBe(true);
    });

    it("falls back to the stored position when the history does not match it", () => {
      const stored = "4k3/8/8/8/8/8/8/R3K3 w - - 0 1";
      expect(replayGame(START, moves, stored).fen()).toBe(stored);
    });

    it("falls back to the stored position when the history is unreadable", () => {
      const current = play(START, ["e2e4"]).fen();
      expect(replayGame(START, [{ san: "?", uci: "e2e5" }], current).fen()).toBe(current);
    });
  });
});

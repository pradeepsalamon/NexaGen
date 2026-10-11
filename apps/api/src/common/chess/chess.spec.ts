import { possibleCastlingFlags, sanitizeCastlingRights } from "@nexa-chess/types";
import { Chess } from "./chess";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const kingMoves = (chess: Chess, square: "e1" | "e8" | "e4" | "e5") =>
  chess.moves({ square }).sort();

const castles = (chess: Chess) => chess.moves().filter((san) => san.startsWith("O-O"));

describe("sanitizeCastlingRights", () => {
  it("leaves the standard starting position untouched", () => {
    expect(sanitizeCastlingRights(START)).toBe(START);
    expect(possibleCastlingFlags(START.split(" ")[0])).toEqual({ K: true, Q: true, k: true, q: true });
  });

  it("drops every flag whose king is off its home square", () => {
    // King and rook dragged from e1/h1 to e4/h4, start-position flags left on.
    expect(sanitizeCastlingRights("4k3/8/8/8/4K2R/8/8/8 w KQkq - 0 1")).toBe(
      "4k3/8/8/8/4K2R/8/8/8 w - - 0 1",
    );
  });

  it("drops only the side whose rook is missing", () => {
    expect(sanitizeCastlingRights("r3k3/8/8/8/8/8/8/4K2R w KQkq - 0 1")).toBe(
      "r3k3/8/8/8/8/8/8/4K2R w Kq - 0 1",
    );
  });

  it("does not accept the opponent's rook on the corner", () => {
    expect(sanitizeCastlingRights("4k3/8/8/8/8/8/8/4K2r w K - 0 1")).toBe(
      "4k3/8/8/8/8/8/8/4K2r w - - 0 1",
    );
  });

  it("returns a FEN with no castling rights or no castling field as is", () => {
    expect(sanitizeCastlingRights("4k3/8/8/8/8/8/8/4K3 w - - 0 1")).toBe("4k3/8/8/8/8/8/8/4K3 w - - 0 1");
    expect(sanitizeCastlingRights("4k3/8/8/8/8/8/8/4K3 w")).toBe("4k3/8/8/8/8/8/8/4K3 w");
  });
});

describe("Chess (castling-safe wrapper)", () => {
  describe("standard starting position (the setup editor's default)", () => {
    it("keeps all four rights and the usual 20 moves", () => {
      const chess = new Chess();
      expect(chess.fen()).toBe(START);
      expect(chess.moves()).toHaveLength(20);
      expect(castles(chess)).toEqual([]);
    });
  });

  describe("legal castling", () => {
    it("castles both ways for White with clear paths and rights", () => {
      const chess = new Chess("r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1");
      expect(castles(chess).sort()).toEqual(["O-O", "O-O-O"]);

      const move = chess.move("O-O");
      expect(move.from).toBe("e1");
      expect(move.to).toBe("g1");
      expect(chess.get("f1")).toEqual({ color: "w", type: "r" });
      expect(chess.fen().split(" ")[2]).toBe("kq");
    });

    it("castles both ways for Black", () => {
      const chess = new Chess("r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R b KQkq - 0 1");
      expect(castles(chess).sort()).toEqual(["O-O", "O-O-O"]);

      const move = chess.move("O-O-O");
      expect(move.from).toBe("e8");
      expect(move.to).toBe("c8");
      expect(chess.get("d8")).toEqual({ color: "b", type: "r" });
      expect(chess.fen().split(" ")[2]).toBe("KQ");
    });
  });

  describe("mid-board king with stale castling flags", () => {
    it("never offers O-O / O-O-O from e4 (the reported bug)", () => {
      const chess = new Chess("4k3/8/8/8/4K2R/8/8/8 w KQkq - 0 1");
      expect(castles(chess)).toEqual([]);
      expect(chess.fen().split(" ")[2]).toBe("-");
      // Ordinary one-square king moves are unaffected.
      expect(kingMoves(chess, "e4")).toEqual(["Kd3", "Kd4", "Kd5", "Ke3", "Ke5", "Kf3", "Kf4", "Kf5"]);
    });

    it("rejects the two-square king move by coordinates as well", () => {
      const chess = new Chess("4k3/8/8/8/R3K2R/8/8/8 w KQ - 0 1");
      expect(() => chess.move({ from: "e4", to: "g4" })).toThrow();
      expect(() => chess.move({ from: "e4", to: "c4" })).toThrow();
    });

    it("does the same for a Black king on e5", () => {
      const chess = new Chess("8/8/8/r3k2r/8/8/8/4K3 b kq - 0 1");
      expect(castles(chess)).toEqual([]);
    });

    it("drops stale flags carried by a PGN [FEN] header", () => {
      const chess = new Chess();
      chess.loadPgn('[SetUp "1"]\n[FEN "4k3/8/8/8/4K2R/8/8/8 w KQkq - 0 1"]\n\n*');
      expect(castles(chess)).toEqual([]);
    });

    it("drops stale flags on reload of an existing instance", () => {
      const chess = new Chess();
      chess.load("4k3/8/8/8/4K2R/8/8/8 w K - 0 1");
      expect(castles(chess)).toEqual([]);
    });

    it("does not castle with a king on e1 when the rook is not on its corner", () => {
      const chess = new Chess("4k3/8/8/8/8/8/8/R3K1R1 w KQ - 0 1");
      expect(castles(chess)).toEqual(["O-O-O"]);
    });
  });

  describe("lost rights", () => {
    it("are not restored when the king moves away and back", () => {
      const chess = new Chess("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
      chess.move("Kf1");
      chess.move("Kf8");
      chess.move("Ke1");
      chess.move("Ke8");
      expect(chess.fen().split(" ")[2]).toBe("-");
      expect(castles(chess)).toEqual([]);
    });

    it("are lost per side when a rook moves away and back", () => {
      const chess = new Chess("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
      chess.move("Rh2");
      chess.move("Ra7");
      chess.move("Rh1");
      chess.move("Ra8");
      expect(chess.fen().split(" ")[2]).toBe("Qk");
      expect(castles(chess)).toEqual(["O-O-O"]);
    });

    it("is lost when the rook is captured on its corner", () => {
      // Black rook takes h1: White loses O-O, keeps O-O-O.
      const chess = new Chess("4k2r/8/8/8/8/8/8/R3K2R b KQk - 0 1");
      chess.move("Rxh1+");
      expect(chess.fen().split(" ")[2]).toBe("Q");
    });

    it("are restored by undo (taking the move back), and redo removes them again", () => {
      const chess = new Chess("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1");
      const move = chess.move("Kd1");
      expect(chess.fen().split(" ")[2]).toBe("kq");
      chess.undo();
      expect(chess.fen().split(" ")[2]).toBe("KQkq");
      expect(castles(chess).sort()).toEqual(["O-O", "O-O-O"]);
      chess.move(move);
      expect(chess.fen().split(" ")[2]).toBe("kq");
    });
  });

  describe("blocked paths", () => {
    it("blocks O-O with a piece on f1 or g1", () => {
      expect(castles(new Chess("4k3/8/8/8/8/8/8/4KB1R w K - 0 1"))).toEqual([]);
      expect(castles(new Chess("4k3/8/8/8/8/8/8/4K1NR w K - 0 1"))).toEqual([]);
    });

    it("blocks O-O-O with a piece on b1, c1 or d1", () => {
      expect(castles(new Chess("4k3/8/8/8/8/8/8/RN2K3 w Q - 0 1"))).toEqual([]);
      expect(castles(new Chess("4k3/8/8/8/8/8/8/R1B1K3 w Q - 0 1"))).toEqual([]);
      expect(castles(new Chess("4k3/8/8/8/8/8/8/R2QK3 w Q - 0 1"))).toEqual([]);
    });
  });

  describe("check restrictions", () => {
    it("cannot castle out of check", () => {
      const chess = new Chess("4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1");
      expect(chess.inCheck()).toBe(true);
      expect(castles(chess)).toEqual([]);
    });

    it("cannot castle through an attacked square", () => {
      // f1 (O-O) and d1 (O-O-O) attacked.
      expect(castles(new Chess("5rk1/8/8/8/8/8/8/4K2R w K - 0 1"))).toEqual([]);
      expect(castles(new Chess("3r2k1/8/8/8/8/8/8/R3K3 w Q - 0 1"))).toEqual([]);
    });

    it("cannot castle into check", () => {
      expect(castles(new Chess("6rk/8/8/8/8/8/8/4K2R w K - 0 1"))).toEqual([]);
      expect(castles(new Chess("2r3k1/8/8/8/8/8/8/R3K3 w Q - 0 1"))).toEqual([]);
    });

    it("may castle queenside while b1 (passed only by the rook) is attacked", () => {
      expect(castles(new Chess("1r4k1/8/8/8/8/8/8/R3K3 w Q - 0 1"))).toEqual(["O-O-O"]);
    });
  });
});

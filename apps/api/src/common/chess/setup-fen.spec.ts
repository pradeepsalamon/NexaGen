import { freeMoveBetween, freeMoveFen, readSetupFen, setPlacementSquare } from "@nexa-chess/types";
import { Chess } from "./chess";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const issuesOf = (fen: string) => {
  const read = readSetupFen(fen);
  if (!read.ok) throw new Error(`unexpected error: ${read.error}`);
  return read.issues;
};

describe("readSetupFen", () => {
  it("reads a normal position with no issues", () => {
    expect(readSetupFen(START)).toEqual({ ok: true, fen: START, issues: [] });
  });

  it("fills omitted trailing fields like chess.js", () => {
    expect(readSetupFen("4k3/8/8/8/8/8/8/4K3")).toEqual({ ok: true, fen: "4k3/8/8/8/8/8/8/4K3 w - - 0 1", issues: [] });
    expect(readSetupFen("4k3/8/8/8/8/8/8/4K3 b")).toMatchObject({ fen: "4k3/8/8/8/8/8/8/4K3 b - - 0 1" });
  });

  it("drops castling flags the placement can't support, never pieces", () => {
    expect(readSetupFen("4k3/8/8/8/4K2R/8/8/8 w KQkq - 0 1")).toMatchObject({ fen: "4k3/8/8/8/4K2R/8/8/8 w - - 0 1" });
  });

  it.each([
    ["8/8/8/8/8/8/8/8 w - - 0 1", ["no white king", "no black king"]],
    ["4k3/8/8/8/8/8/8/8 w - - 0 1", ["no white king"]],
    ["K3k3/8/8/8/8/8/8/K3K3 w - - 0 1", ["3 white kings"]],
    ["4k3/8/8/8/8/8/8/4K2k w - - 0 1", ["2 black kings"]],
    ["4k2P/8/8/8/8/8/8/4K3 w - - 0 1", ["a pawn on the first or last rank"]],
    ["4k3/8/8/8/8/8/8/p3K3 w - - 0 1", ["a pawn on the first or last rank"]],
  ])("reports %s as set-up only without changing it", (fen, issues) => {
    expect(readSetupFen(fen)).toEqual({ ok: true, fen, issues });
  });

  it("keeps an arbitrary arrangement (nine queens, two kings each) exactly as given", () => {
    const fen = "QQQQQQQQ/Q7/8/3kk3/8/8/8/3KK3 b - - 0 1";
    const read = readSetupFen(fen);
    expect(read).toMatchObject({ ok: true, fen });
    expect(issuesOf(fen)).toEqual(["2 white kings", "2 black kings"]);
  });

  describe("the side not to move in check", () => {
    it.each([
      ["rook on the file", "4k3/8/8/8/8/8/8/4K2r b - - 0 1", "White is in check with Black to move"],
      ["queen on the diagonal", "4k3/8/8/8/7q/8/8/4K3 b - - 0 1", "White is in check with Black to move"],
      ["knight", "4k3/8/8/8/8/5n2/8/4K3 b - - 0 1", "White is in check with Black to move"],
      ["white pawn attacks up the board", "4k3/3P4/8/8/8/8/8/4K3 w - - 0 1", "Black is in check with White to move"],
      ["kings touching", "8/8/8/3kK3/8/8/8/8 w - - 0 1", "Black is in check with White to move"],
    ])("is an issue: %s", (_name, fen, issue) => {
      expect(issuesOf(fen)).toEqual([issue]);
    });

    it.each([
      ["a blocked rook", "4k3/8/8/8/8/8/8/4KB1r b - - 0 1"],
      ["a black pawn does not attack up the board", "4k3/8/8/8/8/3K4/4p3/8 b - - 0 1"],
      ["only the side to move is in check (an ordinary check)", "4k3/8/8/8/8/8/8/4K2r w - - 0 1"],
    ])("is not an issue: %s", (_name, fen) => {
      expect(issuesOf(fen)).toEqual([]);
    });

    it("agrees with chess.js on every position reached in a real game", () => {
      // Every ply of a sharp game: each is legal, so none has an issue, and
      // chess.js accepts each one strictly.
      const game = new Chess();
      const moves = "e4 e5 Nf3 Nc6 Bc4 Bc5 b4 Bxb4 c3 Ba5 d4 exd4 O-O d3 Qb3 Qf6 e5 Qg6 Re1 Nge7 Ba3 b5 Qxb5 Rb8 Qa4 Bb6 Nbd2 Bb7 Ne4 Qf5 Bxd3 Qh5 Nf6+ gxf6 exf6 Rg8 Rad1 Qxf3 Rxe7+ Nxe7 Qxd7+ Kxd7 Bf5+ Ke8 Bd7+ Kf8 Bxe7#".split(" ");
      for (const san of moves) {
        game.move(san);
        expect(issuesOf(game.fen())).toEqual([]);
      }
    });

    it("matches chess.js's attack detection on random positions", () => {
      // Deterministic PRNG so a failure reproduces.
      let seed = 20261021;
      const rand = (n: number) => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed % n;
      };
      const pieces = "pnbrqPNBRQ";
      for (let i = 0; i < 2000; i += 1) {
        const cells: string[] = Array(64).fill("");
        const free = () => {
          let sq = rand(64);
          while (cells[sq]) sq = (sq + 1) % 64;
          return sq;
        };
        cells[free()] = "K";
        cells[free()] = "k";
        for (let n = rand(12); n > 0; n -= 1) {
          const sq = free();
          const piece = pieces[rand(pieces.length)];
          // Pawns stay off the back ranks so the only possible issue is the check.
          if (piece.toLowerCase() === "p" && (sq < 8 || sq >= 56)) continue;
          cells[sq] = piece;
        }
        let placement = "";
        for (let r = 0; r < 8; r += 1) {
          placement += cells.slice(r * 8, r * 8 + 8).map((c) => c || "1").join("").replace(/1+/g, (run) => String(run.length));
          if (r < 7) placement += "/";
        }
        const turn = rand(2) ? "w" : "b";
        const fen = `${placement} ${turn} - - 0 1`;

        const loose = new Chess(fen, { skipValidation: true });
        const waiting = turn === "w" ? "b" : "w";
        const king = loose.board().flat().find((sq) => sq?.type === "k" && sq.color === waiting)!.square;
        const expected = loose.isAttacked(king, turn)
          ? [`${waiting === "w" ? "White" : "Black"} is in check with ${turn === "w" ? "White" : "Black"} to move`]
          : [];
        expect({ fen, issues: issuesOf(fen) }).toEqual({ fen, issues: expected });
      }
    });
  });

  it.each([
    ["", "the FEN is empty"],
    ["8/8/8/8/8/8/8 w - - 0 1", 'the board needs 8 ranks separated by "/", found 7'],
    ["4k3/8/8/8/8/8/8/4K4 w - - 0 1", "rank 1 has 9 squares instead of 8"],
    ["4k3/8/8/8/8/8/8/44 w - - 0 1", "rank 1 has two numbers in a row"],
    ["4k3/8/8/8/8/8/8/4X3 w - - 0 1", '"X" on rank 1 is not a piece letter'],
    ["4k3/8/8/8/8/8/8/4K3 x - - 0 1", 'side to move must be "w" or "b", not "x"'],
    ["4k3/8/8/8/8/8/8/4K3 w KX - 0 1", '"KX" is not a castling field'],
    ["4k3/8/8/8/8/8/8/4K3 w - e4 0 1", '"e4" is not an en passant square'],
    ["4k3/8/8/8/8/8/8/4K3 w - e3 0 1", "en passant on e3 does not fit White to move"],
    ["4k3/8/8/8/8/8/8/4K3 w - - x 1", "the halfmove clock must be a whole number"],
    ["4k3/8/8/8/8/8/8/4K3 w - - 0 0", "the move number must be 1 or more"],
    ["4k3/8/8/8/8/8/8/4K3 w - - 0 1 extra", "a FEN has at most 6 fields"],
  ])("rejects malformed notation %j", (fen, error) => {
    expect(readSetupFen(fen)).toEqual({ ok: false, error });
  });
});

describe("setPlacementSquare", () => {
  const empty = "8/8/8/8/8/8/8/8";

  it("places, replaces and removes a piece", () => {
    const one = setPlacementSquare(empty, "e4", "Q");
    expect(one).toBe("8/8/8/8/4Q3/8/8/8");
    expect(setPlacementSquare(one, "e4", "n")).toBe("8/8/8/8/4n3/8/8/8");
    expect(setPlacementSquare(one, "e4", null)).toBe(empty);
  });

  it("handles the corners and merges empty runs", () => {
    let p = setPlacementSquare(empty, "a8", "k");
    p = setPlacementSquare(p, "h1", "K");
    expect(p).toBe("k7/8/8/8/8/8/8/7K");
    expect(setPlacementSquare("rnbqkbnr/8/8/8/8/8/8/8", "d8", null)).toBe("rnb1kbnr/8/8/8/8/8/8/8");
  });

  it("places as many kings and back-rank pawns as asked", () => {
    let p = empty;
    for (const sq of ["a1", "b1", "c1"]) p = setPlacementSquare(p, sq, "K");
    p = setPlacementSquare(p, "h8", "P");
    expect(p).toBe("7P/8/8/8/8/8/8/KKK5");
  });

  it("leaves malformed input or a bad square unchanged", () => {
    expect(setPlacementSquare("8/8", "e4", "Q")).toBe("8/8");
    expect(setPlacementSquare(empty, "i9", "Q")).toBe(empty);
    expect(setPlacementSquare(empty, "e4", "X")).toBe(empty);
  });
});

describe("freeMoveFen", () => {
  it("moves a piece where chess rules would not let it go", () => {
    // A bishop through its own pawn; Black moves next.
    expect(freeMoveFen(START, "f1", "f5")).toBe("rnbqkbnr/pppppppp/8/5B2/8/8/PPPPPPPP/RNBQK1NR b KQkq - 1 1");
  });

  it("lets the side not to move play, and hands the move back", () => {
    expect(freeMoveFen(START, "e7", "e5")).toBe("rnbqkbnr/pppp1ppp/8/4p3/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 2");
  });

  it("captures whatever stands on the target square, a king included", () => {
    const fen = freeMoveFen("4k3/8/8/8/8/8/8/4K2Q w - - 0 1", "h1", "e8");
    expect(fen).toBe("4Q3/8/8/8/8/8/8/4K3 b - - 0 1");
    expect(readSetupFen(fen!)).toMatchObject({ ok: true, issues: ["no black king"] });
  });

  it("drops the castling rights the move breaks and clears en passant", () => {
    expect(freeMoveFen("r3k2r/8/8/3pP3/8/8/8/R3K2R w KQkq d6 0 9", "h1", "h4")).toBe(
      "r3k2r/8/8/3pP3/7R/8/8/R3K3 b Qkq - 1 9",
    );
  });

  it.each([
    ["e4", "h1", "Qkq"],
    ["e4", "a1", "Kkq"],
    ["d4", "h8", "KQq"],
    ["d4", "a8", "KQk"],
    ["d4", "h1", "Qkq"],
    ["e4", "a8", "KQk"],
  ])("drops only the captured or replaced home rook's right: %s to %s", (from, to, rights) => {
    const fen = freeMoveFen("r3k2r/8/8/8/3rR3/8/8/R3K2R w KQkq - 7 9", from, to);
    expect(fen?.split(" ")[2]).toBe(rights);
    expect(fen?.split(" ")[4]).toBe("0");
  });

  it.each(["", "i4", "a0", "h9", "E4", "a10", "e4extra", " e4", "e4\n"])("rejects an invalid source or destination %j", (square) => {
    expect(freeMoveFen(START, "e2", square)).toBeNull();
    expect(freeMoveFen(START, square, "e4")).toBeNull();
  });

  it("keeps a pawn a pawn on the back rank", () => {
    expect(freeMoveFen("4k3/8/8/8/8/8/P7/4K3 w - - 0 1", "a2", "a8")).toBe("P3k3/8/8/8/8/8/8/4K3 b - - 0 1");
  });

  it("returns null for an empty square, a null move or an unreadable board", () => {
    expect(freeMoveFen(START, "e4", "e5")).toBeNull();
    expect(freeMoveFen(START, "e2", "e2")).toBeNull();
    expect(freeMoveFen("8/8 w - - 0 1", "a1", "a2")).toBeNull();
  });
});

describe("freeMoveBetween", () => {
  it("finds the free move that reaches a position", () => {
    expect(freeMoveBetween(START, freeMoveFen(START, "f1", "f5")!)).toEqual({ from: "f1", to: "f5" });
    expect(freeMoveBetween(START, freeMoveFen(START, "e7", "e5")!)).toEqual({ from: "e7", to: "e5" });
  });

  it("finds a free capture, a king included", () => {
    const from = "4k3/8/8/8/8/8/8/4K2Q w - - 0 1";
    expect(freeMoveBetween(from, freeMoveFen(from, "h1", "e8")!)).toEqual({ from: "h1", to: "e8" });
  });

  it("ignores the move counters", () => {
    expect(freeMoveBetween(START, "rnbqkbnr/pppppppp/8/5B2/8/8/PPPPPPPP/RNBQK1NR b KQkq - 7 30")).toEqual({
      from: "f1",
      to: "f5",
    });
  });

  it.each([
    ["the same position", START],
    ["two pieces moved", "rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2"],
    ["a piece that appeared", "rnbqkbnr/pppppppp/8/8/4Q3/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1"],
    ["a piece that changed", "rnbqkbnr/pppppppp/8/8/4Q3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"],
    ["the wrong side to move", "rnbqkbnr/pppppppp/8/5B2/8/8/PPPPPPPP/RNBQK1NR w KQkq - 1 1"],
  ])("rejects %s", (_label, to) => {
    expect(freeMoveBetween(START, to)).toBeNull();
  });
});

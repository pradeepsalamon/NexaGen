import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  DIAGRAM_LIMITS,
  DIAGRAM_LOW_CONFIDENCE,
  DIAGRAM_PIECE_TEMPLATES,
  describeDiagramSource,
  detectDiagramBoards,
  diagramGridToPlacement,
  diagramSquareName,
  inferOrientationFromLabels,
  inferOrientationFromPieces,
  parseSideToMoveHint,
  diagramSquareProbabilities,
  fontReadingAgrees,
  readChessFontBoard,
  parsePrintedMoves,
  recognizeDiagramBoard,
  recognizeDiagramBoardWithTemplates,
  refineDiagramBoard,
  rgbaToGray,
  sanitizeDiagramFileName,
  textNearDiagram,
  validateDiagramPosition,
  type DiagramChessProbe,
  type GrayImage,
} from "@nexa-chess/types";
import { Chess } from "./chess";

// The PDF diagram recognizer (packages/types diagram-recognition.ts) runs in the
// coach's browser on pages pdf.js renders. Fixtures:
//   set-*, noisy-scan, no-board — pages drawn from HTML (generate-fixtures.mjs)
//   pdfjs-*                     — the fixture PDFs exactly as pdf.js renders
//                                 them in the browser (capture-pdf-renders.mjs)
//
// Measured on 2026-11-01, pieces read correctly, on boards the model never trained on
// (scripts/diagram-import/real-books, train-square-classifier.py):
//   a scanned book, privately held out             98.4% (12/18 boards perfect), and
//                                                  97.4% with its closest font held out too
//   the old silhouette matcher, same kind of book  66.5%
//   60 clean renders of 10 unseen piece sets       90.7% (32/60 boards perfect)
// Clean renders depend on the style: 92–100% for seven sets, 84% and 79% for two
// unusual ones, 54% for the very stylised pirouetti.
// The other 94 book boards score over 99%, but they are training data, so that says nothing
// about a new book. Annotated boards: 10/16 found and 0/190 false alarms, tuned on those
// same boards. Run real-books.mts measure and the trainer to reproduce these.

const FIXTURES = join(__dirname, "__fixtures__/diagram");

type ExpectedDiagram = { set: string; fen: string; style: string; flipped?: boolean };
type ExpectedImage = { file: string; diagrams: ExpectedDiagram[] };

const expected: ExpectedImage[] = [
  // Pages drawn straight from HTML (generate-fixtures.mjs)…
  ...JSON.parse(readFileSync(join(FIXTURES, "expected.json"), "utf8")),
  // …and the fixture PDFs as pdf.js renders them in the browser (capture-pdf-renders.mjs).
  ...JSON.parse(readFileSync(join(FIXTURES, "pdfjs-expected.json"), "utf8")),
];

function loadPgm(file: string): GrayImage {
  const buf = gunzipSync(readFileSync(join(FIXTURES, file)));
  const header = buf.toString("latin1", 0, 40).match(/^P5\s+(\d+)\s+(\d+)\s+255\s/);
  if (!header) throw new Error(`${file} is not a binary PGM`);
  return { width: Number(header[1]), height: Number(header[2]), data: new Uint8Array(buf.subarray(header[0].length)) };
}

const images = new Map(expected.map((e) => [e.file, loadPgm(e.file)]));

const expand = (placement: string) =>
  placement
    .split("/")
    .map((r) => r.replace(/\d/g, (n) => ".".repeat(Number(n))))
    .join("");

/** Squares read wrong, as "e4:P->B", plus whether each mistake was flagged for review. */
function compare(img: GrayImage, d: ExpectedDiagram, rect: { x: number; y: number; w: number; h: number }, templates?: typeof DIAGRAM_PIECE_TEMPLATES) {
  const rec = templates ? recognizeDiagramBoardWithTemplates(img, rect, templates) : recognizeDiagramBoard(img, rect);
  const orientation = d.flipped ? "black" : "white";
  const got = expand(diagramGridToPlacement(rec.grid, orientation));
  const want = expand(d.fen.split(" ")[0]);
  const wrong: string[] = [];
  let unflagged = 0;
  for (let i = 0; i < 64; i += 1) {
    if (got[i] === want[i]) continue;
    wrong.push(`${"abcdefgh"[i % 8]}${8 - (i >> 3)}:${want[i]}->${got[i]}`);
    // Printed position of board square i.
    const printed = d.flipped ? 63 - i : i;
    if (rec.squares[printed].confidence >= DIAGRAM_LOW_CONFIDENCE) unflagged += 1;
  }
  return { wrong, unflagged, rec };
}

describe("square classifier", () => {
  const parity = JSON.parse(readFileSync(join(FIXTURES, "square-model-parity.json"), "utf8")) as { patches: number[][]; probabilities: number[][] };

  it("computes the same probabilities as the PyTorch model it was exported from", () => {
    parity.patches.forEach((patch, i) => {
      const got = diagramSquareProbabilities(Float32Array.from(patch));
      parity.probabilities[i].forEach((want, c) => expect(got[c]).toBeCloseTo(want, 2));
    });
  });
});

describe("annotated diagrams", () => {
  const withLine = (img: GrayImage, rect: { x: number; y: number; w: number; h: number }): GrayImage => {
    const data = img.data.slice();
    for (let t = 0; t < rect.w; t += 0.5) {
      for (let thick = -1; thick <= 1; thick += 1) {
        data[Math.round(rect.y + t + thick) * img.width + Math.round(rect.x + t)] = 0;
      }
    }
    return { ...img, data };
  };

  it("a board with a line drawn across it is annotated, and its pieces go to the coach; the same board without it isn't", () => {
    const img = images.get("set-classic.pgm.gz") as GrayImage;
    const { rect } = detectDiagramBoards(img)[0];
    expect(recognizeDiagramBoard(img, rect).annotated).toBe(false);
    const marked = recognizeDiagramBoard(withLine(img, rect), rect);
    expect(marked.annotated).toBe(true);
    for (const square of marked.squares) if (square.piece) expect(square.confidence).toBeLessThan(DIAGRAM_LOW_CONFIDENCE);
  });
});

describe("chess fonts in the text layer", () => {
  const rect = { x: 100, y: 100, w: 320, h: 320 };
  const rowsToItems = (rows: string[]) =>
    rows.map((text, r) => ({ text, width: 320, x: 260, y: 100 + r * 40 + 20 }));

  it("reads a board set in the Alpha/Merida mapping, on either square colour", () => {
    const grid = readChessFontBoard(rowsToItems(["tMvWlVmT", "oOoOoOoO", " + + + +", "+ + + + ", " + + + +", "+ + + + ", "pPpPpPpP", "RnBqKbNr"]), rect);
    expect(grid?.[0]).toEqual(["r", "n", "b", "q", "k", "b", "n", "r"]);
    expect(grid?.[1]).toEqual(["p", "p", "p", "p", "p", "p", "p", "p"]);
    expect(grid?.[2]).toEqual(Array(8).fill(null));
    expect(grid?.[7]).toEqual(["R", "N", "B", "Q", "K", "B", "N", "R"]);
  });

  it("isn't fooled by ordinary text or a stray caption", () => {
    expect(readChessFontBoard(rowsToItems(["White to move and win in two"]), rect)).toBeNull();
    expect(readChessFontBoard([{ text: "Nf3", width: 30, x: 200, y: 200 }], rect)).toBeNull();
  });

  it("a different font's letters only count if the page's pixels agree", () => {
    const empty = Array.from({ length: 8 }, () => Array<string | null>(8).fill(null));
    const other = empty.map((row) => [...row]);
    for (let c = 0; c < 8; c += 1) other[0][c] = "p";
    expect(fontReadingAgrees(empty, empty)).toBe(true);
    expect(fontReadingAgrees(other, empty)).toBe(false);
    // Sparse board where matching empty squares exceed 90% but occupied squares disagree
    const sparseFont = empty.map((row) => [...row]);
    sparseFont[0][0] = "k";
    sparseFont[0][1] = "q";
    sparseFont[0][2] = "r";
    const sparseImage = empty.map((row) => [...row]);
    sparseImage[0][0] = "K";
    sparseImage[0][1] = "Q";
    sparseImage[0][2] = "R";
    expect(fontReadingAgrees(sparseFont, sparseImage)).toBe(false);
  });
});

describe("parsePrintedMoves", () => {
  it("reads numbered algebraic moves, figurines, captures, castling and annotation marks", () => {
    expect(parsePrintedMoves("1.e4 e5 2.♘f3 ♞c6 3. Bxc5+! 0-0")).toEqual([["e4", "e5", "Nf3", "Nc6", "Bxc5+", "O-O"]]);
  });

  it("splits runs at ordinary words, longest first, and ignores descriptive notation", () => {
    expect(parsePrintedMoves("White plays Nf3 and then 2.d4 Nf6 3.c4 wins. P-K4 Kt-B3")).toEqual([["d4", "Nf6", "c4"], ["Nf3"]]);
  });
});

describe("detectDiagramBoards", () => {
  it("finds a board on a page scanned well below white", () => {
    const img = images.get("set-classic.pgm.gz") as GrayImage;
    // The whole page at paper level ~200, like an old book's scan.
    const dim: GrayImage = { ...img, data: img.data.map((v) => Math.round(v * 0.78)) };
    expect(detectDiagramBoards(dim)).toHaveLength(detectDiagramBoards(img).length);
  });

  it.each(expected.map((e) => [e.file, e.diagrams.length] as const))("%s has %i board(s)", (file, count) => {
    expect(detectDiagramBoards(images.get(file) as GrayImage)).toHaveLength(count);
  });

  it("does not take an 8×8 table of numbers for a chessboard", () => {
    expect(detectDiagramBoards(images.get("no-board.pgm.gz") as GrayImage)).toEqual([]);
  });

  it("returns boards in reading order with a near-perfect checkerboard", () => {
    const boards = detectDiagramBoards(images.get("set-classic.pgm.gz") as GrayImage);
    expect(boards[0].rect.x).toBeLessThan(boards[1].rect.x);
    for (const b of boards) {
      expect(b.agreement).toBeGreaterThanOrEqual(0.9);
      expect(Math.abs(b.rect.w - b.rect.h)).toBeLessThan(b.rect.w * 0.05);
    }
  });

  it("finds nothing on blank paper or pure noise and stays bounded", () => {
    const blank: GrayImage = { width: 2400, height: 3200, data: new Uint8Array(2400 * 3200).fill(255) };
    expect(detectDiagramBoards(blank)).toEqual([]);
    let seed = 7;
    const noise = new Uint8Array(900 * 900).map(() => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 256));
    expect(detectDiagramBoards({ width: 900, height: 900, data: noise }).length).toBeLessThanOrEqual(
      DIAGRAM_LIMITS.maxBoardsPerPage,
    );
  });
});

describe("recognizeDiagramBoard on the fixtures", () => {
  const clean = expected.filter((e) => e.file.startsWith("set-"));

  it.each(clean.flatMap((e) => e.diagrams.map((d, i) => [e.file, d.set, d.style, i] as const)))(
    "%s: %s pieces on %s squares — at most one square wrong, and flagged",
    (file, _set, _style, index) => {
      const img = images.get(file) as GrayImage;
      const board = detectDiagramBoards(img)[index];
      const d = (expected.find((e) => e.file === file) as ExpectedImage).diagrams[index];
      const r = compare(img, d, board.rect);
      // Measured: 11 of 12 boards exact; the minimal set's c1 bishop on hatching reads black (flagged).
      expect(r.wrong.length).toBeLessThanOrEqual(1);
      expect(r.unflagged).toBe(0);
    },
  );

  it("reads the fixture PDFs as pdf.js renders them, flagging every square it gets wrong", () => {
    let total = 0;
    let wrong = 0;
    let unflagged = 0;
    for (const e of expected.filter((x) => x.file.startsWith("pdfjs-"))) {
      const img = images.get(e.file) as GrayImage;
      const boards = detectDiagramBoards(img);
      expect(boards).toHaveLength(e.diagrams.length);
      e.diagrams.forEach((d, i) => {
        const r = compare(img, d, boards[i].rect);
        total += 64;
        wrong += r.wrong.length;
        unflagged += r.unflagged;
      });
    }
    // Measured: 248/256 — Merida's white queen on d1 reads black at book size, scan pawns blur into bishops.
    expect((total - wrong) / total).toBeGreaterThanOrEqual(0.96);
    expect(unflagged).toBe(0);
  });

  it("reads a blurred, noisy scan almost entirely and flags every square it got wrong", () => {
    const e = expected.find((x) => x.file === "noisy-scan.pgm.gz") as ExpectedImage;
    const img = images.get(e.file) as GrayImage;
    const boards = detectDiagramBoards(img);
    let wrong = 0;
    let unflagged = 0;
    e.diagrams.forEach((d, i) => {
      const r = compare(img, d, boards[i].rect);
      wrong += r.wrong.length;
      unflagged += r.unflagged;
    });
    // Measured: 4 of 128 squares wrong (blurred Merida pawns read as bishops), all flagged.
    expect(wrong).toBeLessThanOrEqual(6);
    expect(unflagged).toBe(0);
  });

  it("leave-one-set-out, silhouette matcher alone: an unseen piece set still reads ≥ 95% of squares", () => {
    let total = 0;
    let right = 0;
    for (const e of expected) {
      const img = images.get(e.file) as GrayImage;
      const boards = detectDiagramBoards(img);
      e.diagrams.forEach((d, i) => {
        const templates = DIAGRAM_PIECE_TEMPLATES.filter((t) => t.set !== d.set);
        const { wrong } = compare(img, d, boards[i].rect, templates);
        total += 64;
        right += 64 - wrong.length;
      });
    }
    // Measured 1120/1152 = 97.2% when this was written (pdf.js renders included); a regression floor.
    expect(right / total).toBeGreaterThanOrEqual(0.95);
  });

  it("snaps a coach's loose manual selection onto the same grid", () => {
    const img = images.get("set-tournament.pgm.gz") as GrayImage;
    const [board] = detectDiagramBoards(img);
    const loose = { x: board.rect.x - 9, y: board.rect.y - 7, w: board.rect.w + 15, h: board.rect.h + 13 };
    const refined = refineDiagramBoard(img, loose);
    expect(refined).not.toBeNull();
    const r = (refined as NonNullable<typeof refined>).rect;
    expect(Math.abs(r.x - board.rect.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(r.y - board.rect.y)).toBeLessThanOrEqual(3);
    expect(Math.abs(r.w - board.rect.w)).toBeLessThanOrEqual(4);
  });
});

describe("grid → placement and orientation", () => {
  const grid: (string | null)[][] = Array.from({ length: 8 }, () => Array(8).fill(null));
  grid[7][4] = "K"; // printed bottom row, 5th column
  grid[0][4] = "k";
  grid[6][0] = "P";
  grid[1][7] = "p";

  it("reads the printed grid from White's side", () => {
    expect(diagramGridToPlacement(grid, "white")).toBe("4k3/7p/8/8/8/8/P7/4K3");
    expect(diagramSquareName(7, 4, "white")).toBe("e1");
  });

  it("rotates a diagram printed from Black's side", () => {
    expect(diagramGridToPlacement(grid, "black")).toBe("3K4/7P/8/8/8/8/p7/3k4");
    expect(diagramSquareName(7, 4, "black")).toBe("d8");
  });

  it("guesses orientation from the pawns but always asks for confirmation", () => {
    expect(inferOrientationFromPieces(grid)).toEqual({ orientation: "white", source: "pieces", needsConfirmation: true });
    const flipped = grid.map((row) => [...row].reverse()).reverse();
    expect(inferOrientationFromPieces(flipped).orientation).toBe("black");
    const bare: (string | null)[][] = Array.from({ length: 8 }, () => Array(8).fill(null));
    bare[3][3] = "K";
    bare[3][5] = "k";
    expect(inferOrientationFromPieces(bare)).toEqual({ orientation: "white", source: "none", needsConfirmation: true });
  });

  it("trusts printed coordinates, and only when enough of them agree", () => {
    const rect = { x: 100, y: 100, w: 400, h: 400 };
    const filesBelow = (letters: string) =>
      [...letters].map((t, i) => ({ text: t, x: 100 + i * 50 + 25, y: 520 }));
    expect(inferOrientationFromLabels(filesBelow("abcdefgh"), rect)).toEqual({
      orientation: "white",
      source: "coordinates",
      needsConfirmation: false,
    });
    expect(inferOrientationFromLabels(filesBelow("hgfedcba"), rect)?.orientation).toBe("black");
    expect(inferOrientationFromLabels(filesBelow("ab"), rect)).toBeNull();
    // Labels far from the board are captions, not coordinates.
    expect(inferOrientationFromLabels([...filesBelow("abcdefgh")].map((l) => ({ ...l, y: 900 })), rect)).toBeNull();
  });
});

describe("parseSideToMoveHint", () => {
  it.each([
    ["Diagram 12 — White to move", "w"],
    ["Black to play and win", "b"],
    ["White wins", "w"],
    ["W to move", "w"],
    ["It is Black's move", "b"],
    ["White’s turn", "w"],
  ])("%s", (text, side) => {
    expect(parseSideToMoveHint(text)?.side).toBe(side);
  });

  it.each([["Position after 14.O-O"], ["White to move. Black to play."], ["Black and White squares"], ["b moves"], ["w's move"]])(
    "is unsure about %s",
    (text) => {
      expect(parseSideToMoveHint(text)).toBeNull();
    },
  );

  // Capablanca's Chess Fundamentals: the column around the board clipped "merely" and
  // "threatens", which used to leave "White to play" when it is Black's move.
  it("doesn't read a phrase across a line break in a clipped sentence", () => {
    const rect = { x: 335, y: 780, w: 420, h: 420 };
    const line = (y: number, words: [string, number][]) => words.map(([text, x]) => ({ text, x, y }));
    const items = [
      ...line(1250, [["It", 195], ["is", 230], ["Black's", 300], ["move,", 380], ["and", 450], ["thinking", 540], ["that", 640], ["White", 760], ["merely", 890]]),
      ...line(1296, [["threatens", 205], ["to", 300], ["play", 355], ["Q—R", 450], ["6", 510]]),
    ];
    expect(parseSideToMoveHint(textNearDiagram(items, rect))).toEqual({ phrase: "Black's move", side: "b" });
    expect(parseSideToMoveHint(textNearDiagram(items.filter((it) => it.text !== "Black's"), rect))).toBeNull();
  });

  it("reads only the text just under or over the board", () => {
    const rect = { x: 0, y: 100, w: 400, h: 400 };
    const items = [
      { text: "Black to move", x: 200, y: 50 },
      { text: "White to move", x: 200, y: 530 },
      { text: "Black wins", x: 200, y: 1200 },
    ];
    expect(textNearDiagram(items, rect)).toBe("Black to move\nWhite to move");
  });
});

describe("validateDiagramPosition", () => {
  const probe: DiagramChessProbe = (fen) => {
    try {
      const chess = new Chess(fen);
      return { ok: true, inCheck: chess.inCheck(), legalMoves: chess.moves().length };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  };
  const codes = (fen: string) => {
    const v = validateDiagramPosition(fen, probe);
    return { errors: v.errors.map((e) => e.code), warnings: v.warnings.map((w) => w.code) };
  };

  it("accepts a normal position", () => {
    expect(codes("r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 1")).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it("explains structural errors per rank", () => {
    expect(codes("8/8/8/8/8/8/8 w - - 0 1").errors).toEqual(["rank-count"]);
    expect(codes("4k3/9/8/8/8/8/8/4K3 w - - 0 1").errors).toContain("bad-symbol");
    expect(codes("4k4/8/8/8/8/8/8/4K3 w - - 0 1").errors).toContain("rank-length");
    expect(codes("4k3/8/8/8/8/8/8/4K3 x - - 0 1").errors).toContain("turn");
    expect(codes("4k3/8/8/8/8/8/8/4K3 w").errors).toEqual(["field-count"]);
  });

  it("rejects positions that cannot stand on a board", () => {
    expect(codes("8/8/8/8/8/8/8/4K3 w - - 0 1").errors).toContain("missing-king");
    expect(codes("4k3/8/8/8/8/8/8/3KK3 w - - 0 1").errors).toContain("extra-king");
    expect(codes("P3k3/8/8/8/8/8/8/4K3 w - - 0 1").errors).toContain("pawn-back-rank");
    expect(codes("8/8/8/3kK3/8/8/8/8 w - - 0 1").errors).toContain("kings-adjacent");
    // Black's king is attacked by the rook while White is to move.
    expect(codes("4k3/8/8/8/8/8/8/4RK2 w - - 0 1").errors).toEqual(["opponent-in-check"]);
  });

  it("checks castling and en passant against the placement", () => {
    expect(codes("4k3/8/8/8/8/8/8/4K3 w K - 0 1").errors).toEqual(["castling-placement"]);
    expect(codes("4k3/8/8/8/8/8/8/4K2R w K - 0 1").errors).toEqual([]);
    expect(codes("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1").errors).toEqual([]);
    expect(codes("4k3/8/8/4P3/8/8/8/4K3 w - d6 0 1").errors).toEqual(["ep-inconsistent"]);
  });

  it("only warns about positions a real game is unlikely to reach", () => {
    expect(codes("4k3/8/8/8/8/8/8/QQQ1K3 w - - 0 1").warnings).toEqual([]);
    expect(codes("4k3/8/8/8/8/8/PPPPPPPP/QQ2K3 w - - 0 1").warnings).toEqual(["promotions"]);
    expect(codes("4k3/8/8/8/P7/PPPPPPPP/8/4K3 w - - 0 1").warnings).toContain("too-many-pawns");
    expect(codes("7k/5QQ1/8/8/8/8/8/4K3 b - - 0 1").warnings).toEqual(["game-over"]);
  });
});

describe("provenance", () => {
  it("never keeps a path or control characters in the file name", () => {
    expect(sanitizeDiagramFileName("C:\\Users\\coach\\Books\\Endgames.pdf")).toBe("Endgames.pdf");
    expect(sanitizeDiagramFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeDiagramFileName("a\u0000b<script>.pdf")).toBe("abscript.pdf");
    expect(sanitizeDiagramFileName("")).toBe("document.pdf");
    expect(sanitizeDiagramFileName("x".repeat(300))).toHaveLength(80);
  });

  it("describes where a position came from", () => {
    expect(describeDiagramSource({ fileName: "/tmp/Book.pdf", page: 3, diagram: 2, corrected: true })).toBe(
      'Imported from "Book.pdf", page 3, diagram 2 (corrected by coach).',
    );
  });
});

describe("rgbaToGray", () => {
  it("treats transparent pixels as paper", () => {
    const img = rgbaToGray(Uint8ClampedArray.from([0, 0, 0, 255, 0, 0, 0, 0]), 2, 1);
    expect(Array.from(img.data)).toEqual([0, 255]);
  });
});

// Castling-rights hygiene for FEN strings. Pure string handling — no chess.js —
// so both apps share one implementation.
//
// chess.js 1.x trusts a FEN's castling field on `load` (only `put`/`remove`
// re-check it), and its move generator castles from wherever the king stands:
// `4k3/8/8/8/4K2R/8/8/8 w K -` offers "O-O" from e4. A position set up in the
// editor keeps the start position's `KQkq` after the pieces are dragged away,
// so every FEN must pass through `sanitizeCastlingRights` before it reaches a
// chess.js instance (each app's `Chess` wrapper does this in `load`).

export type CastlingFlag = "K" | "Q" | "k" | "q";

// The king and rook home squares each flag needs (standard chess, not 960).
const CASTLING_REQUIREMENTS: Record<CastlingFlag, { king: string; rook: string; piece: { king: string; rook: string } }> = {
  K: { king: "e1", rook: "h1", piece: { king: "K", rook: "R" } },
  Q: { king: "e1", rook: "a1", piece: { king: "K", rook: "R" } },
  k: { king: "e8", rook: "h8", piece: { king: "k", rook: "r" } },
  q: { king: "e8", rook: "a8", piece: { king: "k", rook: "r" } },
};

const CASTLING_ORDER: CastlingFlag[] = ["K", "Q", "k", "q"];

/** Map of square → piece letter for a FEN placement field. Malformed input yields what it can. */
function placementSquares(placement: string): Map<string, string> {
  const squares = new Map<string, string>();
  const ranks = placement.split("/");
  ranks.forEach((rankText, index) => {
    const rank = 8 - index;
    let file = 0;
    for (const ch of rankText) {
      if (/[1-8]/.test(ch)) {
        file += Number(ch);
      } else {
        if (file < 8) squares.set(`${"abcdefgh"[file]}${rank}`, ch);
        file += 1;
      }
    }
  });
  return squares;
}

/**
 * Which castling flags the placement can support at all: king on e1/e8 and
 * the matching rook on its corner. Says nothing about whether castling is
 * legal right now (path, check) — the move generator decides that.
 */
export function possibleCastlingFlags(placement: string): Record<CastlingFlag, boolean> {
  const squares = placementSquares(placement);
  const result = { K: false, Q: false, k: false, q: false };
  for (const flag of CASTLING_ORDER) {
    const req = CASTLING_REQUIREMENTS[flag];
    result[flag] =
      squares.get(req.king) === req.piece.king && squares.get(req.rook) === req.piece.rook;
  }
  return result;
}

/**
 * Drops every castling flag the placement cannot support, so a FEN never
 * claims a right whose king or rook is off its home square. Other fields are
 * returned untouched; a string without a castling field is returned as is.
 */
export function sanitizeCastlingRights(fen: string): string {
  const fields = fen.trim().split(/\s+/);
  if (fields.length < 3) return fen;
  const [placement, , castling] = fields;
  if (castling === "-") return fen;

  const possible = possibleCastlingFlags(placement);
  const kept = CASTLING_ORDER.filter((flag) => castling.includes(flag) && possible[flag]).join("");
  const next = kept || "-";
  if (next === castling) return fen;

  fields[2] = next;
  return fields.join(" ");
}

// ── Set-up positions ────────────────────────────────────────────────────────
// A position editor must accept positions chess can't be played from (no
// king, three queens and two kings, a pawn on the eighth rank...). Reading the
// notation and judging the position are kept apart: `readSetupFen` rejects
// only notation that isn't a board, and reports every chess-rule problem in
// `issues` instead.

export type SetupFenRead =
  | { ok: false; error: string }
  | {
      ok: true;
      /** Omitted trailing fields filled in, impossible castling flags dropped; pieces untouched. */
      fen: string;
      /** Why chess can't be played from this position. Empty = it can (as far as these checks go). */
      issues: string[];
    };

const PIECE_LETTER = /^[pnbrqkPNBRQK]$/;

/** 8×8 grid, [0] = rank 8, [0][0] = a8; "" for an empty square. Assumes a well-formed placement. */
function placementGrid(placement: string): string[][] {
  return placement
    .split("/")
    .map((rank) => rank.replace(/[1-8]/g, (n) => ".".repeat(Number(n))).split("").map((c) => (c === "." ? "" : c)));
}

function placementError(placement: string): string | null {
  const ranks = placement.split("/");
  if (ranks.length !== 8) return `the board needs 8 ranks separated by "/", found ${ranks.length}`;
  for (let i = 0; i < 8; i += 1) {
    let squares = 0;
    let previousWasDigit = false;
    for (const ch of ranks[i]) {
      if (/[1-8]/.test(ch)) {
        if (previousWasDigit) return `rank ${8 - i} has two numbers in a row`;
        squares += Number(ch);
        previousWasDigit = true;
      } else if (PIECE_LETTER.test(ch)) {
        squares += 1;
        previousWasDigit = false;
      } else {
        return `"${ch}" on rank ${8 - i} is not a piece letter`;
      }
    }
    if (squares !== 8) return `rank ${8 - i} has ${squares} squares instead of 8`;
  }
  return null;
}

const KNIGHT_STEPS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING_STEPS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const ROOK_RAYS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_RAYS = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Is the square at (row, col) attacked by `by`'s pieces? Rows count down from rank 8. */
function isAttacked(grid: string[][], row: number, col: number, by: "w" | "b"): boolean {
  const own = (letter: string) => (by === "w" ? letter.toUpperCase() : letter);
  const at = (r: number, c: number) => (r >= 0 && r < 8 && c >= 0 && c < 8 ? grid[r][c] : undefined);

  // A white pawn attacks up the board (towards row 0), so it stands one row below.
  const pawnRow = by === "w" ? row + 1 : row - 1;
  if (at(pawnRow, col - 1) === own("p") || at(pawnRow, col + 1) === own("p")) return true;
  if (KNIGHT_STEPS.some(([dr, dc]) => at(row + dr, col + dc) === own("n"))) return true;
  if (KING_STEPS.some(([dr, dc]) => at(row + dr, col + dc) === own("k"))) return true;

  const slides = (rays: number[][], letters: string[]) =>
    rays.some(([dr, dc]) => {
      for (let r = row + dr, c = col + dc; at(r, c) !== undefined; r += dr, c += dc) {
        const piece = at(r, c);
        if (piece) return letters.includes(piece);
      }
      return false;
    });
  return slides(ROOK_RAYS, [own("r"), own("q")]) || slides(BISHOP_RAYS, [own("b"), own("q")]);
}

function setupIssues(placement: string, turn: "w" | "b"): string[] {
  const issues: string[] = [];
  for (const [letter, side] of [["K", "white"], ["k", "black"]] as const) {
    const count = placement.split(letter).length - 1;
    if (count === 0) issues.push(`no ${side} king`);
    else if (count > 1) issues.push(`${count} ${side} kings`);
  }
  const ranks = placement.split("/");
  if (/[pP]/.test(ranks[0] + ranks[7])) issues.push("a pawn on the first or last rank");

  // The side that just moved must not have left its king in check.
  if (!issues.some((issue) => issue.includes("king"))) {
    const grid = placementGrid(placement);
    const waiting = turn === "w" ? "b" : "w";
    const kingLetter = waiting === "w" ? "K" : "k";
    const row = grid.findIndex((rank) => rank.includes(kingLetter));
    if (isAttacked(grid, row, grid[row].indexOf(kingLetter), turn)) {
      issues.push(`${waiting === "w" ? "White" : "Black"} is in check with ${turn === "w" ? "White" : "Black"} to move`);
    }
  }
  return issues;
}

/**
 * Reads any FEN whose fields are well formed, legal position or not. Missing
 * trailing fields default like chess.js does (`w - - 0 1`); a placement alone
 * is enough. Only notation that can't be read as a board is an error.
 */
export function readSetupFen(input: string): SetupFenRead {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { ok: false, error: "the FEN is empty" };
  if (tokens.length > 6) return { ok: false, error: "a FEN has at most 6 fields" };
  const [placement, turn = "w", castling = "-", enPassant = "-", halfMove = "0", fullMove = "1"] = tokens;

  const boardError = placementError(placement);
  if (boardError) return { ok: false, error: boardError };
  if (turn !== "w" && turn !== "b") return { ok: false, error: `side to move must be "w" or "b", not "${turn}"` };
  if (!/^(-|[KQkq]{1,4})$/.test(castling)) return { ok: false, error: `"${castling}" is not a castling field` };
  if (!/^(-|[a-h][36])$/.test(enPassant)) return { ok: false, error: `"${enPassant}" is not an en passant square` };
  if ((enPassant[1] === "3" && turn === "w") || (enPassant[1] === "6" && turn === "b")) {
    return { ok: false, error: `en passant on ${enPassant} does not fit ${turn === "w" ? "White" : "Black"} to move` };
  }
  if (!/^\d+$/.test(halfMove)) return { ok: false, error: "the halfmove clock must be a whole number" };
  if (!/^[1-9]\d*$/.test(fullMove)) return { ok: false, error: "the move number must be 1 or more" };

  const fen = sanitizeCastlingRights([placement, turn, castling, enPassant, halfMove, fullMove].join(" "));
  return { ok: true, fen, issues: setupIssues(placement, turn) };
}

/** Placement with `square` (e.g. "e4") set to `piece` (a FEN letter) or emptied (null). Malformed input is returned as is. */
export function setPlacementSquare(placement: string, square: string, piece: string | null): string {
  if (placementError(placement) !== null) return placement;
  const file = "abcdefgh".indexOf(square[0]);
  const rank = Number(square[1]);
  if (square.length !== 2 || file < 0 || !(rank >= 1 && rank <= 8)) return placement;
  if (piece !== null && !PIECE_LETTER.test(piece)) return placement;

  const ranks = placement.split("/");
  const row = 8 - rank;
  const cells = ranks[row].replace(/[1-8]/g, (n) => ".".repeat(Number(n))).split("");
  cells[file] = piece ?? ".";
  ranks[row] = cells.join("").replace(/\.+/g, (run) => String(run.length));
  return ranks.join("/");
}

/**
 * The position after picking up the piece on `from` and putting it on `to`,
 * chess rules ignored (the coach's "Allow illegal moves" board): whatever
 * stood on `to` is captured — a king included — and a pawn stays a pawn.
 * The other side moves next; castling rights the move breaks are dropped, en
 * passant is cleared, and the move number advances after Black. Null when
 * either square is invalid, `from` is empty, `from === to`, or the FEN's board can't be read.
 */
export function freeMoveFen(fen: string, from: string, to: string): string | null {
  const [placement = "", , castling = "-", , halfMove = "0", fullMove = "1"] = fen.trim().split(/\s+/);
  if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to) || from === to || placementError(placement) !== null) return null;
  const squares = placementSquares(placement);
  const piece = squares.get(from);
  if (!piece) return null;
  const moved = setPlacementSquare(setPlacementSquare(placement, from, null), to, piece);
  if (moved === placement) return null;

  const white = piece === piece.toUpperCase();
  const next = white ? "b" : "w";
  const half = /^\d+$/.test(halfMove) ? Number(halfMove) : 0;
  const full = /^[1-9]\d*$/.test(fullMove) ? Number(fullMove) : 1;
  // A Black move (in turn or not) closes the move pair.
  const nextFull = white ? full : full + 1;
  const captured = squares.get(to);
  const nextHalf = piece.toLowerCase() === "p" || captured ? 0 : half + 1;
  // Replacing a home rook with another rook must not inherit its castling right.
  const nextCastling = CASTLING_ORDER.filter((flag) => {
    const req = CASTLING_REQUIREMENTS[flag];
    return castling.includes(flag) && !(to === req.rook && captured === req.piece.rook);
  }).join("") || "-";
  return sanitizeCastlingRights([moved, next, nextCastling, "-", String(nextHalf), String(nextFull)].join(" "));
}

/**
 * The free move (`freeMoveFen`) from `fromFen` that reaches `toFen`, or null.
 * Lets a receiver check a controlling student's illegal move against its own
 * board and replay it, instead of trusting the FEN the packet carries. Only
 * placement, side to move and castling are compared — the move counters don't
 * make a different position.
 */
export function freeMoveBetween(fromFen: string, toFen: string): { from: string; to: string } | null {
  const before = placementSquares(fromFen.trim().split(/\s+/)[0] ?? "");
  const after = placementSquares(toFen.trim().split(/\s+/)[0] ?? "");
  // One piece moved: its square emptied, and the target now holds it.
  const emptied: string[] = [];
  const filled: string[] = [];
  for (const square of new Set([...before.keys(), ...after.keys()])) {
    const was = before.get(square);
    const now = after.get(square);
    if (was === now) continue;
    if (was && !now) emptied.push(square);
    else if (now) filled.push(square);
  }
  if (emptied.length !== 1 || filled.length !== 1) return null;
  const [from] = emptied;
  const [to] = filled;
  const moved = freeMoveFen(fromFen, from, to);
  const key = (fen: string) => fen.trim().split(/\s+/).slice(0, 3).join(" ");
  return moved && key(moved) === key(sanitizeCastlingRights(toFen.trim())) ? { from, to } : null;
}

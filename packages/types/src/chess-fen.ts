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

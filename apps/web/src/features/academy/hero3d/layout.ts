export type PieceType = "pawn" | "rook" | "bishop" | "queen" | "king";
export type Side = "gold" | "ebony";

export type PieceSpec = {
  /** File and rank, 0..7. */
  f: number;
  r: number;
  scale?: number;
  side: Side;
  type: PieceType;
};

/** The gold knight stands near the centre. */
export const KNIGHT_SQUARE = { f: 4, r: 4 };

/**
 * A staged middlegame. The camera looks along the board's diagonal, so tall
 * pieces stand behind and on the flanks and only pawns stand in front: the
 * knight is never hidden.
 */
export const PIECES: PieceSpec[] = [
  { f: 3, r: 0, side: "ebony", type: "king" },
  { f: 1, r: 3, side: "ebony", type: "queen" },
  { f: 6, r: 1, scale: 0.96, side: "gold", type: "queen" },
  { f: 0, r: 5, side: "ebony", type: "rook" },
  { f: 7, r: 2, side: "gold", type: "rook" },
  { f: 2, r: 6, side: "ebony", type: "bishop" },
  { f: 6, r: 4, side: "gold", type: "bishop" },
  { f: 2, r: 4, side: "ebony", type: "pawn" },
  { f: 4, r: 1, side: "ebony", type: "pawn" },
  { f: 0, r: 2, side: "ebony", type: "pawn" },
  { f: 1, r: 6, side: "ebony", type: "pawn" },
  { f: 5, r: 2, side: "gold", type: "pawn" },
  { f: 3, r: 7, side: "gold", type: "pawn" },
  { f: 7, r: 5, side: "gold", type: "pawn" }
];

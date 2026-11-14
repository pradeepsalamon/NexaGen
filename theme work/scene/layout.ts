export type PieceType = 'pawn' | 'rook' | 'bishop' | 'queen' | 'king'
export type Side = 'gold' | 'dark'

export interface PieceSpec {
  type: PieceType
  side: Side
  /** file / rank index, 0..7 */
  f: number
  r: number
  yaw?: number
  scale?: number
}

/** Hero knight sits on the centre of the board. */
export const KNIGHT_SQUARE = { f: 4, r: 4 }

/**
 * A staged middlegame. The camera looks along the (-1,-1) diagonal, so tall pieces sit
 * behind and to the flanks while only low pawns sit in front — the gold knight stays unobstructed.
 */
export const PIECES: PieceSpec[] = [
  // back line — tall
  { type: 'king', side: 'dark', f: 3, r: 0 },
  { type: 'queen', side: 'dark', f: 1, r: 3 },
  { type: 'queen', side: 'gold', f: 6, r: 1, scale: 0.96 },
  // flanks
  { type: 'rook', side: 'dark', f: 0, r: 5 },
  { type: 'rook', side: 'gold', f: 7, r: 2 },
  { type: 'bishop', side: 'dark', f: 2, r: 6 },
  { type: 'bishop', side: 'gold', f: 6, r: 4 },
  // pawns
  { type: 'pawn', side: 'dark', f: 2, r: 4 },
  { type: 'pawn', side: 'dark', f: 4, r: 1 },
  { type: 'pawn', side: 'dark', f: 0, r: 2 },
  { type: 'pawn', side: 'dark', f: 1, r: 6 },
  { type: 'pawn', side: 'gold', f: 5, r: 2 },
  { type: 'pawn', side: 'gold', f: 3, r: 7 },
  { type: 'pawn', side: 'gold', f: 7, r: 5 },
]

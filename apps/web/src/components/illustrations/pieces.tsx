/**
 * Original NexaChess piece silhouettes for illustrations (not the board's piece
 * sets — those come from `features/chess-appearance`). Every shape is drawn in a
 * 64×64 box standing on a base at y 49–56, so pieces line up when composed.
 *
 * Colour comes from the caller's `className` (`fill-primary`, `fill-accent` …),
 * so the artwork follows the theme tokens and never holds a literal colour.
 */

export type PieceShape = "king" | "knight" | "pawn" | "queen" | "rook";

const BASE = "M15 49H49a2 2 0 0 1 2 2v5H13v-5a2 2 0 0 1 2-2Z";

export const PIECE_PATHS: Record<PieceShape, string> = {
  king:
    "M30 3h4v4h4v4h-4v3.3C39.5 15 43 18 43 22c0 1.6-.5 3-1.4 4H22.4c-.9-1-1.4-2.4-1.4-4 0-4 3.5-7 9-7.7V11h-4V7h4Z" +
    "M22 27.5h20v3H22ZM24.5 32h15l3.5 14H21ZM19 46.5h26V49H19Z" +
    BASE,
  knight:
    "M22 46c0-8 4-12.5 9-16.5-4 1-8 3-11.5 5-3.5 1.6-7.5-1-6.5-5 1-4 8-10 11-15l-1-7 5.5 4C40 11 48 20 48 32c0 6-2 10-4 14Z" +
    BASE,
  pawn: "M32 7a9 9 0 0 1 6.2 15.5H42v4h-4.4l4 19.5H22.4l4-19.5H22v-4h3.8A9 9 0 0 1 32 7Z" + BASE,
  queen:
    "M14 17l7 19 2.5-21 5 19L32 12l3.5 22 5-19 2.5 21 7-19-5 27H19Z" +
    "M19 44h26v5H19Z" +
    BASE,
  rook: "M18 8h7v6h4V8h6v6h4V8h7v12l-4 4v18l4 4H18l4-4V24l-4-4Z" + BASE
};

/** Crown jewels for the queen, drawn over its points. */
export const QUEEN_JEWELS: readonly [number, number][] = [
  [14, 16],
  [23.5, 14],
  [32, 11],
  [40.5, 14],
  [50, 16]
];

type PieceProps = {
  className?: string;
  /** Size and position inside the parent SVG, in the parent's units. */
  height: number;
  shape: PieceShape;
  /** Outline width in the piece's 64-unit box; colour from a `stroke-*` class in `className`. */
  strokeWidth?: number;
  width: number;
  x: number;
  y: number;
};

/** One piece placed inside a parent `<svg>`; colour from `className`. */
export function Piece({ className, height, shape, strokeWidth, width, x, y }: PieceProps) {
  return (
    <svg height={height} viewBox="0 0 64 64" width={width} x={x} y={y}>
      <path className={className} d={PIECE_PATHS[shape]} fillRule="evenodd" strokeLinejoin="round" strokeWidth={strokeWidth} />
      {shape === "queen"
        ? QUEEN_JEWELS.map(([cx, cy]) => <circle className={className} cx={cx} cy={cy} key={cx} r={3} strokeWidth={strokeWidth} />)
        : null}
      {shape === "knight" ? <circle className="fill-app-surface" cx={31} cy={19} r={1.8} /> : null}
    </svg>
  );
}

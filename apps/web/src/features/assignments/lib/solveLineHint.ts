import type { SolveLineHint } from "@nexa-chess/types";

const PIECE_NAMES: Record<string, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king"
};

/** The words for a server SOLVE_LINE hint — shared by assignments and puzzles. */
export function hintText(h: SolveLineHint): string {
  if (h.lineComplete) return "You've already played the whole line.";
  if (!h.onTrack) return "Your line has drifted — take back to your last correct move, then ask again.";
  const piece = PIECE_NAMES[h.pieceType ?? "p"] ?? "piece";
  if (h.level >= 3 && h.san) return `Play ${h.san}.`;
  if (h.level >= 2 && h.fromSquare) return `Move your ${piece} on ${h.fromSquare}.`;
  return `Look for a ${piece} move.`;
}

/** `PracticeBoard`'s `hintSquares` for a hint: the origin from level 2, the arrow at 3. */
export function hintSquaresFor(h: SolveLineHint | null): { from: string; to: string | null } | null {
  return h && h.onTrack && !h.lineComplete && h.fromSquare ? { from: h.fromSquare, to: h.toSquare } : null;
}

// Turns moves printed next to a diagram into a suggested solution line. Only the
// part that is legal from the confirmed position counts, and the coach still sees
// and can change it in the puzzle form.

import { parsePrintedMoves, type SolutionMove } from "@nexa-chess/types";
import { Chess } from "@/lib/chess";

const MAX_MOVES = 40;

export function suggestSolutionLine(fen: string, printedText: string): SolutionMove[] {
  let best: SolutionMove[] = [];
  for (const run of parsePrintedMoves(printedText)) {
    let chess: Chess;
    try {
      chess = new Chess(fen);
    } catch {
      return [];
    }
    const line: SolutionMove[] = [];
    for (const san of run.slice(0, MAX_MOVES)) {
      try {
        const move = chess.move(san);
        line.push({ san: move.san, uci: `${move.from}${move.to}${move.promotion ?? ""}` });
      } catch {
        break;
      }
    }
    if (line.length > best.length) best = line;
  }
  return best;
}

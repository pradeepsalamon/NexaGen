import type { AttemptMove, SolutionMove } from "@nexa-chess/types";
import { Chess } from "chess.js";

export type SolverColor = "white" | "black";

export type SolverOutcome =
  | { kind: "ignored" }
  | { kind: "wrong" }
  | { kind: "progress"; studentMove: AttemptMove; autoReply: AttemptMove | null }
  | { kind: "solved"; studentMove: AttemptMove; autoReply: AttemptMove | null };

export function sideToMove(fen: string): SolverColor {
  try {
    return new Chess(fen).turn() === "w" ? "white" : "black";
  } catch {
    return "white";
  }
}

/** Replay a list of UCI moves from `startFen`; returns the resulting FEN. */
export function replayLine(startFen: string, ucis: string[]): string {
  const chess = new Chess(startFen);
  for (const uci of ucis) {
    try {
      chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.slice(4) || undefined
      });
    } catch {
      break;
    }
  }
  return chess.fen();
}

function playUci(chess: Chess, uci: string, ply: number): AttemptMove {
  const res = chess.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.slice(4) || undefined
  });
  return {
    ply,
    uci: `${res.from}${res.to}${res.promotion ?? ""}`,
    san: res.san,
    fenAfter: chess.fen()
  };
}

/**
 * Fully client-side SOLVE_LINE runner for the puzzle preview + practice board.
 * Mirrors the server's `solveLineFeedback`: the student plays their side, forced
 * opponent replies auto-play, a wrong move is rejected.
 */
export function applyStudentMove(
  startFen: string,
  solution: SolutionMove[],
  moves: AttemptMove[],
  uci: string,
  studentColor: SolverColor
): SolverOutcome {
  const index = moves.length;
  const expected = solution[index]?.uci?.toLowerCase();
  if (!expected) return { kind: "ignored" };
  if (uci.toLowerCase() !== expected) return { kind: "wrong" };

  const chess = new Chess(replayLine(startFen, moves.map((m) => m.uci)));
  const studentMove = playUci(chess, uci, index + 1);

  if (index + 1 >= solution.length) {
    return { kind: "solved", studentMove, autoReply: null };
  }

  let autoReply: AttemptMove | null = null;
  const nextSolutionMove = solution[index + 1];
  const turnColor: SolverColor = chess.turn() === "w" ? "white" : "black";
  if (nextSolutionMove && turnColor !== studentColor) {
    autoReply = playUci(chess, nextSolutionMove.uci, index + 2);
  }

  const solved = autoReply !== null && index + 2 >= solution.length;
  return { kind: solved ? "solved" : "progress", studentMove, autoReply };
}

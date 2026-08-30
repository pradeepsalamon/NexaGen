import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import type {
  AttemptMove,
  AttemptReviewMove,
  ChessColor,
  SolutionMove,
  SolveLineMoveFeedback
} from "@nexa-chess/types";
import { Chess } from "chess.js";
import { StockfishService } from "../stockfish/stockfish.service";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

export function normalizeUci(uci: string): string {
  return uci.trim().toLowerCase();
}

/** Validate a starting FEN, returning a canonical FEN. Falls back to the start. */
export function assertValidFen(fen: string | null | undefined): string {
  const value = (fen ?? "").trim() || START_FEN;
  try {
    return new Chess(value).fen();
  } catch {
    throw new BadRequestException("The starting position is not a valid FEN.");
  }
}

function applyUci(chess: Chess, uci: string) {
  const u = normalizeUci(uci);
  return chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.slice(4) || undefined });
}

function colorChar(color: ChessColor): "w" | "b" {
  return color === "white" ? "w" : "b";
}

export type SolveLineEvaluation = {
  scorePercent: number;
  accuracyPercent: number;
  solved: boolean;
  correctStudentPlies: number;
  totalStudentPlies: number;
  attemptedStudentPlies: number;
  review: AttemptReviewMove[];
};

export type EngineGameEvaluation = {
  scorePercent: number;
  result: "WIN" | "LOSS" | "DRAW";
  finished: boolean;
};

@Injectable()
export class AssignmentEvaluationService {
  private readonly logger = new Logger(AssignmentEvaluationService.name);

  constructor(private readonly stockfish: StockfishService) {}

  isEngineAvailable(): boolean {
    return this.stockfish.isAvailable();
  }

  /**
   * Replay `moves` (UCI) from `startFen`, rebuilding SAN and validating every
   * move. Throws on the first illegal move. This is the canonical form stored in
   * `Assignment.solutionMovesJson`.
   */
  normalizeSolution(startFen: string, moves: SolutionMove[]): SolutionMove[] {
    const chess = new Chess(assertValidFen(startFen));
    const out: SolutionMove[] = [];
    for (const [i, m] of moves.entries()) {
      const res = (() => {
        try {
          return applyUci(chess, m.uci);
        } catch {
          return null;
        }
      })();
      if (!res) {
        throw new BadRequestException(
          `Solution move ${i + 1} (${m.san || m.uci}) is not legal from this position.`
        );
      }
      out.push({ uci: `${res.from}${res.to}${res.promotion ?? ""}`, san: res.san });
    }
    return out;
  }

  /** Build a readable PGN (with FEN header) for a solution line — used for download. */
  buildLinePgn(startFen: string, moves: SolutionMove[]): string {
    const chess = new Chess(assertValidFen(startFen));
    for (const m of moves) {
      try {
        applyUci(chess, m.uci);
      } catch {
        break;
      }
    }
    return chess.pgn();
  }

  /** A minimal PGN carrying only the setup position (PLAY_VS_ENGINE / FREE_ANALYSIS). */
  positionPgn(startFen: string): string {
    return new Chess(assertValidFen(startFen)).pgn();
  }

  /** Longest prefix of `studentMoves` that matches `solution` move-for-move (by UCI). */
  private matchedPrefix(solution: SolutionMove[], studentMoves: AttemptMove[]): number {
    let k = 0;
    while (
      k < solution.length &&
      k < studentMoves.length &&
      normalizeUci(studentMoves[k].uci) === normalizeUci(solution[k].uci)
    ) {
      k += 1;
    }
    return k;
  }

  /** Indices of `solution` where it is the student's turn to move. */
  private studentPlyIndices(startFen: string, solution: SolutionMove[], student: ChessColor): number[] {
    const probe = new Chess(assertValidFen(startFen));
    const want = colorChar(student);
    const indices: number[] = [];
    for (let i = 0; i < solution.length; i += 1) {
      if (probe.turn() === want) indices.push(i);
      try {
        applyUci(probe, solution[i].uci);
      } catch {
        break;
      }
    }
    return indices;
  }

  evaluateSolveLine(
    startFen: string,
    solution: SolutionMove[],
    studentMoves: AttemptMove[],
    student: ChessColor
  ): SolveLineEvaluation {
    const fen = assertValidFen(startFen);
    const studentIdx = this.studentPlyIndices(fen, solution, student);
    const totalStudentPlies = studentIdx.length;
    const prefix = this.matchedPrefix(solution, studentMoves);

    const correctStudentPlies = studentIdx.filter((i) => i < prefix).length;
    const attemptedStudentPlies = studentIdx.filter((i) => i < studentMoves.length).length;

    const review: AttemptReviewMove[] = [];
    const replay = new Chess(fen);
    for (let i = 0; i < solution.length; i += 1) {
      const fenBefore = replay.fen();
      if (studentIdx.includes(i)) {
        const played = studentMoves[i];
        review.push({
          ply: i + 1,
          fenBefore,
          yourMove: played ? played.san : null,
          expectedMove: solution[i].san,
          correct: played ? i < prefix : null
        });
      }
      try {
        applyUci(replay, solution[i].uci);
      } catch {
        break;
      }
    }

    const scorePercent =
      totalStudentPlies === 0 ? 0 : Math.round((correctStudentPlies / totalStudentPlies) * 100);
    const accuracyPercent =
      attemptedStudentPlies === 0
        ? 0
        : Math.round((correctStudentPlies / attemptedStudentPlies) * 100);

    return {
      scorePercent,
      accuracyPercent,
      solved: prefix === solution.length && solution.length > 0,
      correctStudentPlies,
      totalStudentPlies,
      attemptedStudentPlies,
      review
    };
  }

  /**
   * Per-move feedback while a SOLVE_LINE attempt is in progress. `studentMoves`
   * is the full move list played so far (student moves + revealed replies).
   */
  solveLineFeedback(
    startFen: string,
    solution: SolutionMove[],
    studentMoves: AttemptMove[],
    student: ChessColor
  ): SolveLineMoveFeedback {
    const fen = assertValidFen(startFen);
    const prefix = this.matchedPrefix(solution, studentMoves);
    const allMatch = prefix === studentMoves.length;
    const ply = studentMoves.length;

    let opponentReply: SolveLineMoveFeedback["opponentReply"] = null;
    let lineComplete = prefix === solution.length && solution.length > 0;

    if (allMatch && !lineComplete && studentMoves.length < solution.length) {
      const replay = new Chess(fen);
      for (let i = 0; i < studentMoves.length; i += 1) {
        try {
          applyUci(replay, solution[i].uci);
        } catch {
          break;
        }
      }
      // Only auto-reveal the next move when it is the opponent's (forced) reply.
      if (replay.turn() !== colorChar(student)) {
        try {
          const res = applyUci(replay, solution[studentMoves.length].uci);
          opponentReply = {
            uci: `${res.from}${res.to}${res.promotion ?? ""}`,
            san: res.san,
            fenAfter: replay.fen()
          };
          lineComplete = studentMoves.length + 1 === solution.length;
        } catch {
          opponentReply = null;
        }
      }
    }

    return { ply, correct: allMatch, opponentReply, lineComplete };
  }

  /**
   * Score a finished game against the engine purely from the board outcome.
   * Accuracy (centipawn-loss based) is intentionally not computed here — see
   * the assignment docs for the current limitation.
   */
  evaluateEngineGame(
    startFen: string,
    student: ChessColor,
    studentMoves: AttemptMove[],
    resign: boolean
  ): EngineGameEvaluation {
    const board = new Chess(assertValidFen(startFen));
    for (const m of studentMoves) {
      try {
        applyUci(board, m.uci);
      } catch {
        break;
      }
    }

    if (resign) return { scorePercent: 0, result: "LOSS", finished: true };

    if (board.isCheckmate()) {
      const loser = board.turn();
      return loser === colorChar(student)
        ? { scorePercent: 0, result: "LOSS", finished: true }
        : { scorePercent: 100, result: "WIN", finished: true };
    }

    if (board.isStalemate() || board.isDraw() || board.isInsufficientMaterial()) {
      return { scorePercent: 50, result: "DRAW", finished: true };
    }

    return { scorePercent: 0, result: "LOSS", finished: false };
  }

  /** The forced/best engine reply for a PLAY_VS_ENGINE position. */
  async engineReply(
    fen: string,
    engineLevel: number | null
  ): Promise<{ available: boolean; gameOver: boolean; uci: string | null; san: string | null; fenAfter: string | null }> {
    const board = (() => {
      try {
        return new Chess(fen);
      } catch {
        throw new BadRequestException("The current position is not a valid FEN.");
      }
    })();

    if (board.isGameOver()) {
      return { available: true, gameOver: true, uci: null, san: null, fenAfter: null };
    }

    if (!this.stockfish.isAvailable()) {
      return { available: false, gameOver: false, uci: null, san: null, fenAfter: null };
    }

    try {
      const best = await this.stockfish.getBestMove(fen, {
        skillLevel: engineLevel ?? undefined,
        movetimeMs: 400
      });
      if (!best) {
        return { available: true, gameOver: board.isGameOver(), uci: null, san: null, fenAfter: null };
      }
      const res = applyUci(board, best.uci);
      return {
        available: true,
        gameOver: board.isGameOver(),
        uci: `${res.from}${res.to}${res.promotion ?? ""}`,
        san: res.san,
        fenAfter: board.fen()
      };
    } catch (error) {
      this.logger.warn(`Engine reply failed: ${(error as Error).message}`);
      return { available: false, gameOver: false, uci: null, san: null, fenAfter: null };
    }
  }

  /** Validate that a student's attempt move list is legal from `startFen`. */
  assertLegalLine(startFen: string, moves: AttemptMove[]): void {
    const board = new Chess(assertValidFen(startFen));
    for (const [i, m] of moves.entries()) {
      try {
        const res = applyUci(board, m.uci);
        if (!res) throw new Error("illegal");
      } catch {
        throw new BadRequestException(`Move ${i + 1} (${m.san || m.uci}) is not legal.`);
      }
    }
  }
}

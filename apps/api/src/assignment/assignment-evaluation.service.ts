import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import type {
  AttemptMove,
  AttemptReviewMove,
  ChessColor,
  SolutionMove,
  SolveLineHint,
  SolveLineMoveFeedback,
  StockfishAnalysisResult
} from "@nexa-chess/types";
import { Chess, type Square } from "chess.js";
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

export function applyUci(chess: Chess, uci: string) {
  const u = normalizeUci(uci);
  return chess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u.slice(4) || undefined });
}

function colorChar(color: ChessColor): "w" | "b" {
  return color === "white" ? "w" : "b";
}

/**
 * The ONLY place mate-equivalence is decided ("any mate wins"). A move off the
 * book line still completes it when, at a student ply, it is legal and mates,
 * and the book line itself ends in mate — so a line that doesn't end in mate is
 * never reinterpreted. Mirrored on the client in `puzzleSolverEngine.ts`; both
 * run `SOLVE_LINE_MATE_FIXTURES`.
 */
export function isAcceptedMateAlternative(
  startFen: string,
  solution: SolutionMove[],
  playedBefore: AttemptMove[],
  candidate: AttemptMove,
  studentColor: ChessColor
): boolean {
  if (playedBefore.length >= solution.length) return false;

  const position = new Chess(startFen);
  try {
    for (const m of playedBefore) applyUci(position, m.uci);
  } catch {
    return false;
  }
  if (position.turn() !== colorChar(studentColor)) return false;

  try {
    applyUci(position, candidate.uci);
  } catch {
    return false;
  }
  if (!position.isCheckmate()) return false;

  const book = new Chess(startFen);
  try {
    for (const m of solution) applyUci(book, m.uci);
  } catch {
    return false;
  }
  return book.isCheckmate();
}

/** Win probability (0-100) for the side to move, from a centipawn score. */
export function cpToWinPercent(cp: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** Lichess-style per-move accuracy from the mover's win% before/after a move. */
export function moveAccuracy(winBefore: number, winAfter: number): number {
  const raw = 103.1668 * Math.exp(-0.04354 * (winBefore - winAfter)) - 3.1669;
  return Math.max(0, Math.min(100, raw));
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

  /** Cap on student moves analysed for accuracy — bounds the submit latency. */
  private static readonly ACCURACY_MOVE_CAP = 40;
  private static readonly ACCURACY_MOVETIME_MS = 200;

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

  /**
   * How far `studentMoves` follows `solution`: `prefix` counts the moves that
   * match by UCI, plus a mating alternative at the first mismatch (see
   * `isAcceptedMateAlternative`), which also makes the line `complete`.
   */
  private matchSolveLine(
    fen: string,
    solution: SolutionMove[],
    studentMoves: AttemptMove[],
    student: ChessColor
  ): { prefix: number; complete: boolean; byMate: boolean } {
    let k = 0;
    while (
      k < solution.length &&
      k < studentMoves.length &&
      normalizeUci(studentMoves[k].uci) === normalizeUci(solution[k].uci)
    ) {
      k += 1;
    }
    if (
      k < solution.length &&
      k < studentMoves.length &&
      isAcceptedMateAlternative(fen, solution, studentMoves.slice(0, k), studentMoves[k], student)
    ) {
      return { prefix: k + 1, complete: true, byMate: true };
    }
    return { prefix: k, complete: k === solution.length && solution.length > 0, byMate: false };
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
    const { prefix, complete, byMate } = this.matchSolveLine(fen, solution, studentMoves, student);

    // A mate off the book line ends the game, so the book plies after it are
    // never played: they count as solved and are left out of the review.
    const correctStudentPlies = byMate
      ? totalStudentPlies
      : studentIdx.filter((i) => i < prefix).length;
    const correctAttemptedPlies = studentIdx.filter((i) => i < prefix).length;
    const attemptedStudentPlies = studentIdx.filter((i) => i < studentMoves.length).length;

    const review: AttemptReviewMove[] = [];
    const replay = new Chess(fen);
    for (let i = 0; i < solution.length; i += 1) {
      if (byMate && i >= prefix) break;
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
        : Math.round((correctAttemptedPlies / attemptedStudentPlies) * 100);

    return {
      scorePercent,
      accuracyPercent,
      solved: complete,
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
    const { prefix, complete } = this.matchSolveLine(fen, solution, studentMoves, student);
    const allMatch = prefix === studentMoves.length;
    const ply = studentMoves.length;

    let opponentReply: SolveLineMoveFeedback["opponentReply"] = null;
    let lineComplete = complete;

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
   * Progressive hint for the next student move of a SOLVE_LINE attempt. The
   * caller supplies the moves played so far; the reply escalates with `level`
   * (1 = which piece, 2 = origin square, 3 = the full move). `hintsUsed` is
   * filled in by the attempt service.
   */
  solveLineHint(
    startFen: string,
    solution: SolutionMove[],
    studentMoves: AttemptMove[],
    student: ChessColor,
    level: number
  ): Omit<SolveLineHint, "hintsUsed"> {
    const fen = assertValidFen(startFen);
    const { prefix, complete } = this.matchSolveLine(fen, solution, studentMoves, student);
    const onTrack = prefix === studentMoves.length;
    const lineComplete = studentMoves.length >= solution.length || complete;

    const blank = {
      level: 1 as const,
      pieceType: null,
      fromSquare: null,
      toSquare: null,
      san: null,
      uci: null
    };
    if (!onTrack) return { ...blank, onTrack: false, lineComplete };
    if (lineComplete) return { ...blank, onTrack: true, lineComplete: true };

    const replay = new Chess(fen);
    for (let i = 0; i < studentMoves.length; i += 1) {
      try {
        applyUci(replay, solution[i].uci);
      } catch {
        break;
      }
    }

    const next = solution[studentMoves.length];
    const uci = normalizeUci(next.uci);
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const piece = replay.get(from as Square);
    const capped = Math.max(1, Math.min(3, Math.round(level))) as 1 | 2 | 3;

    return {
      level: capped,
      onTrack: true,
      lineComplete: false,
      pieceType: piece ? piece.type : null,
      fromSquare: capped >= 2 ? from : null,
      toSquare: capped >= 3 ? to : null,
      san: capped >= 3 ? next.san : null,
      uci: capped >= 3 ? uci : null
    };
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

  private analysisToCp(a: StockfishAnalysisResult): number {
    if (a.mate !== null) return a.mate > 0 ? 100_000 : -100_000;
    if (a.evaluation !== null) return Math.round(a.evaluation * 100);
    return 0;
  }

  /**
   * Move-accuracy (0-100) for a finished PLAY_VS_ENGINE game, from per-move
   * Stockfish analysis. Returns `null` when the engine pool is down or analysis
   * fails — callers then fall back to a result-only score. Bounded to the first
   * `ACCURACY_MOVE_CAP` student moves at a short movetime.
   */
  async engineGameAccuracy(
    startFen: string,
    student: ChessColor,
    studentMoves: AttemptMove[]
  ): Promise<number | null> {
    if (!this.stockfish.isAvailable()) return null;

    const studentChar = colorChar(student);
    const board = new Chess(assertValidFen(startFen));
    const jobs: { fenBefore: string; fenAfter: string }[] = [];

    for (const m of studentMoves) {
      const fenBefore = board.fen();
      const isStudentMove = board.turn() === studentChar;
      let applied: ReturnType<typeof applyUci> | null;
      try {
        applied = applyUci(board, m.uci);
      } catch {
        break;
      }
      if (!applied) break;
      if (isStudentMove && jobs.length < AssignmentEvaluationService.ACCURACY_MOVE_CAP) {
        jobs.push({ fenBefore, fenAfter: board.fen() });
      }
    }

    if (jobs.length === 0) return null;

    try {
      const fens = [...new Set(jobs.flatMap((j) => [j.fenBefore, j.fenAfter]))];
      const analysed = new Map<string, StockfishAnalysisResult>();
      await Promise.all(
        fens.map(async (fen) => {
          analysed.set(
            fen,
            await this.stockfish.analyzePosition(fen, {
              movetimeMs: AssignmentEvaluationService.ACCURACY_MOVETIME_MS
            })
          );
        })
      );

      const perMove = jobs.map((j) => {
        const before = analysed.get(j.fenBefore);
        const after = analysed.get(j.fenAfter);
        if (!before || !after) return 100;
        // `before` is scored from the student's perspective (student to move);
        // `after` is from the opponent's — negate to keep the student's view.
        const winBefore = cpToWinPercent(this.analysisToCp(before));
        const winAfter = cpToWinPercent(-this.analysisToCp(after));
        return moveAccuracy(winBefore, winAfter);
      });

      return Math.round(perMove.reduce((a, b) => a + b, 0) / perMove.length);
    } catch (error) {
      this.logger.warn(`Engine accuracy analysis failed: ${(error as Error).message}`);
      return null;
    }
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

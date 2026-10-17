"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { AttemptMove, SolutionMove } from "@nexa-chess/types";
import { Chess } from "@/lib/chess";
import { CheckCircle2, Lightbulb, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  PRACTICE_BOARD_GRID, PracticeBoard,
  type PracticeBoardMove
} from "@/features/chessboard/components/board/PracticeBoard";
import {
  applyStudentMove,
  replayLine,
  sideToMove,
  type SolverColor
} from "./puzzleSolverEngine";

export interface PuzzleSolverProps {
  fen: string;
  orientation?: SolverColor;
  solutionMoves: SolutionMove[];
  hints?: string[];
  explanation?: string | null;
  /** Fired once when the line is completed (or given up). */
  onComplete?: (result: {
    moves: AttemptMove[];
    solved: boolean;
    durationSeconds: number;
    hintsUsed: number;
  }) => void;
  /** Hide the built-in "Give up / show solution" button (e.g. graded attempts). */
  hideRevealButton?: boolean;
}

export function PuzzleSolver({
  fen,
  orientation,
  solutionMoves,
  hints = [],
  explanation,
  onComplete,
  hideRevealButton = false
}: PuzzleSolverProps) {
  const studentColor = useMemo(() => sideToMove(fen), [fen]);
  const boardOrientation = orientation ?? studentColor;

  const [moves, setMoves] = useState<AttemptMove[]>([]);
  const [phase, setPhase] = useState<"solving" | "solved" | "failed">("solving");
  const [feedback, setFeedback] = useState<"none" | "wrong">("none");
  const [resetNonce, setResetNonce] = useState(0);
  const [revealedHints, setRevealedHints] = useState(0);
  const startedAtRef = useRef(Date.now());
  const completedRef = useRef(false);

  const currentFen = useMemo(
    () => replayLine(fen, moves.map((m) => m.uci)),
    [fen, moves]
  );

  const finish = useCallback(
    (finalMoves: AttemptMove[], solved: boolean) => {
      if (completedRef.current) return;
      completedRef.current = true;
      setPhase(solved ? "solved" : "failed");
      onComplete?.({
        moves: finalMoves,
        solved,
        durationSeconds: Math.round((Date.now() - startedAtRef.current) / 1000),
        hintsUsed: revealedHints
      });
    },
    [onComplete, revealedHints]
  );

  const handleMove = useCallback(
    (pmv: PracticeBoardMove) => {
      if (phase !== "solving") return;
      const outcome = applyStudentMove(fen, solutionMoves, moves, pmv.uci, studentColor);

      if (outcome.kind === "ignored") return;
      if (outcome.kind === "wrong") {
        setFeedback("wrong");
        setResetNonce((n) => n + 1);
        window.setTimeout(() => setFeedback("none"), 900);
        return;
      }

      setFeedback("none");
      const next = outcome.autoReply
        ? [...moves, outcome.studentMove, outcome.autoReply]
        : [...moves, outcome.studentMove];
      setMoves(next);
      if (outcome.kind === "solved") finish(next, true);
    },
    [phase, fen, solutionMoves, moves, studentColor, finish]
  );

  const reveal = () => {
    const chess = new Chess(fen);
    const full: AttemptMove[] = [];
    solutionMoves.forEach((m, i) => {
      try {
        const res = chess.move({
          from: m.uci.slice(0, 2),
          to: m.uci.slice(2, 4),
          promotion: m.uci.slice(4) || undefined
        });
        full.push({ ply: i + 1, uci: m.uci, san: res.san, fenAfter: chess.fen() });
      } catch {
        /* stop at first illegal */
      }
    });
    setMoves(full);
    finish(full, false);
  };

  const restart = () => {
    completedRef.current = false;
    startedAtRef.current = Date.now();
    setMoves([]);
    setPhase("solving");
    setFeedback("none");
    setRevealedHints(0);
    setResetNonce((n) => n + 1);
  };

  const solved = phase === "solved";
  const failed = phase === "failed";

  return (
    <div className={PRACTICE_BOARD_GRID}>
      <div>
        <PracticeBoard
          resetKey={`${moves.length}-${resetNonce}`}
          fen={currentFen}
          orientation={boardOrientation}
          playerColor={studentColor}
          interactive={phase === "solving"}
          lastMove={
            moves.length
              ? [moves[moves.length - 1].uci.slice(0, 2), moves[moves.length - 1].uci.slice(2, 4)]
              : null
          }
          onMove={handleMove}
        />
        <p className="mt-2 text-sm font-semibold text-app-text">
          {phase === "solving"
            ? `${studentColor === "white" ? "White" : "Black"} to move`
            : solved
              ? "Solved!"
              : "Solution shown"}
        </p>
      </div>

      <div className="space-y-4">
        {feedback === "wrong" && (
          <Card className="flex items-center gap-2 border-app-danger/40 p-3 text-sm text-app-danger-ink">
            <XCircle className="size-4 shrink-0" strokeWidth={2.5} />
            Not the move — try again.
          </Card>
        )}

        {solved && (
          <Card className="flex items-start gap-2 border-accent/40 bg-accent/10 p-3 text-sm text-accent-ink">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} />
            <span>
              Correct — you found the whole line.
              {explanation ? <span className="mt-1 block text-app-text">{explanation}</span> : null}
            </span>
          </Card>
        )}

        {failed && explanation && (
          <Card className="p-3 text-sm text-app-text">{explanation}</Card>
        )}

        <div>
          <p className="mb-1 text-xs font-semibold text-app-muted">
            Moves played
          </p>
          {moves.length === 0 ? (
            <p className="text-sm text-app-muted">No moves yet.</p>
          ) : (
            <ol className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
              {moves.map((m, i) => (
                <li key={i} className="flex items-center gap-1">
                  {i % 2 === 0 && (
                    <span className="text-app-muted">{Math.floor(i / 2) + 1}.</span>
                  )}
                  <span className="font-medium text-app-text">{m.san}</span>
                </li>
              ))}
            </ol>
          )}
        </div>

        {hints.length > 0 && phase === "solving" && (
          <div className="space-y-2">
            {hints.slice(0, revealedHints).map((hint, i) => (
              <Card key={i} className="p-3 text-sm text-app-text">
                <span className="font-semibold text-app-muted">Hint {i + 1}: </span>
                {hint}
              </Card>
            ))}
            {revealedHints < hints.length && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRevealedHints((n) => n + 1)}
              >
                <Lightbulb className="mr-1.5 size-4" strokeWidth={2.5} />
                Show a hint
              </Button>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {phase === "solving" && !hideRevealButton && solutionMoves.length > 0 && (
            <Button type="button" variant="outline" size="sm" onClick={reveal}>
              Give up &amp; show solution
            </Button>
          )}
          {phase !== "solving" && (
            <Button type="button" variant="outline" size="sm" onClick={restart}>
              <RotateCcw className="mr-1.5 size-4" strokeWidth={2.5} />
              Try again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

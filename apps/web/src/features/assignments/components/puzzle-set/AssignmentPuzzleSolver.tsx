"use client";

import { useCallback, useEffect, useRef } from "react";
import type { PuzzleAttemptResultResponse } from "@nexa-chess/types";
import { ArrowRight, CheckCircle2, Lightbulb, RotateCcw, XCircle } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { PRACTICE_BOARD_GRID, PracticeBoard } from "@/features/chessboard/components/board/PracticeBoard";
import { usePuzzleAttempt } from "@/features/puzzles/hooks/usePuzzleAttempt";
import { hintSquaresFor, hintText } from "../../lib/solveLineHint";
import { startAssignmentPuzzleAttempt } from "../../api/assignmentApi";

/**
 * One puzzle of a set, solved through the ordinary server-scored puzzle attempt
 * (`usePuzzleAttempt`), started via the assignment's own route so the set's
 * tries / hints rules apply. Every move is saved as it is played, so leaving
 * mid-puzzle and coming back resumes the same attempt.
 */
export function AssignmentPuzzleSolver({
  assignmentId,
  puzzleId,
  triesLeft,
  hasNext,
  onStarted,
  onFinished,
  onNext
}: {
  assignmentId: string;
  puzzleId: string;
  /** Tries left as the server counts them (an open attempt is already a used try); null = unlimited. */
  triesLeft: number | null;
  hasNext: boolean;
  onStarted: () => void;
  onFinished: (result: PuzzleAttemptResultResponse) => void;
  onNext: () => void;
}) {
  const start = useCallback(
    () => startAssignmentPuzzleAttempt(assignmentId, puzzleId),
    [assignmentId, puzzleId]
  );
  const {
    session,
    startError,
    moves,
    phase,
    wrong,
    wrongMoves,
    resetNonce,
    result,
    currentFen,
    begin,
    handleMove,
    pendingSubmit,
    retrySubmit,
    giveUp,
    serverHint,
    requestHint
  } = usePuzzleAttempt({ start });

  // Tell the page when an attempt opened and when one finished, once each.
  const startedFor = useRef<string | null>(null);
  useEffect(() => {
    const id = session?.attempt.id;
    if (id && startedFor.current !== id) {
      startedFor.current = id;
      onStarted();
    }
  }, [session, onStarted]);
  const reported = useRef<string | null>(null);
  useEffect(() => {
    if (result && reported.current !== result.attempt.id) {
      reported.current = result.attempt.id;
      onFinished(result);
    }
  }, [result, onFinished]);

  if (startError) {
    return <WidgetError message={startError} onRetry={() => void begin()} />;
  }
  if (!session || !currentFen) {
    return <Skeleton className="aspect-square w-full max-w-[440px]" />;
  }

  const triesAfter = triesLeft;
  const solutionShown = !!result && result.solutionMoves.length > 0;

  return (
    <div className={PRACTICE_BOARD_GRID}>
      <div className="min-w-0">
        <PracticeBoard
          resetKey={`${moves.length}-${resetNonce}`}
          fen={currentFen}
          orientation={session.orientation}
          playerColor={session.studentColor}
          interactive={phase === "solving"}
          lastMove={
            moves.length
              ? [moves[moves.length - 1].uci.slice(0, 2), moves[moves.length - 1].uci.slice(2, 4)]
              : null
          }
          hintSquares={phase === "solving" ? hintSquaresFor(serverHint) : null}
          onMove={handleMove}
        />
        <p className="mt-2 text-sm font-semibold text-app-text" aria-live="polite">
          {phase === "solving"
            ? `${session.studentColor === "white" ? "White" : "Black"} to move`
            : result?.solved
              ? "Solved!"
              : "Not solved"}
        </p>
      </div>

      <div className="min-w-0 space-y-4">
        {wrong && (
          <Card className="flex items-center gap-2 border-app-danger/40 p-3 text-sm text-app-danger-ink" role="status">
            <XCircle className="size-4 shrink-0" strokeWidth={2.5} />
            Not the move — try again. Each wrong move costs points.
          </Card>
        )}

        {wrongMoves.length > 0 && phase === "solving" && (
          <p className="text-xs text-app-muted">
            Wrong moves this try: {wrongMoves.map((m) => m.label).join(", ")}
          </p>
        )}

        {pendingSubmit && (
          <Alert
            variant="warning"
            action={
              <Button type="button" size="sm" variant="outline" onClick={() => void retrySubmit()}>
                Send again
              </Button>
            }
          >
            Your answer didn&apos;t reach the server.
          </Alert>
        )}

        {result && (
          <Card
            className={`flex items-start gap-2 p-3 text-sm ${
              result.solved ? "border-accent/40 bg-accent/10 text-accent-ink" : "text-app-text"
            }`}
            role="status"
          >
            {result.solved ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} /> : null}
            <span>
              {result.solved
                ? `Correct — ${result.scorePercent}% of the line.`
                : solutionShown
                  ? `Not solved (${result.scorePercent}%). Here is the full line.`
                  : `Not solved (${result.scorePercent}%). You have ${
                      triesAfter === null ? "more tries" : `${triesAfter} ${triesAfter === 1 ? "try" : "tries"} left`
                    } — the solution stays hidden until you solve it or run out.`}
            </span>
          </Card>
        )}

        {(moves.length > 0 || solutionShown) && (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-app-muted">
              {result && !result.solved && solutionShown ? "Full solution" : "Moves played"}
            </p>
            <ol className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
              {(result && !result.solved && solutionShown ? result.solutionMoves : moves).map((m, i) => (
                <li key={i} className="flex items-center gap-1">
                  {i % 2 === 0 && <span className="text-app-muted">{Math.floor(i / 2) + 1}.</span>}
                  <span className="font-medium text-app-text">{m.san}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {session.allowHints && phase === "solving" && (
          <div className="space-y-2">
            {serverHint && (
              <Card className="p-3 text-sm text-app-text">
                <Lightbulb className="mr-1 inline size-4 align-text-bottom text-primary-ink" strokeWidth={2.5} />
                {hintText(serverHint)}
              </Card>
            )}
            {serverHint?.level !== 3 && (
              <Button type="button" variant="outline" size="sm" onClick={() => void requestHint()}>
                <Lightbulb className="mr-1.5 size-4" strokeWidth={2.5} />
                {serverHint ? "More hint" : "Show a hint"}
              </Button>
            )}
            <p className="text-xs text-app-muted">Hints cost points.</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {phase === "solving" && (
            <Button type="button" variant="outline" size="sm" onClick={() => void giveUp()}>
              Give up this try
            </Button>
          )}
          {phase === "done" && hasNext && (
            <Button type="button" size="sm" onClick={onNext}>
              Next puzzle
              <ArrowRight className="ml-1.5 size-4" strokeWidth={2.5} />
            </Button>
          )}
          {phase === "done" && !result?.solved && triesAfter !== 0 && (
            <Button type="button" variant="outline" size="sm" onClick={() => void begin()}>
              <RotateCcw className="mr-1.5 size-4" strokeWidth={2.5} />
              Try again
            </Button>
          )}
          {phase === "done" && !hasNext && (
            <Button type="button" variant={result?.solved ? "primary" : "outline"} size="sm" onClick={onNext}>
              See my results
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

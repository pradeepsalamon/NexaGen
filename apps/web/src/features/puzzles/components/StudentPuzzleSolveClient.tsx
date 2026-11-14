"use client";

import { useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Lightbulb, RotateCcw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { PRACTICE_BOARD_GRID, PracticeBoard } from "@/features/chessboard/components/board/PracticeBoard";
import { hintSquaresFor, hintText } from "@/features/assignments/lib/solveLineHint";
import { startPuzzleAttempt } from "../api/puzzleApi";
import { usePuzzleAttempt } from "../hooks/usePuzzleAttempt";
import { useMyPuzzle } from "../hooks/usePuzzlesApi";
import {
  PUZZLE_DIFFICULTY_LABELS,
  PUZZLE_TYPE_LABELS,
  difficultyBadgeVariant
} from "../lib/puzzleMeta";

export function StudentPuzzleSolveClient({ id }: { id: string }) {
  const detail = useMyPuzzle(id);
  const start = useCallback(() => startPuzzleAttempt(id), [id]);
  const attempt = usePuzzleAttempt({ start });
  const {
    session,
    startError,
    moves,
    phase,
    wrong,
    resetNonce,
    result,
    currentFen,
    revealedHints,
    begin,
    handleMove,
    giveUp,
    showHint,
    serverHint,
    requestHint,
    submitting
  } = attempt;

  if (detail.isLoading || (!session && !startError)) {
    return <Skeleton className="h-96 w-full" />;
  }
  if (startError || detail.isError || !detail.data) {
    return (
      <WidgetError
        message={startError ?? "Could not load this puzzle."}
        onRetry={() => {
          void begin();
          void detail.refetch();
        }}
      />
    );
  }

  const p = detail.data.puzzle;
  const hints = p.hints ?? [];

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/student/courses">
          <ArrowLeft className="mr-1.5 size-4" strokeWidth={2.5} />
          My Courses
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">{p.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{p.topicName}</Badge>
          <Badge variant="outline">{PUZZLE_TYPE_LABELS[p.puzzleType]}</Badge>
          <Badge variant={difficultyBadgeVariant(p.difficulty)}>
            {PUZZLE_DIFFICULTY_LABELS[p.difficulty]}
          </Badge>
        </div>
        {p.description ? (
          <p className="mt-2 max-w-2xl text-sm text-app-muted">{p.description}</p>
        ) : null}
      </div>

      <Card className="p-4 sm:p-6">
        <div className={PRACTICE_BOARD_GRID}>
          <div>
            {session && currentFen ? (
              <PracticeBoard
                resetKey={`${moves.length}-${resetNonce}`}
                fen={currentFen}
                orientation={session.orientation}
                playerColor={session.studentColor}
                interactive={phase === "solving"}
                lastMove={
                  moves.length
                    ? [
                        moves[moves.length - 1].uci.slice(0, 2),
                        moves[moves.length - 1].uci.slice(2, 4)
                      ]
                    : null
                }
                hintSquares={phase === "solving" ? hintSquaresFor(serverHint) : null}
                onMove={handleMove}
              />
            ) : null}
            <p className="mt-2 text-sm font-semibold text-app-text">
              {phase === "solving"
                ? `${session?.studentColor === "white" ? "White" : "Black"} to move`
                : result?.solved
                  ? "Solved!"
                  : "Review"}
            </p>
          </div>

          <div className="space-y-4">
            {wrong && (
              <Card className="flex items-center gap-2 border-app-danger/40 p-3 text-sm text-app-danger-ink">
                <XCircle className="size-4 shrink-0" strokeWidth={2.5} />
                Not the move — try again.
              </Card>
            )}

            {result && (
              <Card
                className={`flex items-start gap-2 p-3 text-sm ${
                  result.solved
                    ? "border-accent/40 bg-accent/10 text-accent-ink"
                    : "text-app-text"
                }`}
              >
                {result.solved ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} />
                ) : null}
                <span>
                  {result.solved
                    ? `Correct — score ${result.scorePercent}%.`
                    : `Score ${result.scorePercent}%. Review the full line below.`}
                  {p.explanation ? (
                    <span className="mt-1 block text-app-text">{p.explanation}</span>
                  ) : null}
                </span>
              </Card>
            )}

            <div>
              <p className="mb-1 text-xs font-semibold text-app-muted">
                {result && !result.solved ? "Full solution" : "Moves played"}
              </p>
              <ol className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
                {(result && !result.solved ? result.solutionMoves : moves).map((m, i) => (
                  <li key={i} className="flex items-center gap-1">
                    {i % 2 === 0 && (
                      <span className="text-app-muted">{Math.floor(i / 2) + 1}.</span>
                    )}
                    <span className="font-medium text-app-text">{m.san}</span>
                  </li>
                ))}
              </ol>
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
                  <Button type="button" variant="outline" size="sm" onClick={showHint}>
                    <Lightbulb className="mr-1.5 size-4" strokeWidth={2.5} />
                    Show a hint
                  </Button>
                )}
              </div>
            )}

            {hints.length === 0 && phase === "solving" && (
              <div className="space-y-2">
                {serverHint && (
                  <Card className="p-3 text-sm text-app-text">
                    <Lightbulb className="mr-1 inline size-4 align-text-bottom text-primary" strokeWidth={2.5} />
                    {hintText(serverHint)}
                  </Card>
                )}
                {serverHint?.level !== 3 && (
                  <Button type="button" variant="outline" size="sm" onClick={() => void requestHint()}>
                    <Lightbulb className="mr-1.5 size-4" strokeWidth={2.5} />
                    {serverHint ? "More hint" : "Show a hint"}
                  </Button>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {phase === "solving" && (
                <Button disabled={submitting} type="button" variant="outline" size="sm" onClick={() => void giveUp()}>
                  Give up &amp; show solution
                </Button>
              )}
              {phase === "done" && (
                <Button type="button" variant="outline" size="sm" onClick={begin}>
                  <RotateCcw className="mr-1.5 size-4" strokeWidth={2.5} />
                  Try again
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

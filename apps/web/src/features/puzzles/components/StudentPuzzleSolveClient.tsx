"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type {
  AttemptMove,
  PuzzleAttemptResultResponse,
  StartPuzzleAttemptResponse
} from "@nexa-chess/types";
import { ArrowLeft, CheckCircle2, Lightbulb, RotateCcw, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import {
  PracticeBoard,
  type PracticeBoardMove
} from "@/features/chessboard/components/board/PracticeBoard";
import { useToast } from "@/providers/ToastProvider";
import {
  savePuzzleAttempt,
  startPuzzleAttempt,
  submitPuzzleAttempt
} from "../api/puzzleApi";
import { useMyPuzzle } from "../hooks/usePuzzlesApi";
import {
  PUZZLE_DIFFICULTY_LABELS,
  PUZZLE_TYPE_LABELS,
  difficultyBadgeVariant
} from "../lib/puzzleMeta";
import { replayLine } from "./solver/puzzleSolverEngine";

export function StudentPuzzleSolveClient({ id }: { id: string }) {
  const toast = useToast();
  const detail = useMyPuzzle(id);
  const [session, setSession] = useState<StartPuzzleAttemptResponse | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const [moves, setMoves] = useState<AttemptMove[]>([]);
  const [phase, setPhase] = useState<"solving" | "done">("solving");
  const [wrong, setWrong] = useState(false);
  const [resetNonce, setResetNonce] = useState(0);
  const [revealedHints, setRevealedHints] = useState(0);
  const [result, setResult] = useState<PuzzleAttemptResultResponse | null>(null);
  const startedAt = useRef(Date.now());
  const busy = useRef(false);

  const begin = useCallback(async () => {
    try {
      const res = await startPuzzleAttempt(id);
      setSession(res.attempt);
      setMoves(res.attempt.attempt.moves ?? []);
      setPhase("solving");
      setResult(null);
      startedAt.current = Date.now();
    } catch (error) {
      setStartError((error as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void begin();
  }, [begin]);

  const startFen = session?.fen ?? "";
  const currentFen = useMemo(() => {
    if (!startFen) return "";
    if (result && !result.solved) {
      return replayLine(startFen, result.solutionMoves.map((m) => m.uci));
    }
    return replayLine(startFen, moves.map((m) => m.uci));
  }, [startFen, moves, result]);

  const submit = useCallback(
    async (finalMoves: AttemptMove[]) => {
      if (!session) return;
      try {
        const res = await submitPuzzleAttempt(id, session.attempt.id, {
          moves: finalMoves,
          durationSeconds: Math.round((Date.now() - startedAt.current) / 1000),
          hintsUsed: revealedHints
        });
        setResult(res);
        setPhase("done");
      } catch (error) {
        toast.error({ title: "Could not submit", message: (error as Error).message });
      }
    },
    [session, id, revealedHints, toast]
  );

  const handleMove = useCallback(
    async (pmv: PracticeBoardMove) => {
      if (!session || phase !== "solving" || busy.current) return;
      busy.current = true;
      const studentMove: AttemptMove = {
        ply: moves.length + 1,
        uci: pmv.uci,
        san: pmv.san,
        fenAfter: pmv.fen
      };
      try {
        const res = await savePuzzleAttempt(id, session.attempt.id, {
          moves: [...moves, studentMove]
        });
        const fb = res.moveFeedback;
        if (fb && !fb.correct) {
          setWrong(true);
          setResetNonce((n) => n + 1);
          window.setTimeout(() => setWrong(false), 900);
          return;
        }
        let nextMoves = [...moves, studentMove];
        if (fb?.opponentReply) {
          nextMoves = [
            ...nextMoves,
            {
              ply: nextMoves.length + 1,
              uci: fb.opponentReply.uci,
              san: fb.opponentReply.san,
              fenAfter: fb.opponentReply.fenAfter
            }
          ];
          await savePuzzleAttempt(id, session.attempt.id, { moves: nextMoves });
        }
        setWrong(false);
        setMoves(nextMoves);
        if (fb?.lineComplete) {
          await submit(nextMoves);
        }
      } catch (error) {
        toast.error({ title: "Move rejected", message: (error as Error).message });
        setResetNonce((n) => n + 1);
      } finally {
        busy.current = false;
      }
    },
    [session, phase, moves, id, submit, toast]
  );

  if (detail.isLoading || (!session && !startError)) {
    return <Skeleton className="h-96 w-full" />;
  }
  if (startError || detail.isError || !detail.data) {
    return (
      <WidgetError
        message={startError ?? "Could not load this puzzle."}
        onRetry={() => {
          setStartError(null);
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
        <Link href="/student/puzzles">
          <ArrowLeft className="mr-1.5 size-4" strokeWidth={2.5} />
          Puzzles
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-app-text">{p.title}</h1>
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
        <div className="grid gap-5 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
          <div>
            {session && currentFen ? (
              <PracticeBoard
                key={`${moves.length}-${resetNonce}`}
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
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-app-muted">
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
              {phase === "solving" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => submit(moves)}
                >
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

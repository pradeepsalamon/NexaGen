"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "@/lib/chess";
import type {
  AssignmentEvaluationResult,
  AttemptMove,
  ChessColor,
  SolveLineHint,
  StartAttemptResponse
} from "@nexa-chess/types";
import { Flag, Lightbulb, Send, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/ToastProvider";
import {
  PRACTICE_BOARD_BESIDE,
  PracticeBoard,
  type PracticeBoardMove
} from "@/features/chessboard/components/board/PracticeBoard";
import {
  getSolveLineHint,
  requestEngineMove,
  saveAttemptProgress
} from "../../api/assignmentApi";
import {
  useStartAttempt,
  useSubmitAttempt
} from "../../hooks/useAssignmentsApi";
import { hintSquaresFor, hintText } from "../../lib/solveLineHint";
import { AssignmentResultView } from "./AssignmentResultView";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

interface Props {
  assignmentId: string;
  onBack: () => void;
}

type Phase = "loading" | "error" | "active" | "result";

function turnOf(fen: string): ChessColor {
  try {
    return new Chess(fen).turn() === "w" ? "white" : "black";
  } catch {
    return "white";
  }
}

function replay(startFen: string, moves: AttemptMove[]): string {
  try {
    const chess = new Chess(startFen);
    for (const m of moves) {
      chess.move({
        from: m.uci.slice(0, 2),
        to: m.uci.slice(2, 4),
        promotion: m.uci.slice(4) || undefined
      });
    }
    return chess.fen();
  } catch {
    return startFen;
  }
}

export function EvaluatedActivity({ assignmentId, onBack }: Props) {
  const toast = useToast();
  const startMutation = useStartAttempt(assignmentId);
  const submitMutation = useSubmitAttempt(assignmentId);

  const [phase, setPhase] = useState<Phase>("loading");
  const [start, setStart] = useState<StartAttemptResponse | null>(null);
  const [moves, setMoves] = useState<AttemptMove[]>([]);
  const [fen, setFen] = useState(START_FEN);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AssignmentEvaluationResult | null>(null);
  const [hint, setHint] = useState<SolveLineHint | null>(null);

  const startedAtRef = useRef(Date.now());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const kickoff = useRef(false);

  const config = start?.config;
  const activityType = config?.activityType ?? "FREE_ANALYSIS";
  const startFen = start?.startFen ?? START_FEN;
  const attemptId = start?.attempt.id ?? "";

  const lastMove = useMemo<[string, string] | null>(() => {
    const m = moves[moves.length - 1];
    return m ? [m.uci.slice(0, 2), m.uci.slice(2, 4)] : null;
  }, [moves]);

  const hintSquares = useMemo(() => hintSquaresFor(hint), [hint]);

  const beginAttempt = useCallback(async () => {
    setPhase("loading");
    setFeedback(null);
    setResult(null);
    setHint(null);
    try {
      const { attempt } = await startMutation.mutateAsync();
      startedAtRef.current = Date.now();
      setStart(attempt);
      let nextMoves = attempt.attempt.moves;
      setMoves(nextMoves);
      setFen(replay(attempt.startFen, nextMoves));
      setPhase("active");

      // SOLVE_LINE where the opponent moves first: pull that forced move in.
      if (
        attempt.config.activityType === "SOLVE_LINE" &&
        nextMoves.length === 0 &&
        attempt.config.studentColor &&
        turnOf(attempt.startFen) !== attempt.config.studentColor
      ) {
        const { moveFeedback } = await saveAttemptProgress(assignmentId, attempt.attempt.id, {
          moves: []
        });
        if (moveFeedback?.opponentReply) {
          nextMoves = [
            {
              ply: 1,
              uci: moveFeedback.opponentReply.uci,
              san: moveFeedback.opponentReply.san,
              fenAfter: moveFeedback.opponentReply.fenAfter
            }
          ];
          setMoves(nextMoves);
          setFen(moveFeedback.opponentReply.fenAfter);
        }
      }
    } catch {
      setPhase("error");
    }
  }, [startMutation, assignmentId]);

  useEffect(() => {
    if (kickoff.current) return;
    kickoff.current = true;
    void beginAttempt();
  }, [beginAttempt]);

  const elapsedSeconds = () => Math.round((Date.now() - startedAtRef.current) / 1000);

  const persist = useCallback(
    (next: AttemptMove[]) => {
      if (!attemptId) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void saveAttemptProgress(assignmentId, attemptId, {
          moves: next,
          durationSeconds: elapsedSeconds()
        }).catch(() => undefined);
      }, 700);
    },
    [assignmentId, attemptId]
  );

  const doSubmit = useCallback(
    async (finalMoves: AttemptMove[], resign = false) => {
      if (!attemptId) return;
      setBusy(true);
      try {
        const evaluation = await submitMutation.mutateAsync({
          attemptId,
          data: { moves: finalMoves, durationSeconds: elapsedSeconds(), resign }
        });
        setResult(evaluation);
        setPhase("result");
      } finally {
        setBusy(false);
      }
    },
    [attemptId, submitMutation]
  );

  const handleSolveLineMove = useCallback(
    async (mv: PracticeBoardMove) => {
      if (!start) return;
      const studentMove: AttemptMove = {
        ply: moves.length + 1,
        uci: mv.uci,
        san: mv.san,
        fenAfter: mv.fen
      };
      const withMove = [...moves, studentMove];
      setMoves(withMove);
      setFen(mv.fen);
      setBusy(true);
      try {
        const { moveFeedback } = await saveAttemptProgress(assignmentId, attemptId, {
          moves: withMove,
          durationSeconds: elapsedSeconds()
        });
        if (!moveFeedback) return;

        if (!moveFeedback.correct) {
          setFeedback("Not the move we're looking for.");
          if (config?.allowRetry) {
            setTimeout(() => {
              setMoves(moves);
              setFen(replay(startFen, moves));
              setFeedback("Try again.");
            }, 650);
          }
          return;
        }

        setFeedback("Correct!");
        setHint(null);
        let nextMoves = withMove;
        if (moveFeedback.opponentReply) {
          const reply = moveFeedback.opponentReply;
          nextMoves = [
            ...withMove,
            {
              ply: withMove.length + 1,
              uci: reply.uci,
              san: reply.san,
              fenAfter: reply.fenAfter
            }
          ];
          setMoves(nextMoves);
          setFen(reply.fenAfter);
          void saveAttemptProgress(assignmentId, attemptId, {
            moves: nextMoves,
            durationSeconds: elapsedSeconds()
          }).catch(() => undefined);
        }

        if (moveFeedback.lineComplete) {
          await doSubmit(nextMoves);
        }
      } finally {
        setBusy(false);
      }
    },
    [start, moves, assignmentId, attemptId, config, startFen, doSubmit]
  );

  const handleEngineMove = useCallback(
    async (mv: PracticeBoardMove) => {
      const studentMove: AttemptMove = {
        ply: moves.length + 1,
        uci: mv.uci,
        san: mv.san,
        fenAfter: mv.fen
      };
      const withMove = [...moves, studentMove];
      setMoves(withMove);
      setFen(mv.fen);

      const afterStudent = new Chess(mv.fen);
      if (afterStudent.isGameOver()) {
        await doSubmit(withMove);
        return;
      }

      setBusy(true);
      try {
        const engine = await requestEngineMove(assignmentId, attemptId, { fen: mv.fen });
        if (!engine.available) {
          toast.warning({
            title: "Engine offline",
            message: "You can keep playing and submit when the game ends."
          });
          persist(withMove);
          return;
        }
        if (engine.gameOver || !engine.uci || !engine.san || !engine.fenAfter) {
          await doSubmit(withMove);
          return;
        }
        const engineMove: AttemptMove = {
          ply: withMove.length + 1,
          uci: engine.uci,
          san: engine.san,
          fenAfter: engine.fenAfter
        };
        const next = [...withMove, engineMove];
        setMoves(next);
        setFen(engine.fenAfter);
        persist(next);
        if (new Chess(engine.fenAfter).isGameOver()) {
          await doSubmit(next);
        }
      } catch {
        setMoves(moves);
        setFen(replay(startFen, moves));
        toast.error({
          title: "Engine error",
          message: "Failed to get engine move. Please try again."
        });
      } finally {
        setBusy(false);
      }
    },
    [moves, assignmentId, attemptId, doSubmit, persist, toast, startFen]
  );

  const handleFreeMove = useCallback(
    (mv: PracticeBoardMove) => {
      const next = [
        ...moves,
        { ply: moves.length + 1, uci: mv.uci, san: mv.san, fenAfter: mv.fen }
      ];
      setMoves(next);
      setFen(mv.fen);
      persist(next);
    },
    [moves, persist]
  );

  const takeback = useCallback(() => {
    const next = moves.slice(0, -1);
    setMoves(next);
    setFen(replay(startFen, next));
    setHint(null);
    persist(next);
  }, [moves, startFen, persist]);

  const requestHint = useCallback(async () => {
    if (!attemptId || busy) return;
    const nextLevel = Math.min(3, (hint?.level ?? 0) + 1);
    setBusy(true);
    try {
      const next = await getSolveLineHint(assignmentId, attemptId, {
        moves,
        level: nextLevel
      });
      setHint(next);
      if (!next.onTrack) setFeedback(hintText(next));
    } catch {
      toast.error({ title: "Hint unavailable", message: "Try again in a moment." });
    } finally {
      setBusy(false);
    }
  }, [assignmentId, attemptId, busy, hint, moves, toast]);

  const onMove = useCallback(
    (mv: PracticeBoardMove) => {
      if (busy) return;
      if (activityType === "SOLVE_LINE") void handleSolveLineMove(mv);
      else if (activityType === "PLAY_VS_ENGINE") void handleEngineMove(mv);
      else handleFreeMove(mv);
    },
    [busy, activityType, handleSolveLineMove, handleEngineMove, handleFreeMove]
  );

  if (phase === "loading") {
    // Same footprint as the live board, so the page doesn't collapse and
    // re-grow (a visible scroll jump) while an attempt starts.
    return (
      <Card className="p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <Skeleton className={cn("aspect-square w-full", PRACTICE_BOARD_BESIDE)} />
          <p className="text-sm text-app-muted">Preparing your board…</p>
        </div>
      </Card>
    );
  }
  if (phase === "error" || !start || !config) {
    return (
      <Card className="p-5">
        <p className="text-sm text-app-danger-ink">This assignment could not be started.</p>
        <Button className="mt-3" variant="outline" onClick={onBack}>
          Back to assignments
        </Button>
      </Card>
    );
  }
  if (phase === "result" && result) {
    return (
      <AssignmentResultView
        result={result}
        activityType={activityType}
        startFen={startFen}
        timeSpentSeconds={result.attempt.durationSeconds || elapsedSeconds()}
        onRetry={result.attemptsRemaining === 0 ? undefined : () => void beginAttempt()}
        onBack={onBack}
      />
    );
  }

  const orientation: ChessColor = config.orientation ?? config.studentColor ?? "white";
  const playerColor: ChessColor | undefined = config.studentColor ?? undefined;
  const turnColor = (() => {
    try {
      return new Chess(fen).turn() === "w" ? "white" : "black";
    } catch {
      return "white";
    }
  })();
  const yourTurn = !playerColor || playerColor === turnColor;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        {/* Board beside the panel from tablet width up, so a student never
            scrolls between the board and the moves/feedback. */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start">
          <PracticeBoard
            className={PRACTICE_BOARD_BESIDE}
            fen={fen}
            orientation={orientation}
            playerColor={playerColor}
            interactive={!busy && yourTurn}
            lastMove={lastMove}
            hintSquares={hintSquares}
            onMove={onMove}
          />

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex min-h-8 flex-wrap items-center gap-2 text-sm">
              <span className="rounded-app border border-app-border bg-app-background px-2 py-1 font-medium text-app-text">
                {turnColor === "white" ? "White to move" : "Black to move"}
              </span>
              {config.maxAttempts !== null && (
                <span className="text-app-muted">
                  Attempt {start.attemptCount}/{config.maxAttempts}
                </span>
              )}
              {activityType === "FREE_ANALYSIS" && config.minMoves !== null && (
                <span className="text-app-muted">
                  {moves.length}/{config.minMoves} moves
                </span>
              )}
              {/* Always rendered: toggling it would re-wrap the row on every move. */}
              <span aria-live="polite" className={cn("text-app-muted", !busy && "invisible")}>
                Thinking…
              </span>
            </div>

            {/* The feedback slot keeps its height when empty, so the moves
                and buttons below don't jump each time it appears / clears. */}
            <div aria-live="polite" className="min-h-[2.375rem]">
            {feedback && (
              <p
                className={
                  feedback === "Correct!"
                    ? "rounded-app border border-success/40 bg-success/10 p-2 text-sm text-success-ink"
                    : "rounded-app border border-warning/40 bg-warning/10 p-2 text-sm text-warning-ink"
                }
              >
                {feedback}
              </p>
            )}
            </div>

            {hint && (
              <p className="rounded-app border border-primary/40 bg-primary/10 p-2 text-sm text-primary-ink">
                <Lightbulb className="mr-1 inline size-4 align-text-bottom" strokeWidth={2.5} />
                {hintText(hint)}
                {hint.onTrack && !hint.lineComplete && hint.level < 3 && (
                  <span className="ml-1 text-primary-ink">Ask again for more.</span>
                )}
              </p>
            )}

            <MoveList moves={moves} />

            <div className="flex flex-wrap gap-2">
              {activityType === "FREE_ANALYSIS" && (
                <>
                  <Button variant="outline" size="sm" onClick={takeback} disabled={moves.length === 0}>
                    <Undo2 className="mr-1.5 size-4" strokeWidth={2.5} />
                    Take back
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy || moves.length < (config.minMoves ?? 0)}
                    onClick={() => void doSubmit(moves)}
                  >
                    <Send className="mr-1.5 size-4" strokeWidth={2.5} />
                    Submit assignment
                  </Button>
                </>
              )}
              {activityType === "PLAY_VS_ENGINE" && (
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={() => void doSubmit(moves, true)}
                >
                  <Flag className="mr-1.5 size-4" strokeWidth={2.5} />
                  Resign
                </Button>
              )}
              {activityType === "SOLVE_LINE" && !config.allowRetry && (
                <Button size="sm" disabled={busy} onClick={() => void doSubmit(moves)}>
                  <Send className="mr-1.5 size-4" strokeWidth={2.5} />
                  Submit
                </Button>
              )}
              {config.allowHints && activityType === "SOLVE_LINE" && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy || hint?.level === 3}
                  onClick={() => void requestHint()}
                >
                  <Lightbulb className="mr-1.5 size-4" strokeWidth={2.5} />
                  {!hint ? "Hint" : hint.level === 3 ? "Hint shown" : "More hint"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function MoveList({ moves }: { moves: AttemptMove[] }) {
  // A fixed-height box that scrolls itself to the latest move, so a long line
  // never pushes the buttons down or makes the page scroll.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [moves.length]);

  return (
    <div
      ref={listRef}
      className="h-28 overflow-y-auto overscroll-contain rounded-app border border-app-border bg-app-background p-2 md:h-40"
    >
      {moves.length === 0 ? (
        <p className="text-sm text-app-muted">No moves yet — make your move on the board.</p>
      ) : (
        <ol className="flex flex-wrap gap-x-2 gap-y-1 text-sm">
          {moves.map((m, i) => (
            <li key={i} className="flex items-center gap-1">
              {i % 2 === 0 && <span className="text-app-muted">{Math.floor(i / 2) + 1}.</span>}
              <span className="font-medium text-app-text">{m.san}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

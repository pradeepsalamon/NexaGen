"use client";

import { useEffect, useRef, useState } from "react";
import { Flag, Lightbulb, Loader2, RotateCcw, Target, Trophy, XCircle } from "lucide-react";
import {
  PLAYOUT_END_REASON_LABELS,
  PLAYOUT_RESULT_LABELS,
  type ActivityRunSummary,
  type PlayoutGameView,
  type StudentPlayoutState
} from "@nexa-chess/types";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PracticeBoard, PRACTICE_BOARD_GRID, type PracticeBoardMove } from "@/features/chessboard/components/board/PracticeBoard";
import { useToast } from "@/providers/ToastProvider";
import { cn } from "@/lib/utils";
import { usePlayoutActions } from "../../../hooks/useActivityRun";
import { useCountdown } from "../../../hooks/useCountdown";
import { PuzzleTimerBadge } from "../PuzzleSessionControls";
import { SimulMoveList } from "../simul/SimulMoveList";

const ENGINE_RETRY_MS = 2_500;

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** The result card: goal, game result, score, time, moves, tries and the PGN. */
function PlayoutResultCard({
  game,
  attemptsUsed,
  maxAttempts
}: {
  game: PlayoutGameView;
  attemptsUsed: number;
  maxAttempts: number;
}) {
  const toast = useToast();
  return (
    <div
      className={cn(
        "space-y-3 rounded-app border p-3",
        game.goalAchieved ? "border-success/50 bg-success/10" : "border-app-border bg-app-soft"
      )}
      role="status"
    >
      <p className="flex items-center gap-2 font-bold text-app-text">
        {game.goalAchieved ? (
          <Trophy className="size-5 text-success-ink" strokeWidth={2.5} aria-hidden="true" />
        ) : (
          <XCircle className="size-5 text-app-muted" strokeWidth={2.5} aria-hidden="true" />
        )}
        {game.goalAchieved ? "Goal achieved!" : "Goal not achieved"}
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
        {[
          ["Game", game.result ? PLAYOUT_RESULT_LABELS[game.result] : "—"],
          ["How it ended", game.endReason ? PLAYOUT_END_REASON_LABELS[game.endReason] : "—"],
          ["Score", `${game.score ?? 0} / ${game.maxScore}`],
          ["Time", clock(game.durationSeconds)],
          ["Your moves", String(game.studentMoves)],
          ["Tries", `${attemptsUsed} of ${maxAttempts}`]
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-app-muted">{label}</dt>
            <dd className="font-semibold tabular-nums text-app-text">{value}</dd>
          </div>
        ))}
      </dl>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-primary-ink">Game PGN</summary>
        <pre className="custom-scrollbar mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-control bg-app-surface p-2 text-xs text-app-text">
          {game.pgn}
        </pre>
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          onClick={() =>
            void navigator.clipboard
              .writeText(game.pgn)
              .then(() => toast.success({ title: "PGN copied" }))
              .catch(() => toast.error({ title: "Couldn't copy the PGN" }))
          }
        >
          Copy PGN
        </Button>
      </details>
    </div>
  );
}

/**
 * The student's own game against the computer, in the class's stage. Every move
 * is checked by the API, which also plays the reply: this board only draws what
 * comes back. Nothing here depends on the coach being connected.
 */
export function PlayoutStudentView({ classId, run, playout }: { classId: string; run: ActivityRunSummary; playout: StudentPlayoutState }) {
  const actions = usePlayoutActions(classId);
  const toast = useToast();
  const game = playout.game;
  const active = run.status === "ACTIVE";

  // A student's board, drawn ahead of the API's answer so a move feels instant.
  const [optimistic, setOptimistic] = useState<{ fen: string; ply: number; lastMove: [string, string] } | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [confirm, setConfirm] = useState<"resign" | "restart" | null>(null);

  // Open a game the first time the student sees this activity. Starting twice is safe.
  const startedFor = useRef<string | null>(null);
  useEffect(() => {
    if (game || !active || startedFor.current === run.id) return;
    startedFor.current = run.id;
    actions.start.mutate(run.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, active, run.id]);

  useEffect(() => {
    if (game && optimistic && game.ply > optimistic.ply) setOptimistic(null);
  }, [game, optimistic]);

  // The computer owes a move and nothing is on its way (the engine was busy, a reconnect): ask again.
  const computerDue = !!game && active && game.status === "IN_PROGRESS" && game.turn === "COMPUTER";
  const moving = actions.move.isPending || actions.start.isPending || actions.retry.isPending;
  useEffect(() => {
    if (!computerDue || moving || !game) return;
    const timer = window.setTimeout(() => actions.continueGame.mutate({ gameId: game.id, runId: run.id }), ENGINE_RETRY_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computerDue, moving, game?.id, game?.ply, actions.continueGame.isPending, run.id]);

  // The student's clock ran out: the API ends the game on the next call.
  const { expired } = useCountdown(game?.status === "IN_PROGRESS" ? game.endsAt : null);
  useEffect(() => {
    if (!expired || !game || !active) return;
    const timer = window.setTimeout(() => actions.continueGame.mutate({ gameId: game.id, runId: run.id }), 6_000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired, game?.id, active, run.id]);

  if (!game) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center text-sm text-app-muted">
        {active ? (
          <>
            <Loader2 className="size-5 animate-spin" aria-hidden="true" />
            <p>Setting up your board…</p>
            {actions.start.isError ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => actions.start.mutate(run.id)}
              >
                Try again
              </Button>
            ) : null}
          </>
        ) : (
          <p>This activity has ended.</p>
        )}
      </div>
    );
  }

  const inProgress = game.status === "IN_PROGRESS" && active;
  const myTurn = inProgress && game.turn === "STUDENT" && !actions.move.isPending;
  const last = game.moves[game.moves.length - 1];
  const fen = optimistic?.fen ?? game.fen;
  const lastMove: [string, string] | null =
    optimistic?.lastMove ?? (last ? [last.uci.slice(0, 2), last.uci.slice(2, 4)] : null);
  const thinking = inProgress && (game.turn === "COMPUTER" || actions.move.isPending);

  const onMove = (move: PracticeBoardMove) => {
    if (!myTurn) return;
    setOptimistic({ fen: move.fen, lastMove: [move.from, move.to], ply: game.ply });
    void actions.move
      .mutateAsync({ gameId: game.id, ply: game.ply, runId: run.id, uci: move.uci })
      .catch((error: Error) => {
        // Refused or stale: the board goes back to what the API holds.
        setOptimistic(null);
        setResetKey((k) => k + 1);
        toast.error({ message: error.message, title: "That move didn't go through" });
        void actions.continueGame.mutateAsync({ gameId: game.id, runId: run.id }).catch(() => undefined);
      });
  };

  const hintsLeft = playout.hintsAvailable - game.hintsUsed;

  return (
    <div className={PRACTICE_BOARD_GRID}>
      <div className="flex justify-center">
        <PracticeBoard
          fen={fen}
          orientation={game.studentColor}
          playerColor={game.studentColor}
          interactive={myTurn}
          lastMove={lastMove}
          onMove={onMove}
          resetKey={`${game.id}:${game.ply}:${resetKey}`}
        />
      </div>

      <div className="min-w-0 space-y-3">
        <div className="rounded-app border border-primary/40 bg-primary/5 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-primary-ink">
            <Target className="size-3.5" strokeWidth={2.5} aria-hidden="true" /> Your goal
          </p>
          <p className="mt-1 font-semibold text-app-text">{playout.goalText}</p>
          {game.progress ? <p className="mt-1 text-xs text-app-muted">{game.progress}</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm" role="status" aria-live="polite">
          <Badge variant="outline">You play {game.studentColor === "white" ? "White" : "Black"}</Badge>
          <Badge variant="outline">Computer: {playout.computerLabel}</Badge>
          {inProgress ? (
            thinking ? (
              <span className="flex items-center gap-1.5 font-semibold text-app-muted">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Computer is thinking…
              </span>
            ) : (
              <span className="font-semibold text-success-ink">Your move</span>
            )
          ) : null}
          {inProgress ? <PuzzleTimerBadge endsAt={game.endsAt} /> : null}
        </div>

        {playout.maxStudentMoves || playout.lockedPieces.length > 0 ? (
          <p className="text-xs text-app-muted">
            {playout.maxStudentMoves ? `You have ${playout.maxStudentMoves} moves. ` : ""}
            {playout.lockedPieces.length > 0 ? `Some pieces can't move in this activity (${playout.lockedPieces.join(", ").toUpperCase()}).` : ""}
          </p>
        ) : null}

        {game.status !== "IN_PROGRESS" ? (
          <PlayoutResultCard game={game} attemptsUsed={playout.attemptsUsed} maxAttempts={playout.maxAttempts} />
        ) : null}

        {game.hints.length > 0 ? (
          <ol className="space-y-1 rounded-app border border-secondary/40 bg-secondary/10 p-3 text-sm text-app-text">
            {game.hints.map((hint) => (
              <li key={hint} className="flex items-start gap-1.5">
                <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-secondary-ink" strokeWidth={2.5} aria-hidden="true" />
                {hint}
              </li>
            ))}
          </ol>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {inProgress && hintsLeft > 0 ? (
            <Button
              size="sm"
              variant="outline"
              disabled={actions.hint.isPending}
              onClick={() => actions.hint.mutate({ gameId: game.id, runId: run.id })}
            >
              <Lightbulb className="mr-1.5 size-4" strokeWidth={2.5} /> Hint ({hintsLeft} left)
            </Button>
          ) : null}
          {playout.canRetry ? (
            <Button
              size="sm"
              variant={inProgress ? "outline" : "primary"}
              disabled={actions.retry.isPending}
              onClick={() =>
                inProgress ? setConfirm("restart") : actions.retry.mutate({ gameId: game.id, runId: run.id })
              }
            >
              <RotateCcw className="mr-1.5 size-4" strokeWidth={2.5} />
              {inProgress ? "Restart" : "Try again"} ({playout.maxAttempts - playout.attemptsUsed} left)
            </Button>
          ) : null}
          {inProgress ? (
            <Button size="sm" variant="outline" onClick={() => setConfirm("resign")}>
              <Flag className="mr-1.5 size-4" strokeWidth={2.5} /> Give up
            </Button>
          ) : null}
        </div>

        <SimulMoveList
          moves={game.moves}
          blackStarts={game.startFen.split(" ")[1] === "b"}
          className="max-h-48 rounded-app border border-app-border p-2"
        />
      </div>

      <ConfirmationModal
        isOpen={confirm !== null}
        title={confirm === "resign" ? "Give up this game?" : "Start again from the beginning?"}
        confirmLabel={confirm === "resign" ? "Give up" : "Restart"}
        cancelLabel="Keep playing"
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const action = confirm === "resign" ? actions.resign : actions.retry;
          setConfirm(null);
          action.mutate({ gameId: game.id, runId: run.id });
        }}
      >
        {confirm === "resign"
          ? "The game ends now and the goal counts as not achieved."
          : "This game ends now, and it uses one of your tries."}
      </ConfirmationModal>
    </div>
  );
}

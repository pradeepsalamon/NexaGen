"use client";

import { useCallback, useEffect, useRef } from "react";
import { useDataChannel } from "@livekit/components-react";
import type { LivePuzzleAssignment } from "@nexa-chess/types";
import { encodeLivePuzzle, LIVE_CLASS_PUZZLE_TOPIC } from "@nexa-chess/types";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Lightbulb, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PracticeBoard } from "@/features/chessboard/components/board/PracticeBoard";
import {
  PUZZLE_DIFFICULTY_LABELS,
  difficultyBadgeVariant
} from "@/features/puzzles/lib/puzzleMeta";
import { usePuzzleAttempt, type WrongPuzzleMove } from "@/features/puzzles/hooks/usePuzzleAttempt";
import { hintSquaresFor } from "@/features/assignments/lib/solveLineHint";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { startLivePuzzleAttempt } from "../../api/liveClassPuzzle";
import { useCountdown } from "../../hooks/useCountdown";
import { useLivePuzzleLeaderboard } from "../../hooks/useLivePuzzle";
import { useReactions } from "../../providers/ReactionProvider";
import { useAuthStore } from "@/stores/authStore";

/**
 * The student's rejected moves, beside the board (lg+) or as a strip above it
 * (below lg). Always rendered at a fixed size, so a wrong move never moves the board.
 */
function WrongMovesList({
  moves,
  flash,
  penalty,
  variant
}: {
  moves: WrongPuzzleMove[];
  flash: boolean;
  penalty: number;
  variant: "column" | "strip";
}) {
  const latest = moves[moves.length - 1]?.id;
  const chip = (m: WrongPuzzleMove) => (
    <li
      key={m.id}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-control border border-app-danger/30 bg-app-danger/10 px-2 py-1 font-mono text-xs font-semibold text-app-danger-ink transition-shadow",
        flash && m.id === latest && "ring-2 ring-app-danger/60"
      )}
    >
      <XCircle className="size-3.5 shrink-0" strokeWidth={2.5} />
      {m.label}
    </li>
  );
  const summary = moves.length
    ? `${moves.length} wrong ${moves.length === 1 ? "move" : "moves"}${penalty > 0 ? ` · −${moves.length * penalty} pts` : ""}`
    : "No wrong moves yet";

  if (variant === "strip") {
    // Newest first, so the latest stays visible on a narrow screen.
    return (
      <div className="flex h-8 shrink-0 items-center gap-2 overflow-hidden lg:hidden" aria-label="Wrong moves">
        <span className="shrink-0 text-xs font-semibold text-app-muted">{summary}</span>
        <ol className="custom-scrollbar-hide flex min-w-0 gap-1.5 overflow-x-auto">{[...moves].reverse().map(chip)}</ol>
      </div>
    );
  }
  return (
    <aside className="hidden w-44 shrink-0 flex-col gap-2 lg:flex" aria-label="Wrong moves">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-app-muted">Attempts</p>
        <p className="text-xs text-app-muted">{summary}</p>
      </div>
      <ol className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">{moves.map(chip)}</ol>
    </aside>
  );
}

/**
 * The student's in-class puzzle board. Same server-scored SOLVE_LINE flow as the
 * standalone solver (`usePuzzleAttempt`), only the attempt is started through
 * the live-class route so it is stamped with `liveClassId` and lands on the
 * leaderboard. The board fills its parent (`PuzzleStage`).
 */
export function InRoomPuzzleSolver({
  classId,
  puzzle,
  onClose
}: {
  classId: string;
  puzzle: LivePuzzleAssignment;
  onClose?: () => void;
}) {
  const qc = useQueryClient();
  const { send } = useDataChannel(LIVE_CLASS_PUZZLE_TOPIC);
  const start = useCallback(() => startLivePuzzleAttempt(classId), [classId]);
  const {
    session, startError, moves, phase, wrong, wrongMoves, resetNonce, result, currentFen,
    begin, handleMove, giveUp, pendingSubmit, retrySubmit, serverHint, requestHint, submitting
  } = usePuzzleAttempt({ start });
  // In class a hint only ever lights up the piece to move, never the move itself.
  const hintSquares = phase === "solving" ? hintSquaresFor(serverHint ? { ...serverHint, toSquare: null } : null) : null;
  // The clock itself is in the PuzzleStage header; this only drives the auto-submit.
  const { expired } = useCountdown(puzzle.endsAt);
  const leaderboard = useLivePuzzleLeaderboard(classId, true);
  const self = leaderboard.data?.self ?? null;
  const { scoring } = puzzle;

  const reactions = useReactions();
  const user = useAuthStore((state) => state.user);
  const celebrated = useRef(false);
  useEffect(() => {
    if (!result?.solved || celebrated.current || !reactions) return;
    celebrated.current = true;
    // Only name the solver where the coach lets students see each other's results.
    const named = puzzle.leaderboard.visibility === "LIVE" && !puzzle.leaderboard.anonymize;
    reactions.celebrate(named && user ? `${user.firstName} ${user.lastName || ""}`.trim() : null);
  }, [result, reactions, puzzle.leaderboard, user]);

  useEffect(() => {
    if (!result) return;
    qc.invalidateQueries({ queryKey: queryKeys.livePuzzle.leaderboard(classId) });
    // Nudge every other client to refetch now instead of on their next poll.
    if (send) {
      send(encodeLivePuzzle({ type: "LEADERBOARD_DIRTY" }), { reliable: true }).catch(() => {});
    }
  }, [result, qc, classId, send]);

  // The coach's "solving" count comes from the attempt row; nudge every client
  // as soon as it exists rather than waiting for the next poll.
  const announcedStart = useRef(false);
  useEffect(() => {
    if (!session || announcedStart.current || !send) return;
    announcedStart.current = true;
    send(encodeLivePuzzle({ type: "LEADERBOARD_DIRTY" }), { reliable: true }).catch(() => {});
  }, [session, send]);

  // Submit whatever the student has when the timer runs out, once.
  const autoSubmitted = useRef(false);
  useEffect(() => {
    if (expired && !autoSubmitted.current && phase === "solving" && session) {
      autoSubmitted.current = true;
      giveUp();
    }
  }, [expired, phase, session, giveUp]);

  // No giving up in class, and the answer stays hidden while another try is possible.
  const showLine = !!result && !result.solved && self?.attemptsLeft === 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
        <Badge variant="secondary">{puzzle.topicName}</Badge>
        <Badge variant={difficultyBadgeVariant(puzzle.difficulty)}>
          {PUZZLE_DIFFICULTY_LABELS[puzzle.difficulty]}
        </Badge>
        <span className="text-xs text-app-muted">
          {scoring.basePoints} pts to solve
          {scoring.wrongMovePenalty > 0 ? ` · −${scoring.wrongMovePenalty} per wrong move` : ""}
          {scoring.speedBonusMax > 0 ? ` · up to +${scoring.speedBonusMax} for speed` : ""}
          {scoring.firstSolveBonuses[0] ? ` · +${scoring.firstSolveBonuses[0]} for solving first` : ""}
          {self?.attemptsLeft !== null && self?.attemptsLeft !== undefined
            ? ` · ${self.attemptsLeft} ${self.attemptsLeft === 1 ? "try" : "tries"} left`
            : ""}
        </span>
      </div>

      {pendingSubmit && !result ? (
        <Card className="space-y-2 border-app-danger/40 p-3 text-sm text-app-text">
          <p>Your answer didn&apos;t reach the server, so your coach can&apos;t see it yet.</p>
          <Button disabled={submitting} type="button" size="sm" onClick={() => void retrySubmit()}>
            Submit again
          </Button>
        </Card>
      ) : null}

      {startError ? (
        <Card className="space-y-2 p-3 text-sm text-app-text">
          <p>{startError}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void begin()}>
            Try again
          </Button>
        </Card>
      ) : null}

      {session && currentFen ? (
        <WrongMovesList moves={wrongMoves} flash={wrong} penalty={scoring.wrongMovePenalty} variant="strip" />
      ) : null}

      {session && currentFen ? (
        <div className="flex min-h-0 flex-1 gap-3">
          <WrongMovesList moves={wrongMoves} flash={wrong} penalty={scoring.wrongMovePenalty} variant="column" />
          <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center" style={{ containerType: "size" }}>
            <div className="touch-none shadow-card" style={{ width: "min(100cqw, 100cqh)", height: "min(100cqw, 100cqh)" }}>
              <PracticeBoard
                resetKey={`${moves.length}-${resetNonce}`}
                fen={currentFen}
                orientation={session.orientation}
                playerColor={session.studentColor}
                interactive={phase === "solving" && !expired}
                lastMove={
                  moves.length
                    ? [moves[moves.length - 1].uci.slice(0, 2), moves[moves.length - 1].uci.slice(2, 4)]
                    : null
                }
                hintSquares={hintSquares}
                onMove={handleMove}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1" />
      )}

      <div className="mx-auto w-full max-w-xl shrink-0 space-y-2">
        {result ? (
          <Card
            className={`flex items-start gap-2 p-2.5 text-sm ${
              result.solved ? "border-accent/40 bg-accent/10 text-accent-ink" : "text-app-text"
            }`}
          >
            {result.solved ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} />
            ) : null}
            <span>
              {result.solved
                ? `Solved — score ${result.scorePercent}%.`
                : `Score ${result.scorePercent}%.`}
              {self?.points !== null && self?.points !== undefined
                ? ` Your points: ${self.points}${self.rank !== null ? ` (#${self.rank})` : ""}.`
                : ""}
              {showLine ? " Full line:" : ""}
              {showLine ? (
                <span className="mt-1 block">
                  {result.solutionMoves.map((m) => m.san).join(" ")}
                </span>
              ) : null}
            </span>
          </Card>
        ) : null}

        <div className="flex flex-wrap items-center justify-center gap-2">
          {!result ? (
            <span className="text-sm font-medium text-app-muted">
              {session?.studentColor === "white" ? "White" : "Black"} to move
            </span>
          ) : null}
          {session && phase === "solving" && !expired ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!!hintSquares}
              onClick={() => void requestHint(2)}
            >
              <Lightbulb className="size-4" strokeWidth={2.5} />
              {hintSquares ? "Piece highlighted" : "Hint"}
              {!hintSquares && scoring.hintPenalty > 0 ? ` (−${scoring.hintPenalty} pts)` : ""}
            </Button>
          ) : null}
          {phase === "done" ? (
            <Button type="button" variant="outline" size="sm" onClick={() => onClose?.()}>
              Done
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

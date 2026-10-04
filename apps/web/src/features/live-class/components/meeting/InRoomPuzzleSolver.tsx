"use client";

import { useCallback, useEffect, useRef } from "react";
import { useDataChannel } from "@livekit/components-react";
import type { LivePuzzleAssignment } from "@nexa-chess/types";
import { encodeLivePuzzle, LIVE_CLASS_PUZZLE_TOPIC } from "@nexa-chess/types";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PracticeBoard } from "@/features/chessboard/components/board/PracticeBoard";
import {
  PUZZLE_DIFFICULTY_LABELS,
  difficultyBadgeVariant
} from "@/features/puzzles/lib/puzzleMeta";
import { usePuzzleAttempt } from "@/features/puzzles/hooks/usePuzzleAttempt";
import { queryKeys } from "@/lib/queryKeys";
import { startLivePuzzleAttempt } from "../../api/liveClassPuzzle";
import { formatClock, useCountdown } from "../../hooks/useCountdown";
import { useLivePuzzleLeaderboard } from "../../hooks/useLivePuzzle";
import { useReactions } from "../../providers/ReactionProvider";
import { useAuthStore } from "@/stores/authStore";

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
    session, startError, moves, phase, wrong, resetNonce, result, currentFen,
    begin, handleMove, giveUp, pendingSubmit, retrySubmit
  } = usePuzzleAttempt({ start });
  const { secondsLeft, expired } = useCountdown(puzzle.endsAt);
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
        <Badge variant="secondary">{puzzle.topicName}</Badge>
        <Badge variant={difficultyBadgeVariant(puzzle.difficulty)}>
          {PUZZLE_DIFFICULTY_LABELS[puzzle.difficulty]}
        </Badge>
        {secondsLeft !== null ? (
          <Badge variant={expired || secondsLeft <= 30 ? "destructive" : "outline"}>
            {expired ? "Time's up" : formatClock(secondsLeft)}
          </Badge>
        ) : null}
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
          <Button type="button" size="sm" onClick={() => void retrySubmit()}>
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
        <div className="flex min-h-0 flex-1 items-center justify-center" style={{ containerType: "size" }}>
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
              onMove={handleMove}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1" />
      )}

      <div className="mx-auto w-full max-w-xl shrink-0 space-y-2">
        {wrong ? (
          <Card className="flex items-center gap-2 border-app-danger/40 p-2.5 text-sm text-app-danger-ink">
            <XCircle className="size-4 shrink-0" strokeWidth={2.5} />
            Not the move — try again.
            {scoring.wrongMovePenalty > 0 ? ` (−${scoring.wrongMovePenalty} pts)` : ""}
          </Card>
        ) : null}

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
              {!result.solved ? " Full line:" : ""}
              {!result.solved ? (
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
          {phase === "solving" && !expired ? (
            <Button type="button" variant="outline" size="sm" onClick={giveUp}>
              Give up &amp; show solution
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

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

/**
 * The student's in-class puzzle board. Same server-scored SOLVE_LINE flow as the
 * standalone solver (`usePuzzleAttempt`), only the attempt is started through
 * the live-class route so it is stamped with `liveClassId` and lands on the
 * leaderboard.
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
  const { session, startError, moves, phase, wrong, resetNonce, result, currentFen, begin, handleMove, giveUp } =
    usePuzzleAttempt({ start });
  const { secondsLeft, expired } = useCountdown(puzzle.endsAt);

  useEffect(() => {
    if (!result) return;
    qc.invalidateQueries({ queryKey: queryKeys.livePuzzle.leaderboard(classId) });
    // Nudge every other client to refetch now instead of on their next poll.
    if (send) {
      send(encodeLivePuzzle({ type: "LEADERBOARD_DIRTY" }), { reliable: true }).catch(() => {});
    }
  }, [result, qc, classId, send]);

  // Submit whatever the student has when the timer runs out, once.
  const autoSubmitted = useRef(false);
  useEffect(() => {
    if (expired && !autoSubmitted.current && phase === "solving" && session) {
      autoSubmitted.current = true;
      giveUp();
    }
  }, [expired, phase, session, giveUp]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-app-text">{puzzle.title}</span>
        <Badge variant="secondary">{puzzle.topicName}</Badge>
        <Badge variant={difficultyBadgeVariant(puzzle.difficulty)}>
          {PUZZLE_DIFFICULTY_LABELS[puzzle.difficulty]}
        </Badge>
        {secondsLeft !== null ? (
          <Badge variant={expired || secondsLeft <= 30 ? "destructive" : "outline"}>
            {expired ? "Time's up" : formatClock(secondsLeft)}
          </Badge>
        ) : null}
      </div>

      {startError ? (
        <Card className="space-y-2 p-3 text-sm text-app-text">
          <p>{startError}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void begin()}>
            Try again
          </Button>
        </Card>
      ) : null}

      {session && currentFen ? (
        <div className="mx-auto w-full max-w-[380px]">
          <PracticeBoard
            key={`${moves.length}-${resetNonce}`}
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
      ) : null}

      {wrong ? (
        <Card className="flex items-center gap-2 border-app-danger/40 p-2.5 text-sm text-app-danger-ink">
          <XCircle className="size-4 shrink-0" strokeWidth={2.5} />
          Not the move — try again.
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
              : `Score ${result.scorePercent}%. Full line:`}
            {!result.solved ? (
              <span className="mt-1 block">
                {result.solutionMoves.map((m) => m.san).join(" ")}
              </span>
            ) : null}
          </span>
        </Card>
      ) : (
        <p className="text-sm font-medium text-app-muted">
          {session?.studentColor === "white" ? "White" : "Black"} to move
        </p>
      )}

      <div className="flex flex-wrap gap-2">
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
  );
}

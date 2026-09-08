"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Puzzle as PuzzleIcon } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import {
  PUZZLE_DIFFICULTY_LABELS,
  difficultyBadgeVariant
} from "@/features/puzzles/lib/puzzleMeta";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { formatClock, useCountdown } from "../../hooks/useCountdown";
import { useEndLivePuzzle, useLivePuzzleLeaderboard } from "../../hooks/useLivePuzzle";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { InRoomPuzzleSolver } from "./InRoomPuzzleSolver";
import { PuzzleAssignModal } from "./PuzzleAssignModal";

export function MeetingPuzzlePanel() {
  const params = useParams();
  const classId = (params?.roomId as string) ?? "";
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);

  const { activePuzzle } = useLiveClassState();
  const [assignOpen, setAssignOpen] = useState(false);
  const [solveOpen, setSolveOpen] = useState(false);
  const endPuzzle = useEndLivePuzzle(classId);
  const leaderboard = useLivePuzzleLeaderboard(classId, !!activePuzzle);
  const { secondsLeft, expired } = useCountdown(activePuzzle?.endsAt);
  // The timer running out ends the puzzle from `PuzzleBridge` (always mounted).

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      {!activePuzzle ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <PuzzleIcon className="size-8 text-app-muted" />
          <p className="text-sm text-app-muted">
            {isCoach
              ? "Share a puzzle for everyone in the class to solve."
              : "No puzzle right now. Your coach will share one when it's time."}
          </p>
          {isCoach ? (
            <Button type="button" size="sm" onClick={() => setAssignOpen(true)}>
              Share a puzzle
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <Card className="space-y-2 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-app-text">{activePuzzle.title}</p>
              {secondsLeft !== null ? (
                <Badge variant={expired || secondsLeft <= 30 ? "destructive" : "outline"}>
                  {expired ? "Time's up" : formatClock(secondsLeft)}
                </Badge>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary">{activePuzzle.topicName}</Badge>
              <Badge variant={difficultyBadgeVariant(activePuzzle.difficulty)}>
                {PUZZLE_DIFFICULTY_LABELS[activePuzzle.difficulty]}
              </Badge>
              <Badge variant="outline">
                {activePuzzle.sideToMove === "white" ? "White" : "Black"} to move
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {isCoach ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAssignOpen(true)}
                  >
                    Swap puzzle
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => endPuzzle.mutate()}
                    disabled={endPuzzle.isPending}
                  >
                    End puzzle
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setSolveOpen(true)}
                  disabled={expired}
                >
                  {expired ? "Time's up" : "Solve"}
                </Button>
              )}
            </div>
          </Card>

          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-app-muted">
              Leaderboard
            </p>
            {!activePuzzle.revealLeaderboard && !isCoach ? (
              <p className="mb-1.5 text-xs text-app-muted">
                Your coach has hidden the leaderboard — you can still see your own result.
              </p>
            ) : null}
            {leaderboard.data && leaderboard.data.entries.length > 0 ? (
              <ol className="space-y-1">
                {leaderboard.data.entries.map((entry) => (
                  <li
                    key={entry.studentId}
                    className={`flex items-center justify-between gap-2 rounded-app border border-app-border px-2.5 py-1.5 text-sm ${
                      entry.isSelf ? "bg-primary/[0.08]" : "bg-app-surface"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="w-4 shrink-0 font-bold text-app-muted">{entry.rank}</span>
                      <span className="truncate text-app-text">{entry.studentName}</span>
                      {entry.solved ? (
                        <CheckCircle2 className="size-3.5 shrink-0 text-accent-ink" strokeWidth={2.5} />
                      ) : null}
                    </span>
                    <span className="shrink-0 tabular-nums text-app-muted">
                      {entry.scorePercent}% · {entry.durationSeconds}s
                      {entry.hintsUsed > 0 ? ` · ${entry.hintsUsed}💡` : ""}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-app-muted">No finishes yet.</p>
            )}
            {leaderboard.data && leaderboard.data.solvingCount > 0 ? (
              <p className="mt-1.5 text-xs text-app-muted">
                {leaderboard.data.solvingCount} still solving
              </p>
            ) : null}
          </div>
        </>
      )}

      {isCoach ? (
        <PuzzleAssignModal classId={classId} open={assignOpen} onOpenChange={setAssignOpen} />
      ) : null}

      {activePuzzle && !isCoach ? (
        <Dialog open={solveOpen} onOpenChange={setSolveOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Solve the puzzle</DialogTitle>
            </DialogHeader>
            <InRoomPuzzleSolver
              classId={classId}
              puzzle={activePuzzle}
              onClose={() => setSolveOpen(false)}
            />
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

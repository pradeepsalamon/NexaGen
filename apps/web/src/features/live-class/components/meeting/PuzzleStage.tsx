"use client";

import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Crown, Puzzle as PuzzleIcon } from "lucide-react";
import { getPuzzle } from "@/features/puzzles/api/puzzleApi";
import { PuzzleSolver } from "@/features/puzzles/components/solver/PuzzleSolver";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/Button";
import { useGuestLivePuzzle } from "../../hooks/useLivePuzzle";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { useDemoGuestToken } from "../../providers/LiveRoomContext";
import { InRoomPuzzleSolver } from "./InRoomPuzzleSolver";
import { EndPuzzleButton, PuzzleTimerBadge } from "./PuzzleSessionControls";
import { useRoomClassId } from "../../providers/LiveRoomContext";

/**
 * The coach's own copy of the class puzzle, to check it plays as intended.
 * Solved client-side only — no attempt is created, so the coach never lands on
 * the leaderboard — and independent of the shared main board.
 */
function CoachPuzzlePreview({ puzzleId }: { puzzleId: string }) {
  const detail = useQuery({
    queryKey: queryKeys.puzzles.detail(puzzleId),
    queryFn: () => getPuzzle(puzzleId).then((r) => r.puzzle)
  });
  const puzzle = detail.data;
  if (!puzzle) {
    return (
      <p className="py-10 text-center text-sm text-app-muted">
        {detail.isError ? "Couldn't load the puzzle." : "Loading…"}
      </p>
    );
  }
  return (
    <div className="mx-auto w-full max-w-3xl overflow-y-auto">
      <PuzzleSolver
        fen={puzzle.fen}
        orientation={puzzle.orientation}
        solutionMoves={puzzle.solutionMoves ?? []}
        hints={puzzle.hints}
        explanation={puzzle.explanation}
      />
    </div>
  );
}

/**
 * A demo guest's copy of the class puzzle. A guest is not a user, so it can't
 * own a server-scored attempt: like the coach's preview it is solved
 * client-side, from the solution the guest route sends, and never scored.
 */
function GuestPuzzlePractice({ classId, guestToken, assignmentId }: { classId: string; guestToken: string; assignmentId: string }) {
  const query = useGuestLivePuzzle(classId, guestToken);
  const data = query.data;
  // The packet can land before the refetch it triggers: wait for the same assignment.
  const current = data?.assignment?.id === assignmentId ? data : null;
  if (!current?.assignment || !current.solution) {
    if (query.isError || (data && !query.isFetching)) {
      return (
        <div className="mx-auto flex max-w-sm flex-col items-center gap-3 py-10 text-center text-sm text-app-muted">
          <p>{query.error instanceof Error ? query.error.message : "Couldn't load the puzzle."}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      );
    }
    return <p className="py-10 text-center text-sm text-app-muted">Loading…</p>;
  }
  return (
    <div className="mx-auto w-full max-w-3xl space-y-2 overflow-y-auto">
      <p className="text-center text-xs text-app-muted">Practice puzzle — guests aren&apos;t scored or ranked.</p>
      <PuzzleSolver
        fen={current.assignment.fen}
        orientation={current.assignment.orientation}
        solutionMoves={current.solution.solutionMoves}
        hints={current.solution.hints}
        explanation={current.solution.explanation}
      />
    </div>
  );
}

/**
 * The class puzzle as the main stage, in place of the shared board (desktop
 * `ClassroomLayout`, phone `MeetingVideoGrid`). Open while `puzzleSolverOpen`
 * is set, so only one board ever drives the attempt. A coach (desktop "Activity"
 * tab) gets a practice copy instead of an attempt.
 */
export function PuzzleStage({ stageSwitch, className }: { stageSwitch?: ReactNode; className?: string }) {
  const classId = useRoomClassId();
  const { activePuzzle, setPuzzleSolverOpen } = useLiveClassState(
    "activePuzzle",
    "setPuzzleSolverOpen",
  );
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);
  const guestToken = useDemoGuestToken();
  if (!activePuzzle) return null;

  return (
    <section className={cn("relative flex min-h-0 min-w-0 flex-1 flex-col gap-2", className)}>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-semibold text-app-text">
          <PuzzleIcon className="size-4 shrink-0 text-primary-ink" strokeWidth={2.5} />
          <span className="truncate">{activePuzzle.title}</span>
        </div>
        <PuzzleTimerBadge endsAt={activePuzzle.endsAt} />
        {isCoach ? <EndPuzzleButton classId={classId} /> : null}
        <button
          type="button"
          onClick={() => setPuzzleSolverOpen(false)}
          className="flex shrink-0 items-center gap-1 rounded-full border border-app-border bg-app-surface px-2.5 py-1 text-[11px] font-semibold text-app-text shadow-card transition hover:bg-app-soft active:scale-95"
        >
          <Crown className="size-3 text-secondary-ink" strokeWidth={2.5} />
          Back to board
        </button>
        {stageSwitch}
      </div>
      {/* Keyed by assignment so a swapped puzzle starts a fresh attempt. */}
      {guestToken ? (
        <GuestPuzzlePractice
          key={activePuzzle.id}
          classId={classId}
          guestToken={guestToken}
          assignmentId={activePuzzle.id}
        />
      ) : isCoach ? (
        <CoachPuzzlePreview key={activePuzzle.id} puzzleId={activePuzzle.puzzleId} />
      ) : (
        <InRoomPuzzleSolver
          key={activePuzzle.id}
          classId={classId}
          puzzle={activePuzzle}
          onClose={() => setPuzzleSolverOpen(false)}
        />
      )}
    </section>
  );
}

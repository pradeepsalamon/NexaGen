"use client";

import type { ReactNode } from "react";
import { Crown, Puzzle as PuzzleIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { InRoomPuzzleSolver } from "./InRoomPuzzleSolver";

/**
 * The student's class puzzle as the main stage, in place of the shared board
 * (desktop `ClassroomLayout`, phone `MeetingVideoGrid`). Open while
 * `puzzleSolverOpen` is set, so only one board ever drives the attempt.
 */
export function PuzzleStage({ stageSwitch, className }: { stageSwitch?: ReactNode; className?: string }) {
  const params = useParams();
  const classId = (params?.roomId as string) ?? "";
  const { activePuzzle, setPuzzleSolverOpen } = useLiveClassState();
  if (!activePuzzle) return null;

  return (
    <section className={cn("relative flex min-h-0 min-w-0 flex-1 flex-col gap-2", className)}>
      <div className="flex shrink-0 items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-semibold text-app-text">
          <PuzzleIcon className="size-4 shrink-0 text-primary-ink" strokeWidth={2.5} />
          <span className="truncate">{activePuzzle.title}</span>
        </div>
        <button
          type="button"
          onClick={() => setPuzzleSolverOpen(false)}
          className="flex shrink-0 items-center gap-1 rounded-full border border-app-border bg-app-surface px-2.5 py-1 text-[11px] font-semibold text-app-text shadow-card transition hover:bg-app-soft active:scale-95"
        >
          <Crown className="size-3 text-amber-500" strokeWidth={2.5} />
          Back to board
        </button>
        {stageSwitch}
      </div>
      {/* Keyed by assignment so a swapped puzzle starts a fresh attempt. */}
      <InRoomPuzzleSolver
        key={activePuzzle.id}
        classId={classId}
        puzzle={activePuzzle}
        onClose={() => setPuzzleSolverOpen(false)}
      />
    </section>
  );
}

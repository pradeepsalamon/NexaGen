"use client";

import { useState } from "react";
import { Loader2, Square, Timer } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/AlertDialog";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { formatClock, useCountdown } from "../../hooks/useCountdown";
import { useEndLivePuzzle } from "../../hooks/useLivePuzzle";

/** At or under this many seconds the badge turns amber. */
const LOW_TIME_SECONDS = 60;

/**
 * "⏱ 02:59 Remaining" for a timed class puzzle — the same value for every
 * participant, derived from the assignment's server `endsAt` and the server
 * clock (`useCountdown`). Renders nothing for an untimed puzzle.
 */
export function PuzzleTimerBadge({
  endsAt,
  compact = false,
  className
}: {
  endsAt: string | null | undefined;
  /** Just the clock, for tight spots (grid tile, panel card). */
  compact?: boolean;
  className?: string;
}) {
  const { secondsLeft, expired } = useCountdown(endsAt);
  if (secondsLeft === null) return null;
  const low = !expired && secondsLeft <= LOW_TIME_SECONDS;
  const label = expired ? "Time expired" : "Remaining";

  return (
    <span
      role="timer"
      aria-live="off"
      aria-label={expired ? "Puzzle time expired" : `${formatClock(secondsLeft)} remaining`}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold tabular-nums leading-none",
        expired
          ? "border-app-danger/40 bg-app-danger/10 text-app-danger-ink"
          : low
            ? "border-warning/50 bg-warning/15 text-warning-ink"
            : "border-info/40 bg-info/10 text-info-ink",
        className
      )}
    >
      <Timer className="size-3.5" strokeWidth={2.5} aria-hidden />
      <span className="text-[13px]">{formatClock(secondsLeft)}</span>
      {compact ? null : <span className="hidden font-medium sm:inline">{label}</span>}
    </span>
  );
}

/**
 * Coach-only "End puzzle" with a confirmation. Callers render it only for a
 * class manager; the API (`LiveClassPuzzleService.end` → `resolveClassManager`)
 * is what actually enforces it, and ends the puzzle exactly once however many
 * requests race.
 */
export function EndPuzzleButton({
  classId,
  size = "sm",
  className
}: {
  classId: string;
  size?: "sm" | "default";
  className?: string;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const endPuzzle = useEndLivePuzzle(classId);

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        size={size}
        className={cn("shrink-0", className)}
        disabled={endPuzzle.isPending}
        onClick={() => setConfirmOpen(true)}
      >
        {endPuzzle.isPending ? (
          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
        ) : (
          <Square className="mr-1.5 size-3.5 fill-current" strokeWidth={2.5} />
        )}
        End puzzle
      </Button>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this puzzle?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to end the current puzzle for all participants?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => endPuzzle.mutate()}>End Puzzle</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

"use client";

import type { CSSProperties } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Clock, Puzzle as PuzzleIcon, Trophy } from "lucide-react";
import { useParams } from "next/navigation";
import type { LivePuzzleAssignment } from "@nexa-chess/types";
import { cn } from "@/lib/utils";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { formatClock, useCountdown } from "../../../hooks/useCountdown";
import { useLivePuzzleLeaderboard } from "../../../hooks/useLivePuzzle";
import { useLiveClassState } from "../../../providers/LiveClassProvider";
import { PuzzleBoardTile } from "../PuzzleBoardTile";

/**
 * The shared puzzle as a tile in the video grid — like the shared board tile —
 * so a student can't miss it and gets to it in one tap. Students see their own
 * status (solve / continue / solved + points / tries left); the coach sees the
 * class's progress and opens the Puzzle panel.
 */
export function PuzzleGridTile({
  puzzle,
  style,
}: {
  puzzle: LivePuzzleAssignment;
  style?: CSSProperties;
}) {
  const params = useParams();
  const classId = (params?.roomId as string) ?? "";
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);
  const { setActiveSidebar, setPuzzleSolverOpen } = useLiveClassState();
  // Same query key as the Puzzle panel, so the two share one poll.
  const leaderboard = useLivePuzzleLeaderboard(classId, true);
  const { secondsLeft, expired } = useCountdown(puzzle.endsAt);

  const data = leaderboard.data;
  const self = data?.self ?? null;
  const outOfTries = !!self && self.attemptsLeft === 0 && !self.inProgress;
  const solvedCount = data?.entries.filter((e) => e.solved).length ?? 0;
  const finishedCount = data?.entries.filter((e) => e.attemptsUsed > 0).length ?? 0;
  const solvingCount = data?.stillSolving.length ?? 0;
  const notStartedCount = data?.notStarted.length ?? 0;

  let action: string;
  let actionDisabled = false;
  if (isCoach) {
    action = "Open leaderboard";
  } else if (expired) {
    action = "Time's up";
    actionDisabled = true;
  } else if (self?.inProgress) {
    action = "Continue solving";
  } else if (self?.solved) {
    action = outOfTries ? "Solved" : "Try again";
    actionDisabled = outOfTries;
  } else if (outOfTries) {
    action = "No tries left";
    actionDisabled = true;
  } else if (self && self.attemptsUsed > 0) {
    action = "Try again";
  } else {
    action = "Solve now";
  }

  const open = () => {
    if (isCoach || actionDisabled) {
      setActiveSidebar("puzzle");
      return;
    }
    setPuzzleSolverOpen(true);
  };

  return (
    <motion.div
      key="puzzle-tile"
      layout
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.94 }}
      transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
      className="group relative flex aspect-video overflow-hidden rounded-app border-2 border-primary/50 bg-app-surface shadow-card"
      style={{ containerType: "size", ...style }}
    >
      <button
        type="button"
        onClick={open}
        aria-label={isCoach ? `Open the leaderboard for ${puzzle.title}` : `${action}: ${puzzle.title}`}
        className="flex h-full w-full items-stretch gap-[3cqw] p-[3cqh] text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-app-focus"
      >
        {/* Starting position — the largest square that fits the tile height. */}
        <div className="shrink-0 self-center" style={{ width: "min(94cqh, 52cqw)" }}>
          <PuzzleBoardTile fen={puzzle.fen} orientation={puzzle.orientation} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-between gap-1 py-0.5">
          <div className="min-w-0 space-y-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-ink">
              <PuzzleIcon className="size-3" strokeWidth={2.5} />
              Class puzzle
            </span>
            <p className="line-clamp-2 text-sm font-semibold leading-tight text-app-text">
              {puzzle.title}
            </p>
            <p className="text-xs text-app-muted">
              {puzzle.sideToMove === "white" ? "White" : "Black"} to move · {puzzle.scoring.basePoints} pts
            </p>
            {secondsLeft !== null ? (
              <p
                className={cn(
                  "inline-flex items-center gap-1 text-xs font-semibold tabular-nums",
                  expired || secondsLeft <= 30 ? "text-app-danger" : "text-app-muted",
                )}
              >
                <Clock className="size-3" strokeWidth={2.5} />
                {expired ? "Time's up" : formatClock(secondsLeft)}
              </p>
            ) : null}
          </div>

          <div className="min-w-0 space-y-1">
            {isCoach ? (
              <p className="text-[11px] leading-snug text-app-muted">
                <span className="font-semibold text-app-text">{solvedCount}</span> solved ·{" "}
                {finishedCount - solvedCount > 0 ? `${finishedCount - solvedCount} missed · ` : ""}
                {solvingCount} solving · {notStartedCount} not started
              </p>
            ) : self?.solved || (self && self.attemptsUsed > 0) ? (
              <p className="flex items-center gap-1 text-[11px] text-app-muted">
                {self.solved ? (
                  <CheckCircle2 className="size-3 text-accent-ink" strokeWidth={2.5} />
                ) : null}
                {self.points !== null ? `${self.points} pts` : ""}
                {self.rank !== null ? (
                  <>
                    <Trophy className="ml-1 size-3" strokeWidth={2.5} />#{self.rank}
                  </>
                ) : null}
                {self.attemptsLeft !== null && self.attemptsLeft > 0
                  ? ` · ${self.attemptsLeft} ${self.attemptsLeft === 1 ? "try" : "tries"} left`
                  : ""}
              </p>
            ) : null}
            <span
              className={cn(
                "inline-flex min-h-8 w-full items-center justify-center rounded-control px-3 text-xs font-bold transition",
                actionDisabled
                  ? "bg-app-soft text-app-muted"
                  : "bg-primary text-white group-hover:bg-[color-mix(in_srgb,var(--color-primary)_88%,black)]",
              )}
            >
              {action}
            </span>
          </div>
        </div>
      </button>
    </motion.div>
  );
}

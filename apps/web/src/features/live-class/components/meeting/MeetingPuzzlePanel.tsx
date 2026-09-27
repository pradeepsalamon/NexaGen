"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, LayoutGrid, PlusCircle, Puzzle as PuzzleIcon, SlidersHorizontal } from "lucide-react";
import type {
  LivePuzzleLeaderboardEntry,
  LivePuzzleLeaderboardResponse,
  PuzzleLeaderboardOptions,
  PuzzleScoring
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import {
  PuzzleLeaderboardFields,
  PuzzleScoringFields,
  PuzzleScoringPreview
} from "@/features/puzzles/components/scoring/PuzzleScoringFields";
import {
  PUZZLE_DIFFICULTY_LABELS,
  difficultyBadgeVariant
} from "@/features/puzzles/lib/puzzleMeta";
import { cn } from "@/lib/utils";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { formatClock, useCountdown } from "../../hooks/useCountdown";
import {
  useAdjustLivePuzzlePoints,
  useEndLivePuzzle,
  useLivePuzzleLeaderboard,
  useUpdateLivePuzzle
} from "../../hooks/useLivePuzzle";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { PuzzleAssignModal } from "./PuzzleAssignModal";
import { PuzzleLiveBoardsPanel } from "./PuzzleLiveBoardsPanel";

/** Coach-only: manual +/- points for one student (a verbal answer, a bonus, a deduction). */
function AdjustPointsPopover({
  classId,
  entry
}: {
  classId: string;
  entry: LivePuzzleLeaderboardEntry;
}) {
  const adjust = useAdjustLivePuzzlePoints(classId);
  const [custom, setCustom] = useState("");
  const current = entry.breakdown.adjustment;
  const label = `Adjust ${entry.studentName}'s points`;

  const apply = (delta: number, replace = false) =>
    adjust.mutate({ delta, replace, studentId: entry.studentId });

  return (
    <Popover>
      <SimpleTooltip label={label}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={label}
            className="grid size-7 shrink-0 place-items-center rounded-full border border-app-border p-0 text-app-muted transition-colors hover:bg-primary hover:text-white"
          >
            <PlusCircle className="size-3.5" strokeWidth={2.5} />
          </button>
        </PopoverTrigger>
      </SimpleTooltip>
      <PopoverContent align="end" className="w-60 space-y-2 p-3">
        <p className="text-xs font-semibold text-app-text">{entry.studentName}</p>
        <p className="text-xs text-app-muted">
          Manual adjustment: {current > 0 ? `+${current}` : current} pts
        </p>
        <div className="grid grid-cols-4 gap-1">
          {[-10, -5, 5, 10].map((delta) => (
            <Button
              key={delta}
              type="button"
              size="sm"
              variant="outline"
              className="min-h-8 px-0 text-xs"
              disabled={adjust.isPending}
              onClick={() => apply(delta)}
            >
              {delta > 0 ? `+${delta}` : delta}
            </Button>
          ))}
        </div>
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Math.trunc(Number(custom));
            if (!Number.isFinite(n) || n === 0) return;
            apply(n);
            setCustom("");
          }}
        >
          <Input
            type="number"
            inputMode="numeric"
            aria-label="Custom points to add"
            placeholder="±points"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className="min-h-8"
          />
          <Button type="submit" size="sm" className="min-h-8" disabled={adjust.isPending}>
            Add
          </Button>
        </form>
        {current !== 0 ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="min-h-8 w-full text-xs"
            onClick={() => apply(0, true)}
          >
            Clear adjustment
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function pointsLabel(entry: LivePuzzleLeaderboardEntry, rankByPoints: boolean) {
  return rankByPoints ? `${entry.points} pts` : `${entry.scorePercent}%`;
}

function LeaderboardList({
  classId,
  data,
  isCoach
}: {
  classId: string;
  data: LivePuzzleLeaderboardResponse;
  isCoach: boolean;
}) {
  const options = data.leaderboard;
  const rankByPoints = (options?.rankBy ?? "POINTS") === "POINTS";
  const showStats = isCoach || (options?.showStats ?? true);

  if (data.entries.length === 0) {
    return <p className="text-sm text-app-muted">No finishes yet.</p>;
  }

  return (
    <ol className="space-y-1">
      {data.entries.map((entry) => (
        <li
          key={entry.studentId}
          className={cn(
            "rounded-app border border-app-border px-2.5 py-1.5 text-sm",
            entry.isSelf ? "bg-primary/[0.08]" : "bg-app-surface"
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="w-5 shrink-0 font-bold text-app-muted">{entry.rank}</span>
              <span className="truncate text-app-text">{entry.studentName}</span>
              {entry.solved ? (
                <CheckCircle2 className="size-3.5 shrink-0 text-accent-ink" strokeWidth={2.5} />
              ) : null}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <span className="font-semibold tabular-nums text-app-text">
                {pointsLabel(entry, rankByPoints)}
              </span>
              {isCoach ? <AdjustPointsPopover classId={classId} entry={entry} /> : null}
            </span>
          </div>
          {showStats ? (
            <p className="mt-0.5 pl-7 text-[11px] tabular-nums text-app-muted">
              {rankByPoints ? `${entry.scorePercent}% · ` : ""}
              {entry.durationSeconds}s
              {entry.wrongMoves > 0 ? ` · ${entry.wrongMoves} wrong` : ""}
              {entry.hintsUsed > 0 ? ` · ${entry.hintsUsed} hint${entry.hintsUsed === 1 ? "" : "s"}` : ""}
              {entry.attemptsUsed > 1 ? ` · ${entry.attemptsUsed} tries` : ""}
              {entry.breakdown.firstSolveBonus > 0 ? ` · +${entry.breakdown.firstSolveBonus} first` : ""}
              {entry.breakdown.speedBonus > 0 ? ` · +${entry.breakdown.speedBonus} speed` : ""}
              {entry.breakdown.adjustment !== 0
                ? ` · ${entry.breakdown.adjustment > 0 ? "+" : ""}${entry.breakdown.adjustment} coach`
                : ""}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

/** Mid-class: the coach edits the running puzzle's points / leaderboard rules. */
function EditRulesDialog({
  classId,
  open,
  onOpenChange,
  scoring,
  leaderboard
}: {
  classId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scoring: PuzzleScoring;
  leaderboard: PuzzleLeaderboardOptions;
}) {
  const update = useUpdateLivePuzzle(classId);
  const [draftScoring, setDraftScoring] = useState(scoring);
  const [draftLeaderboard, setDraftLeaderboard] = useState(leaderboard);

  useEffect(() => {
    if (!open) return;
    setDraftScoring(scoring);
    setDraftLeaderboard(leaderboard);
  }, [open, scoring, leaderboard]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Points &amp; leaderboard</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          <PuzzleScoringFields idPrefix="edit-scoring" value={draftScoring} onChange={setDraftScoring} />
          <PuzzleScoringPreview scoring={draftScoring} />
          <PuzzleLeaderboardFields
            idPrefix="edit-lb"
            value={draftLeaderboard}
            onChange={setDraftLeaderboard}
          />
          <p className="text-xs text-app-muted">
            Saving recalculates everyone&apos;s points, including students who already finished.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            isLoading={update.isPending}
            onClick={() =>
              update.mutate(
                { leaderboard: draftLeaderboard, scoring: draftScoring },
                { onSuccess: () => onOpenChange(false) }
              )
            }
          >
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function studentLeaderboardNote(data: LivePuzzleLeaderboardResponse): string | null {
  const options = data.leaderboard;
  if (!options) return null;
  if (options.visibility === "HIDDEN") {
    return "Your coach keeps this leaderboard private — you can see your own result.";
  }
  if (options.visibility === "AFTER_END" && data.active) {
    return "The full leaderboard appears when the puzzle ends.";
  }
  if (options.topN !== null) return `Showing the top ${options.topN}.`;
  return null;
}

export function MeetingPuzzlePanel() {
  const params = useParams();
  const classId = (params?.roomId as string) ?? "";
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);

  const { activePuzzle, setPuzzleSolverOpen } = useLiveClassState();
  const [assignOpen, setAssignOpen] = useState(false);
  const [boardsOpen, setBoardsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const endPuzzle = useEndLivePuzzle(classId);
  // Always on while the panel is open: after a puzzle ends it still shows the
  // last results (that's when an AFTER_END board is revealed).
  const leaderboard = useLivePuzzleLeaderboard(classId, true);
  const { secondsLeft, expired } = useCountdown(activePuzzle?.endsAt);
  // The timer running out ends the puzzle from `PuzzleBridge` (always mounted).

  const data = leaderboard.data;
  const self = data?.self ?? null;
  const outOfTries = !!self && self.attemptsLeft === 0 && !self.inProgress;
  const solveLabel = expired
    ? "Time's up"
    : self?.inProgress
      ? "Continue solving"
      : outOfTries
        ? self?.solved
          ? "Solved"
          : "No tries left"
        : self && self.attemptsUsed > 0
          ? "Try again"
          : "Solve";
  const note = data && !isCoach ? studentLeaderboardNote(data) : null;
  const lastResults = !activePuzzle && data?.assignmentId ? data : null;

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      {!activePuzzle ? (
        <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
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
            <Badge variant="outline">{activePuzzle.scoring.basePoints} pts</Badge>
            {activePuzzle.scoring.wrongMovePenalty > 0 ? (
              <Badge variant="outline">−{activePuzzle.scoring.wrongMovePenalty} / wrong move</Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {isCoach ? (
              <>
                <Button type="button" variant="outline" size="sm" onClick={() => setBoardsOpen(true)}>
                  <LayoutGrid className="mr-1.5 size-3.5" strokeWidth={2.5} />
                  Live boards
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setRulesOpen(true)}>
                  <SlidersHorizontal className="mr-1.5 size-3.5" strokeWidth={2.5} />
                  Edit points
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setAssignOpen(true)}>
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
              <>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setPuzzleSolverOpen(true)}
                  disabled={expired || outOfTries}
                >
                  {solveLabel}
                </Button>
                {self && self.points !== null ? (
                  <span className="self-center text-xs text-app-muted">
                    Your points: <strong className="text-app-text">{self.points}</strong>
                    {self.rank !== null ? ` · #${self.rank}` : ""}
                    {self.attemptsLeft !== null && self.attemptsLeft > 0
                      ? ` · ${self.attemptsLeft} ${self.attemptsLeft === 1 ? "try" : "tries"} left`
                      : ""}
                  </span>
                ) : null}
              </>
            )}
          </div>
        </Card>
      )}

      {activePuzzle || lastResults ? (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-app-muted">
            {activePuzzle ? "Leaderboard" : `Last puzzle — ${lastResults?.title ?? ""}`}
          </p>
          {note ? <p className="mb-1.5 text-xs text-app-muted">{note}</p> : null}
          {data ? <LeaderboardList classId={classId} data={data} isCoach={isCoach} /> : null}
          {data && data.stillSolving.length > 0 ? (
            <p className="mt-1.5 truncate text-xs text-app-muted">
              Still solving: {data.stillSolving.map((s) => s.studentName).join(", ")}
            </p>
          ) : null}
          {isCoach && data && data.notStarted.length > 0 ? (
            <p className="mt-1 truncate text-xs text-app-muted">
              Not started: {data.notStarted.map((s) => s.studentName).join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {isCoach ? (
        <PuzzleAssignModal classId={classId} open={assignOpen} onOpenChange={setAssignOpen} />
      ) : null}

      {isCoach ? (
        <PuzzleLiveBoardsPanel classId={classId} open={boardsOpen} onOpenChange={setBoardsOpen} />
      ) : null}

      {isCoach && activePuzzle ? (
        <EditRulesDialog
          classId={classId}
          open={rulesOpen}
          onOpenChange={setRulesOpen}
          scoring={activePuzzle.scoring}
          leaderboard={activePuzzle.leaderboard}
        />
      ) : null}
    </div>
  );
}

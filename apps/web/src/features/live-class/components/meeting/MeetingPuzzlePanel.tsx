"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Inbox, LayoutGrid, Medal, Pencil, PlusCircle, Puzzle as PuzzleIcon } from "lucide-react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
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
  useAdjustClassLeaderboard,
  useAdjustLivePuzzlePoints,
  useClassLeaderboard,
  useEndLivePuzzle,
  useLivePuzzleLeaderboard,
  useUpdateLivePuzzle
} from "../../hooks/useLivePuzzle";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { PuzzleAssignModal } from "./PuzzleAssignModal";
import { PuzzleLiveBoardsPanel } from "./PuzzleLiveBoardsPanel";
import { Switch } from "@/components/ui/Switch";

/** Coach-only: manual +/- points for one student on the puzzle board. */
function AdjustPointsPopover({
  classId,
  entry
}: {
  classId: string;
  entry: LivePuzzleLeaderboardEntry;
}) {
  const adjust = useAdjustLivePuzzlePoints(classId);
  return (
    <AdjustPopover
      name={entry.studentName}
      current={entry.breakdown.adjustment}
      pending={adjust.isPending}
      onApply={(delta, replace) => adjust.mutate({ delta, replace, studentId: entry.studentId })}
    />
  );
}

/** Coach-only: manual +/- points for one student (a verbal answer, a bonus, a deduction). */
function AdjustPopover({
  name,
  current,
  pending,
  onApply
}: {
  name: string;
  current: number;
  pending: boolean;
  onApply: (delta: number, replace: boolean) => void;
}) {
  const [custom, setCustom] = useState("");
  const label = `Adjust ${name}'s points`;
  const apply = (delta: number, replace = false) => onApply(delta, replace);

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
        <p className="text-xs font-semibold text-app-text">{name}</p>
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
              disabled={pending}
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
          <Button type="submit" size="sm" className="min-h-8" disabled={pending}>
            Add
          </Button>
        </form>
        {current !== 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
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

function pointsValue(entry: LivePuzzleLeaderboardEntry, rankByPoints: boolean) {
  return rankByPoints ? String(entry.points) : `${entry.scorePercent}%`;
}

const MEDAL_TONE: Record<number, string> = {
  1: "text-amber-500",
  2: "text-slate-400",
  3: "text-orange-500"
};

/** Medal for the podium, plain number below it. */
function RankMark({ rank }: { rank: number }) {
  const tone = MEDAL_TONE[rank];
  if (!tone) {
    return <span className="inline-block w-6 text-center font-bold tabular-nums text-app-muted">{rank}</span>;
  }
  return (
    <span className="relative inline-flex size-6 items-center justify-center" aria-label={`Rank ${rank}`}>
      <Medal aria-hidden="true" className={cn("size-6", tone)} strokeWidth={2.25} />
      <span className="absolute top-[3px] text-[9px] font-extrabold text-app-text">{rank}</span>
    </span>
  );
}

function entryStats(entry: LivePuzzleLeaderboardEntry, rankByPoints: boolean) {
  return [
    rankByPoints ? `${entry.scorePercent}%` : null,
    `${entry.durationSeconds}s`,
    entry.wrongMoves > 0 ? `${entry.wrongMoves} wrong` : null,
    entry.hintsUsed > 0 ? `${entry.hintsUsed} hint${entry.hintsUsed === 1 ? "" : "s"}` : null,
    entry.breakdown.firstSolveBonus > 0 ? `+${entry.breakdown.firstSolveBonus} first` : null,
    entry.breakdown.speedBonus > 0 ? `+${entry.breakdown.speedBonus} speed` : null,
    entry.breakdown.adjustment !== 0
      ? `${entry.breakdown.adjustment > 0 ? "+" : ""}${entry.breakdown.adjustment} coach`
      : null
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Highlight card: the leader for a coach, the student's own standing for a student. */
function StandingCard({
  name,
  rank,
  points,
  attempts,
  pointsLabel
}: {
  name: string;
  rank: number | null;
  points: string;
  attempts: number;
  pointsLabel: string;
}) {
  return (
    <div className="rounded-app bg-app-soft p-3.5">
      <div className="flex items-center gap-3">
        {rank !== null ? (
          <RankMark rank={rank} />
        ) : (
          <Medal aria-hidden="true" className="size-6 text-app-muted" strokeWidth={2.25} />
        )}
        <span className="truncate text-base font-semibold text-app-text">{name}</span>
      </div>
      <dl className="mt-2.5 flex gap-8 text-sm">
        <div>
          <dt className="text-xs font-bold text-app-text">{pointsLabel}</dt>
          <dd className="tabular-nums text-app-text">{points}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold text-app-text">Attempts</dt>
          <dd className="tabular-nums text-app-text">{attempts}</dd>
        </div>
      </dl>
    </div>
  );
}

function LeaderboardSection({
  classId,
  data,
  isCoach,
  canEdit,
  onEditPoints
}: {
  classId: string;
  data: LivePuzzleLeaderboardResponse;
  isCoach: boolean;
  /** Coach with a running puzzle: the visibility toggle + Edit Points. */
  canEdit: boolean;
  onEditPoints: () => void;
}) {
  const options = data.leaderboard;
  const rankByPoints = (options?.rankBy ?? "POINTS") === "POINTS";
  const showStats = isCoach || (options?.showStats ?? true);
  const pointsLabel = rankByPoints ? "Points" : "Score";
  const update = useUpdateLivePuzzle(classId, { quiet: true });
  const visibleToStudents = (options?.visibility ?? "LIVE") === "LIVE";
  const user = useAuthStore((state) => state.user);

  const leader = data.entries[0] ?? null;
  const self = data.self;

  return (
    <div className="space-y-3">
      {canEdit ? (
        <div className="flex items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-app-text">
            <Switch
              checked={visibleToStudents}
              disabled={update.isPending}
              onCheckedChange={(checked) =>
                update.mutate({ leaderboard: { visibility: checked === true ? "LIVE" : "HIDDEN" } })
              }
            />
            Show leaderboard to students
          </label>
          <button
            type="button"
            onClick={onEditPoints}
            className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-app-text hover:text-primary-ink"
          >
            <Pencil aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
            Edit Points
          </button>
        </div>
      ) : null}

      {isCoach ? (
        leader ? (
          <StandingCard
            name={leader.studentName}
            rank={leader.rank}
            points={pointsValue(leader, rankByPoints)}
            attempts={leader.attemptsUsed}
            pointsLabel={pointsLabel}
          />
        ) : null
      ) : self ? (
        <StandingCard
          name={user ? `${user.firstName} ${user.lastName ?? ""}`.trim() : "You"}
          rank={self.rank}
          points={self.points !== null ? String(self.points) : "0"}
          attempts={self.attemptsUsed}
          pointsLabel="Points"
        />
      ) : null}

      <div className="overflow-hidden rounded-app border border-app-border">
        <Table>
          <TableHeader className="bg-app-soft">
            <TableRow>
              <TableHead className="h-10 w-20 px-3 text-xs">Position</TableHead>
              <TableHead className="h-10 px-2 text-xs">Name</TableHead>
              <TableHead className="h-10 px-2 text-right text-xs">{pointsLabel}</TableHead>
              <TableHead className="h-10 px-3 text-right text-xs">Attempts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.entries.map((entry) => (
              <TableRow key={entry.studentId} className={cn(entry.isSelf && "bg-primary/[0.08]")}>
                <TableCell className="px-3 py-2">
                  <RankMark rank={entry.rank} />
                </TableCell>
                <TableCell className="max-w-0 px-2 py-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-medium text-app-text">{entry.studentName}</span>
                    {entry.solved ? (
                      <CheckCircle2
                        aria-label="Solved"
                        className="size-3.5 shrink-0 text-accent-ink"
                        strokeWidth={2.5}
                      />
                    ) : null}
                  </span>
                  {showStats ? (
                    <span className="block truncate text-[11px] tabular-nums text-app-muted">
                      {entryStats(entry, rankByPoints)}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="px-2 py-2 text-right">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="font-semibold tabular-nums text-app-text">
                      {pointsValue(entry, rankByPoints)}
                    </span>
                    {isCoach ? <AdjustPointsPopover classId={classId} entry={entry} /> : null}
                  </span>
                </TableCell>
                <TableCell className="px-3 py-2 text-right tabular-nums text-app-text">
                  {entry.attemptsUsed}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {data.entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-app-muted">
            <Inbox aria-hidden="true" className="size-8 opacity-50" strokeWidth={1.75} />
            <span className="text-xs">No data yet</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Standings across every puzzle shared in this class; the coach can +/- anyone's total. */
function ClassLeaderboardSection({ classId, isCoach }: { classId: string; isCoach: boolean }) {
  const board = useClassLeaderboard(classId, true);
  const adjust = useAdjustClassLeaderboard(classId);
  const data = board.data;

  if (!data) {
    return <p className="py-6 text-center text-xs text-app-muted">Loading standings…</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-app-muted">
        {data.puzzleCount} {data.puzzleCount === 1 ? "puzzle" : "puzzles"} this class
        {!isCoach && data.puzzleCount < data.totalPuzzleCount
          ? " · hidden puzzles count once your coach reveals them"
          : ""}
      </p>
      <div className="overflow-hidden rounded-app border border-app-border">
        <Table>
          <TableHeader className="bg-app-soft">
            <TableRow>
              <TableHead className="h-10 w-20 px-3 text-xs">Position</TableHead>
              <TableHead className="h-10 px-2 text-xs">Name</TableHead>
              <TableHead className="h-10 px-2 text-right text-xs">Points</TableHead>
              <TableHead className="h-10 px-3 text-right text-xs">Solved</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.entries.map((entry) => (
              <TableRow key={entry.studentId} className={cn(entry.isSelf && "bg-primary/[0.08]")}>
                <TableCell className="px-3 py-2">
                  <RankMark rank={entry.rank} />
                </TableCell>
                <TableCell className="max-w-0 px-2 py-2">
                  <span className="block truncate font-medium text-app-text">{entry.studentName}</span>
                  {entry.adjustment !== 0 ? (
                    <span className="block truncate text-[11px] tabular-nums text-app-muted">
                      {entry.puzzlePoints} puzzles · {entry.adjustment > 0 ? "+" : ""}
                      {entry.adjustment} coach
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="px-2 py-2 text-right">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="font-semibold tabular-nums text-app-text">{entry.points}</span>
                    {isCoach ? (
                      <AdjustPopover
                        name={entry.studentName}
                        current={entry.adjustment}
                        pending={adjust.isPending}
                        onApply={(delta, replace) =>
                          adjust.mutate({ delta, replace, studentId: entry.studentId })
                        }
                      />
                    ) : null}
                  </span>
                </TableCell>
                <TableCell className="px-3 py-2 text-right tabular-nums text-app-text">
                  {entry.solvedCount}/{data.puzzleCount}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {data.entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-1.5 py-8 text-app-muted">
            <Inbox aria-hidden="true" className="size-8 opacity-50" strokeWidth={1.75} />
            <span className="text-xs">No students yet</span>
          </div>
        ) : null}
      </div>
    </div>
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
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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

  const { activePuzzle, setPuzzleSolverOpen } = useLiveClassState(
    "activePuzzle",
    "setPuzzleSolverOpen",
  );
  const [assignOpen, setAssignOpen] = useState(false);
  const [boardsOpen, setBoardsOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [boardView, setBoardView] = useState<"puzzle" | "class">("puzzle");
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
        <div role="tablist" aria-label="Leaderboard" className="flex rounded-full border border-app-border bg-app-surface p-0.5">
          {(
            [
              ["puzzle", "This puzzle"],
              ["class", "Whole class"]
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={boardView === id}
              onClick={() => setBoardView(id)}
              className={cn(
                "flex h-7 flex-1 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                boardView === id ? "bg-primary text-white" : "text-app-muted hover:text-app-text"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {(activePuzzle || lastResults) && boardView === "class" ? (
        <ClassLeaderboardSection classId={classId} isCoach={isCoach} />
      ) : null}

      {(activePuzzle || lastResults) && boardView === "puzzle" ? (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-app-muted">
            {activePuzzle ? "Leaderboard" : `Last puzzle — ${lastResults?.title ?? ""}`}
          </p>
          {note ? <p className="mb-1.5 text-xs text-app-muted">{note}</p> : null}
          {data ? (
            <LeaderboardSection
              classId={classId}
              data={data}
              isCoach={isCoach}
              canEdit={isCoach && !!activePuzzle}
              onEditPoints={() => setRulesOpen(true)}
            />
          ) : null}
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

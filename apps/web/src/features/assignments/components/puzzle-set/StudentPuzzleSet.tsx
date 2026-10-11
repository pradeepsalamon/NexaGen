"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  PUZZLE_SET_ITEM_STATUS_LABELS,
  type PuzzleSetItemResult,
  type StudentAssignmentItem,
  type StudentPuzzleSetProgress
} from "@nexa-chess/types";
import { CheckCircle2, Clock, Lightbulb, ListChecks, Play, RotateCcw, Target, Trophy, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { PUZZLE_DIFFICULTY_LABELS } from "@/features/puzzles/lib/puzzleMeta";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { ITEM_STATUS_VARIANT, formatPoints, formatSeconds } from "../../lib/puzzleSetFormat";
import { AssignmentPuzzleSolver } from "./AssignmentPuzzleSolver";
import { PuzzleSetLeaderboard } from "./PuzzleSetLeaderboard";
import { describeBreakdown } from "./PuzzleSetResults";

const STEP_STYLE: Record<PuzzleSetItemResult["status"], string> = {
  FAILED: "border-app-danger/50 bg-app-danger/10 text-app-danger-ink",
  IN_PROGRESS: "border-warning/50 bg-warning/10 text-warning-ink",
  NOT_STARTED: "border-app-border bg-app-surface text-app-text",
  SOLVED: "border-success/50 bg-success/10 text-success-ink"
};

/**
 * A student's PUZZLE_SET: one puzzle at a time with "Puzzle 4 of 10" progress,
 * their own results per puzzle, and the set's leaderboard. Progress lives on the
 * server (every move is saved), so leaving and coming back resumes where they
 * were — the first unfinished puzzle opens by default.
 */
export function StudentPuzzleSet({ assignment }: { assignment: StudentAssignmentItem }) {
  const set = assignment.puzzleSet;
  if (!set || set.puzzles.length === 0) {
    return (
      <Card className="p-6 sm:p-10">
        <EmptyState
          icon={Target}
          title="No puzzles in this set"
          description="Your coach hasn't added any puzzles yet, or they were removed. Check back later."
        />
      </Card>
    );
  }
  return <PuzzleSetPlayer assignmentId={assignment.id} set={set} />;
}

function PuzzleSetPlayer({ assignmentId, set }: { assignmentId: string; set: StudentPuzzleSetProgress }) {
  const queryClient = useQueryClient();
  const { self, puzzles } = set;
  const total = puzzles.length;

  const [position, setPosition] = useState<number | "results">(set.nextPosition ?? "results");
  // "solve" keeps the solver mounted until the student moves on, even after a
  // refetch marks the puzzle finished — so its result and review stay on screen.
  const [mode, setMode] = useState<"solve" | "review">(() => modeFor(self.items[set.nextPosition ?? 0]));

  const item = position === "results" ? null : self.items[position];
  const puzzle = position === "results" ? null : puzzles[position];

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.mineItem(assignmentId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.mine });
    void queryClient.invalidateQueries({ queryKey: queryKeys.assignments.mineLeaderboard(assignmentId) });
  }, [queryClient, assignmentId]);

  const goTo = useCallback(
    (next: number | "results") => {
      setPosition(next);
      setMode(next === "results" ? "review" : modeFor(self.items[next]));
    },
    [self.items]
  );

  // The next puzzle after this one still to finish, wrapping to any earlier one.
  const nextUnfinished = useMemo(() => {
    const from = typeof position === "number" ? position : -1;
    const order = [...self.items.slice(from + 1), ...self.items.slice(0, Math.max(0, from))];
    return order.find((i) => i.points === null)?.position ?? null;
  }, [self.items, position]);

  // A puzzle removed from the set while open: fall back to the overview.
  useEffect(() => {
    if (typeof position === "number" && position >= total) goTo("results");
  }, [position, total, goTo]);

  const solvedPct = Math.round((self.solvedCount / total) * 100);
  const finishedPct = Math.round((self.attemptedCount / total) * 100);

  return (
    <div className="space-y-4">
      {/* Progress */}
      <Card className="space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-bold text-app-text" aria-live="polite">
              {position === "results" ? "Your results" : `Puzzle ${position + 1} of ${total}`}
            </p>
            <p className="text-sm text-app-muted">
              {self.attemptedCount} of {total} done · {self.solvedCount} solved
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge variant="default" className="gap-1">
              <Trophy className="size-3.5" strokeWidth={2.5} />
              {self.points} / {self.maxPoints} pts
            </Badge>
            {self.rank !== null ? <Badge variant="secondary">Rank #{self.rank}</Badge> : null}
            <Badge variant="outline" className="gap-1">
              <Clock className="size-3.5" strokeWidth={2.5} />
              {formatSeconds(self.timeSpentSeconds)}
            </Badge>
          </div>
        </div>

        <div
          className="relative h-2.5 overflow-hidden rounded-full bg-app-soft"
          role="progressbar"
          aria-label="Puzzles finished"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={self.attemptedCount}
        >
          <div className="absolute inset-y-0 left-0 bg-primary/40 transition-[width]" style={{ width: `${finishedPct}%` }} />
          <div className="absolute inset-y-0 left-0 bg-success transition-[width]" style={{ width: `${solvedPct}%` }} />
        </div>

        {/* Stepper — every puzzle is reachable; the colour says how it went. */}
        <nav aria-label="Puzzles in this set" className="-mx-1 overflow-x-auto px-1 pb-1">
          <ol className="flex gap-1.5">
            {self.items.map((i) => (
              <li key={i.puzzleId}>
                <SimpleTooltip label={`${puzzles[i.position]?.title ?? "Puzzle"} — ${PUZZLE_SET_ITEM_STATUS_LABELS[i.status]}`}>
                  <button
                    type="button"
                    onClick={() => goTo(i.position)}
                    aria-current={position === i.position ? "step" : undefined}
                    aria-label={`Puzzle ${i.position + 1}: ${PUZZLE_SET_ITEM_STATUS_LABELS[i.status]}`}
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus",
                      STEP_STYLE[i.status],
                      position === i.position && "ring-2 ring-primary ring-offset-2 ring-offset-app-surface"
                    )}
                  >
                    {i.status === "SOLVED" ? (
                      <CheckCircle2 className="size-4" strokeWidth={2.5} />
                    ) : i.status === "FAILED" ? (
                      <XCircle className="size-4" strokeWidth={2.5} />
                    ) : (
                      i.position + 1
                    )}
                  </button>
                </SimpleTooltip>
              </li>
            ))}
            <li>
              <SimpleTooltip label="My results">
                <button
                  type="button"
                  onClick={() => goTo("results")}
                  aria-current={position === "results" ? "step" : undefined}
                  aria-label="My results"
                  className={cn(
                    "flex size-10 shrink-0 items-center justify-center rounded-full border border-app-border bg-app-surface text-app-text transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus",
                    position === "results" && "ring-2 ring-primary ring-offset-2 ring-offset-app-surface"
                  )}
                >
                  <ListChecks className="size-4" strokeWidth={2.5} />
                </button>
              </SimpleTooltip>
            </li>
          </ol>
        </nav>

        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-app-muted">
          <span>
            {set.triesPerPuzzle === null
              ? "Unlimited tries per puzzle — your best one counts."
              : `${set.triesPerPuzzle} ${set.triesPerPuzzle === 1 ? "try" : "tries"} per puzzle — your best one counts.`}
          </span>
          <span className="inline-flex items-center gap-1">
            <Lightbulb className="size-3.5" strokeWidth={2.5} />
            {set.allowHints ? "Hints allowed (they cost points)." : "No hints for this set."}
          </span>
        </p>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {position === "results" || !item || !puzzle ? (
            <MyResults
              items={self.items}
              puzzleTitles={puzzles.map((p) => p.title)}
              onOpen={goTo}
              allDone={set.nextPosition === null}
            />
          ) : (
            <Card className="p-4 sm:p-6">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-app-text">{puzzle.title}</h2>
                <Badge variant="outline">{PUZZLE_DIFFICULTY_LABELS[puzzle.difficulty]}</Badge>
                <span className="text-xs text-app-muted">
                  up to {puzzle.maxPoints} pts
                  {triesLabel(item)}
                </span>
              </div>

              {mode === "solve" ? (
                <AssignmentPuzzleSolver
                  key={puzzle.puzzleId}
                  assignmentId={assignmentId}
                  puzzleId={puzzle.puzzleId}
                  triesLeft={item.triesLeft}
                  hasNext={nextUnfinished !== null}
                  onStarted={refresh}
                  onFinished={refresh}
                  onNext={() => goTo(nextUnfinished ?? "results")}
                />
              ) : (
                <FinishedPuzzle
                  item={item}
                  hasNext={nextUnfinished !== null}
                  onRetry={() => setMode("solve")}
                  onNext={() => goTo(nextUnfinished ?? "results")}
                />
              )}
            </Card>
          )}
        </div>

        <PuzzleSetLeaderboard assignmentId={assignmentId} />
      </div>
    </div>
  );
}

/** "Try 1 of 2" while a try is open (the server already counts it), else "1 try left". */
function triesLabel(item: PuzzleSetItemResult): string {
  if (item.triesLeft === null) return item.tries > 0 ? ` · try ${item.tries}` : "";
  const max = item.tries + item.triesLeft;
  if (item.status === "IN_PROGRESS" || (item.status === "NOT_STARTED" && item.tries > 0)) {
    return ` · try ${item.tries} of ${max}`;
  }
  if (item.status === "NOT_STARTED") return ` · ${max} ${max === 1 ? "try" : "tries"}`;
  return ` · ${item.triesLeft} ${item.triesLeft === 1 ? "try" : "tries"} left`;
}

function modeFor(item: PuzzleSetItemResult | undefined): "solve" | "review" {
  return !item || item.status === "NOT_STARTED" || item.status === "IN_PROGRESS" ? "solve" : "review";
}

function FinishedPuzzle({
  item,
  hasNext,
  onRetry,
  onNext
}: {
  item: PuzzleSetItemResult;
  hasNext: boolean;
  onRetry: () => void;
  onNext: () => void;
}) {
  // The best try counts, so another go can only raise the points.
  const canRetry = item.triesLeft !== 0;
  return (
    <div className="space-y-4">
      <div
        className={cn(
          "flex items-start gap-2 rounded-control border p-3 text-sm",
          item.status === "SOLVED"
            ? "border-accent/40 bg-accent/10 text-accent-ink"
            : "border-app-border bg-app-soft text-app-text"
        )}
      >
        {item.status === "SOLVED" ? (
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" strokeWidth={2.5} />
        ) : (
          <XCircle className="mt-0.5 size-4 shrink-0 text-app-danger-ink" strokeWidth={2.5} />
        )}
        <span>
          {item.status === "SOLVED" ? "You solved this one." : "Not solved yet."} Your best try:{" "}
          <strong>{formatPoints(item.points, item.maxPoints)} points</strong>
          {item.breakdown ? <span className="block text-xs opacity-80">{describeBreakdown(item.breakdown)}</span> : null}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Fact label="Tries" value={`${item.tries}${item.triesLeft !== null ? ` (${item.triesLeft} left)` : ""}`} />
        <Fact label="Wrong moves" value={String(item.wrongMoves ?? 0)} />
        <Fact label="Hints" value={String(item.hintsUsed ?? 0)} />
        <Fact label="Time" value={formatSeconds(item.durationSeconds)} />
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={onNext}>
          {hasNext ? "Next puzzle" : "See my results"}
        </Button>
        {canRetry ? (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            <RotateCcw className="mr-1.5 size-4" strokeWidth={2.5} />
            {item.status === "SOLVED" ? "Try for more points" : "Try again"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function MyResults({
  items,
  puzzleTitles,
  onOpen,
  allDone
}: {
  items: PuzzleSetItemResult[];
  puzzleTitles: string[];
  onOpen: (position: number) => void;
  allDone: boolean;
}) {
  return (
    <Card className="space-y-3 p-4 sm:p-5">
      {allDone ? (
        <p className="flex items-center gap-2 rounded-control border border-accent/40 bg-accent/10 p-3 text-sm font-semibold text-accent-ink">
          <CheckCircle2 className="size-4 shrink-0" strokeWidth={2.5} />
          Set complete! You can still retry any unsolved puzzle that has tries left.
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-app border border-app-border">
        <Table className="min-w-[520px] text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className="text-left">#</TableHead>
              <TableHead className="text-left">Puzzle</TableHead>
              <TableHead className="text-left">Result</TableHead>
              <TableHead className="text-right">Points</TableHead>
              <TableHead className="text-right">Tries</TableHead>
              <TableHead className="text-right">Time</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Open</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.puzzleId}>
                <TableCell className="text-left text-app-muted">{item.position + 1}</TableCell>
                <TableCell className="max-w-[200px] truncate text-left text-app-text">
                  {puzzleTitles[item.position]}
                </TableCell>
                <TableCell className="text-left">
                  <Badge variant={ITEM_STATUS_VARIANT[item.status]}>
                    {PUZZLE_SET_ITEM_STATUS_LABELS[item.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-semibold text-app-text">
                  {formatPoints(item.points, item.maxPoints)}
                </TableCell>
                <TableCell className="text-right text-app-text">{item.tries}</TableCell>
                <TableCell className="text-right text-app-text">
                  {item.tries > 0 ? formatSeconds(item.totalSeconds) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <SimpleTooltip label={item.status === "NOT_STARTED" ? "Start" : "Open"}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Open puzzle ${item.position + 1}`}
                      className="size-8 rounded-full border border-primary bg-primary p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:text-white"
                      onClick={() => onOpen(item.position)}
                    >
                      <Play className="size-4" strokeWidth={2.5} />
                    </Button>
                  </SimpleTooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control border border-app-border bg-app-background/50 p-2 text-center">
      <dt className="text-xs uppercase tracking-wide text-app-muted">{label}</dt>
      <dd className="text-sm font-bold text-app-text">{value}</dd>
    </div>
  );
}

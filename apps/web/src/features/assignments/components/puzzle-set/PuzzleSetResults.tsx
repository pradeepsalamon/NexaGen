"use client";

import { Fragment, useState } from "react";
import {
  PUZZLE_SET_ITEM_STATUS_LABELS,
  type AssignmentPuzzleSetResults,
  type PuzzlePointsBreakdown,
  type PuzzleSetStudentResult
} from "@nexa-chess/types";
import { ChevronDown, ChevronRight, Users } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { ITEM_STATUS_VARIANT, formatPoints, formatSeconds } from "../../lib/puzzleSetFormat";
import { StatusBadge } from "../assignmentBadges";

/** Coach view of one PUZZLE_SET deployment: who did what, puzzle by puzzle. */
export function PuzzleSetResults({ results }: { results: AssignmentPuzzleSetResults }) {
  const { students, puzzles, maxPoints } = results;
  const ranked = students.filter((s) => s.rank !== null);
  const completed = students.filter((s) => s.status === "COMPLETED").length;
  const started = students.filter((s) => s.status !== "PENDING").length;
  const averagePoints =
    ranked.length === 0 ? null : Math.round(ranked.reduce((sum, s) => sum + s.points, 0) / ranked.length);

  if (students.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No students yet"
        description="Students added to this batch get the puzzle set automatically."
      />
    );
  }

  return (
    // min-w-0: the dialog is a grid, and a grid item otherwise grows to its
    // widest child (the 640px table) instead of letting that table scroll.
    <div className="min-w-0 space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Summary label="Puzzles" value={String(puzzles.length)} />
        <Summary label="Started" value={`${started} / ${students.length}`} />
        <Summary label="Completed" value={`${completed} / ${students.length}`} />
        <Summary label="Avg points" value={averagePoints === null ? "—" : `${averagePoints} / ${maxPoints}`} />
      </div>

      {/* Tabs is a grid too: a minmax(0) track keeps the tables scrolling inside it. */}
      <Tabs defaultValue="students" className="grid-cols-[minmax(0,1fr)]">
        <TabsList className="justify-self-end">
          <TabsTrigger value="students">Students</TabsTrigger>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
        </TabsList>

        <TabsContent value="students">
          <StudentTable students={students} maxPoints={maxPoints} />
        </TabsContent>

        <TabsContent value="leaderboard">
          {ranked.length === 0 ? (
            <p className="py-6 text-center text-sm text-app-muted">
              Nobody has finished a puzzle yet.
            </p>
          ) : (
            <ol className="space-y-1.5">
              {ranked.map((s) => (
                <li
                  key={s.studentId}
                  className="flex items-center gap-3 rounded-control border border-app-border bg-app-surface p-3"
                >
                  <RankChip rank={s.rank ?? 0} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-app-text">{s.studentName}</p>
                    <p className="text-xs text-app-muted">
                      {s.solvedCount}/{s.puzzleCount} solved · {formatSeconds(s.timeSpentSeconds)}
                      {s.hintsUsed > 0 ? ` · ${s.hintsUsed} hint${s.hintsUsed === 1 ? "" : "s"}` : ""}
                      {s.wrongMoves > 0 ? ` · ${s.wrongMoves} wrong` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-right text-sm font-bold text-app-text">
                    {s.points}
                    <span className="font-normal text-app-muted"> / {s.maxPoints}</span>
                  </p>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-2 text-xs text-app-muted">
            Students see this board as set in the assignment&apos;s points &amp; leaderboard options.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StudentTable({ students, maxPoints }: { students: PuzzleSetStudentResult[]; maxPoints: number }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allOpen = open.size === students.length;

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen(allOpen ? new Set() : new Set(students.map((s) => s.studentId)))}
        >
          {allOpen ? "Collapse all" : "Expand all"}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-app border border-app-border">
        <Table className="min-w-[640px] text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead className="text-left">Student</TableHead>
              <TableHead className="text-left">Status</TableHead>
              <TableHead className="text-right">Solved</TableHead>
              <TableHead className="text-right">Attempted</TableHead>
              <TableHead className="text-right">Points</TableHead>
              <TableHead className="text-right">Time</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((s) => {
              const expanded = open.has(s.studentId);
              return (
                <Fragment key={s.studentId}>
                  <TableRow className="cursor-pointer" onClick={() => toggle(s.studentId)}>
                    <TableCell>
                      <SimpleTooltip label={expanded ? "Hide puzzles" : "Show puzzles"}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-expanded={expanded}
                          aria-label={`${expanded ? "Hide" : "Show"} ${s.studentName}'s puzzles`}
                          className="size-8 rounded-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(s.studentId);
                          }}
                        >
                          {expanded ? (
                            <ChevronDown className="size-4" strokeWidth={2.5} />
                          ) : (
                            <ChevronRight className="size-4" strokeWidth={2.5} />
                          )}
                        </Button>
                      </SimpleTooltip>
                    </TableCell>
                    <TableCell className="text-left">
                      <span className="flex items-center gap-2">
                        {s.rank !== null ? <RankChip rank={s.rank} small /> : null}
                        <span className="font-medium text-app-text">{s.studentName}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-left">
                      <StatusBadge status={s.status} />
                    </TableCell>
                    <TableCell className="text-right text-app-text">
                      {s.solvedCount} / {s.puzzleCount}
                    </TableCell>
                    <TableCell className="text-right text-app-text">
                      {s.attemptedCount} / {s.puzzleCount}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-app-text">
                      {s.points} <span className="font-normal text-app-muted">/ {maxPoints}</span>
                    </TableCell>
                    <TableCell className="text-right text-app-text">
                      {s.tries > 0 ? formatSeconds(s.timeSpentSeconds) : "—"}
                    </TableCell>
                  </TableRow>
                  {expanded ? (
                    <TableRow className="bg-app-soft/60 hover:bg-app-soft/60">
                      <TableCell colSpan={7} className="p-3">
                        <PuzzleBreakdownTable student={s} />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function PuzzleBreakdownTable({ student }: { student: PuzzleSetStudentResult }) {
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[600px] text-xs">
        <TableHeader>
          <TableRow>
            <TableHead className="text-left">#</TableHead>
            <TableHead className="text-left">Puzzle</TableHead>
            <TableHead className="text-left">Result</TableHead>
            <TableHead className="text-right">Points</TableHead>
            <TableHead className="text-right">Tries</TableHead>
            <TableHead className="text-right">Wrong moves</TableHead>
            <TableHead className="text-right">Hints</TableHead>
            <TableHead className="text-right">Time</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {student.items.map((item) => (
            <TableRow key={item.puzzleId}>
              <TableCell className="text-left text-app-muted">{item.position + 1}</TableCell>
              <TableCell className="max-w-[180px] truncate text-left text-app-text">{item.title}</TableCell>
              <TableCell className="text-left">
                <Badge variant={ITEM_STATUS_VARIANT[item.status]}>
                  {PUZZLE_SET_ITEM_STATUS_LABELS[item.status]}
                </Badge>
                {item.scorePercent !== null && item.status === "FAILED" ? (
                  <span className="ml-1 text-app-muted">{item.scorePercent}%</span>
                ) : null}
              </TableCell>
              <TableCell className="text-right font-semibold text-app-text">
                {item.breakdown ? (
                  <SimpleTooltip label={describeBreakdown(item.breakdown)}>
                    <span tabIndex={0} className="cursor-help underline decoration-dotted underline-offset-2">
                      {formatPoints(item.points, item.maxPoints)}
                    </span>
                  </SimpleTooltip>
                ) : (
                  formatPoints(item.points, item.maxPoints)
                )}
              </TableCell>
              <TableCell className="text-right text-app-text">
                {item.tries}
                {item.triesLeft !== null ? <span className="text-app-muted"> ({item.triesLeft} left)</span> : null}
              </TableCell>
              <TableCell className="text-right text-app-text">{item.wrongMoves ?? "—"}</TableCell>
              <TableCell className="text-right text-app-text">{item.hintsUsed ?? "—"}</TableCell>
              <TableCell className="text-right text-app-text">
                {item.durationSeconds !== null ? formatSeconds(item.durationSeconds) : "—"}
                {item.tries > 1 ? (
                  <span className="block text-app-muted">{formatSeconds(item.totalSeconds)} total</span>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** "10 base − 3 wrong moves − 3 hints = 4" — the best attempt's points, spelled out. */
export function describeBreakdown(b: PuzzlePointsBreakdown): string {
  const parts = [`${b.base} base`];
  if (b.speedBonus) parts.push(`+ ${b.speedBonus} speed`);
  if (b.firstSolveBonus) parts.push(`+ ${b.firstSolveBonus} first solver`);
  if (b.wrongMovePenalty) parts.push(`− ${b.wrongMovePenalty} wrong moves`);
  if (b.hintPenalty) parts.push(`− ${b.hintPenalty} hints`);
  if (b.adjustment) parts.push(`${b.adjustment > 0 ? "+" : "−"} ${Math.abs(b.adjustment)} coach`);
  return `${parts.join(" ")} = ${b.total}`;
}

export function RankChip({ rank, small = false }: { rank: number; small?: boolean }) {
  const podium = rank <= 3;
  return (
    <span
      aria-label={`Rank ${rank}`}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold",
        small ? "size-6 text-xs" : "size-8 text-sm",
        podium ? "bg-secondary text-black" : "bg-app-soft text-app-text"
      )}
    >
      {rank}
    </span>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control border border-app-border bg-app-background/50 p-2 text-center">
      <p className="text-xs uppercase tracking-wide text-app-muted">{label}</p>
      <p className="text-base font-bold text-app-text">{value}</p>
    </div>
  );
}

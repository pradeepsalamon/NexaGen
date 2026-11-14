"use client";

import type {
  AssignmentLibraryItem,
  AssignmentSetPuzzle,
  StudentAssignmentItem
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { PUZZLE_DIFFICULTY_LABELS } from "@/features/puzzles/lib/puzzleMeta";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { useAssignmentLibraryItem } from "../hooks/useAssignmentsApi";
import { PgnBoardViewer } from "./PgnBoardViewer";
import { ActivityBadge, DifficultyBadge } from "./assignmentBadges";

type PreviewAssignment = Pick<
  AssignmentLibraryItem | StudentAssignmentItem,
  "title" | "description" | "pgn" | "difficulty" | "pgnUrl" | "activityType"
> & { id?: string; puzzles?: AssignmentSetPuzzle[] | null };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignment: PreviewAssignment | null;
}

export function AssignmentPreviewDialog({ open, onOpenChange, assignment }: Props) {
  const wantDetail = open && !!assignment?.id;
  const { data } = useAssignmentLibraryItem(assignment?.id ?? "", wantDetail);
  const perf = data?.assignment.performance ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px] max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {assignment?.title}
            {assignment && <ActivityBadge activityType={assignment.activityType} />}
            {assignment && <DifficultyBadge difficulty={assignment.difficulty} />}
          </DialogTitle>
          {assignment?.description && (
            <DialogDescription>{assignment.description}</DialogDescription>
          )}
        </DialogHeader>

        {perf && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <PerfStat label="Assigned" value={String(perf.assigned)} />
            <PerfStat label="Completed" value={String(perf.completed)} />
            <PerfStat label="In progress" value={String(perf.inProgress)} />
            <PerfStat label="Failed" value={String(perf.failed)} />
            <PerfStat
              label="Avg score"
              value={perf.averageScorePercent === null ? "—" : `${perf.averageScorePercent}%`}
            />
            <PerfStat
              label="Avg accuracy"
              value={perf.averageAccuracyPercent === null ? "—" : `${perf.averageAccuracyPercent}%`}
            />
            <PerfStat
              label="Avg attempts"
              value={perf.averageAttempts === null ? "—" : String(perf.averageAttempts)}
            />
            <PerfStat label="Not started" value={String(perf.notStarted)} />
          </div>
        )}

        {assignment?.activityType === "PUZZLE_SET" ? (
          <PuzzleList puzzles={data?.assignment.puzzles ?? assignment.puzzles ?? []} />
        ) : (
          assignment && <PgnBoardViewer pgn={assignment.pgn} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PerfStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-app border border-app-border bg-app-background/50 p-2 text-center">
      <p className="text-[10px] text-app-muted">{label}</p>
      <p className="text-base font-bold text-app-text">{value}</p>
    </div>
  );
}

function PuzzleList({ puzzles }: { puzzles: AssignmentSetPuzzle[] }) {
  if (puzzles.length === 0) {
    return <p className="py-4 text-center text-sm text-app-muted">This set has no puzzles.</p>;
  }
  const maxPoints = puzzles.reduce((sum, p) => sum + p.maxPoints, 0);
  return (
    <div className="space-y-2">
      <p className="text-sm text-app-muted">
        {puzzles.length} puzzle{puzzles.length === 1 ? "" : "s"}, solved in this order · up to {maxPoints} points
      </p>
      <ol className="space-y-1.5">
        {puzzles.map((p) => (
          <li
            key={p.puzzleId}
            className="flex items-center gap-3 rounded-control border border-app-border bg-app-surface p-2.5"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-app-soft text-xs font-bold text-app-text">
              {p.position + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-app-text">{p.title}</p>
              <p className="truncate text-xs text-app-muted">
                {p.sideToMove === "white" ? "White" : "Black"} to move · {p.solutionLength}-move line
                {p.topicName ? ` · ${p.topicName}` : ""}
              </p>
              {p.tags?.length ? (
                <p className="truncate text-xs text-app-muted">{p.tags.map((t) => `#${t}`).join(" ")}</p>
              ) : null}
            </div>
            <Badge variant="outline">{PUZZLE_DIFFICULTY_LABELS[p.difficulty]}</Badge>
            <span className="shrink-0 text-xs font-semibold text-app-text">{p.maxPoints} pts</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

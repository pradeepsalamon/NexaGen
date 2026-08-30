"use client";

import type { AssignmentLibraryItem, StudentAssignmentItem } from "@nexa-chess/types";
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
> & { id?: string };

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
      <DialogContent className="sm:max-w-[760px] max-h-[90vh] overflow-y-auto">
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

        {assignment && <PgnBoardViewer pgn={assignment.pgn} />}
      </DialogContent>
    </Dialog>
  );
}

function PerfStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-app border border-app-border bg-app-background/50 p-2 text-center">
      <p className="text-[10px] uppercase tracking-wide text-app-muted">{label}</p>
      <p className="text-base font-bold text-app-text">{value}</p>
    </div>
  );
}

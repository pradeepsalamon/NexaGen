"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AssignmentAttemptStatus } from "@nexa-chess/types";
import { CheckCircle2, Download, Play, SearchX, Timer } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import {
  useAttemptHistory,
  useMyAssignment,
  useUpdateMyAssignmentStatus
} from "../hooks/useAssignmentsApi";
import { EvaluatedActivity } from "./activities/EvaluatedActivity";
import { PgnBoardViewer } from "./PgnBoardViewer";
import { ActivityBadge, DifficultyBadge, DueBadge, StatusBadge } from "./assignmentBadges";
import { StudentPuzzleSet } from "./puzzle-set/StudentPuzzleSet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useTableSort } from "@/hooks/useTableSort";
import { SortButton } from "@/components/ui/DataTableSortButton";

const ATTEMPT_STATUS_LABEL: Record<AssignmentAttemptStatus, string> = {
  ABANDONED: "Abandoned",
  COMPLETED: "Completed",
  FAILED: "Not solved",
  IN_PROGRESS: "In progress"
};

const LIST_CRUMB = { href: "/student/practice", label: "Assignments" };

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function StudentAssignmentDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const timeZone = useUserTimeZone();
  const { data, isLoading, isError } = useMyAssignment(id);
  const assignment = data?.assignment;
  const goBack = () => router.push("/student/practice");

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[420px] w-full max-w-[420px]" />
      </div>
    );
  }

  if (isError || !assignment) {
    return (
      <div className="animate-fade-in pb-10">
        <PageHeader breadcrumbs={[LIST_CRUMB, { label: "Not found" }]} title="Assignment not found" />
        <EmptyState
          action={{ label: "Back to assignments", onClick: goBack }}
          description="It may have been removed, or the link is wrong."
          icon={SearchX}
          title="This assignment could not be found"
        />
      </div>
    );
  }

  const header = (
    <PageHeader
      breadcrumbs={[LIST_CRUMB, { label: assignment.title }]}
      description={assignment.description ? <span className="block max-w-2xl">{assignment.description}</span> : undefined}
      title={<span className="break-words">{assignment.title}</span>}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <ActivityBadge activityType={assignment.activityType} />
        <DifficultyBadge difficulty={assignment.difficulty} />
        <DueBadge
          completed={assignment.status === "COMPLETED"}
          dueDate={assignment.dueDate}
          formatted={formatFullDate(assignment.dueDate, timeZone)}
          timeZone={timeZone}
        />
        <StatusBadge status={assignment.status} />
        {assignment.coachName ? <span className="text-app-muted">Coach {assignment.coachName}</span> : null}
      </div>
    </PageHeader>
  );

  if (assignment.activityType === "REPLAY") {
    return (
      <div className="animate-fade-in space-y-5 pb-10">
        {header}
        <ReplayActivity assignment={assignment} />
      </div>
    );
  }

  if (assignment.activityType === "PUZZLE_SET") {
    return (
      <div className="animate-fade-in space-y-5 pb-10">
        {header}
        <StudentPuzzleSet assignment={assignment} />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-5 pb-10">
      {header}
      <EvaluatedShell assignmentId={id} assignment={assignment} onBack={goBack} />
    </div>
  );
}

// ── REPLAY (legacy behaviour, preserved) ──────────────────────

function ReplayActivity({
  assignment
}: {
  assignment: NonNullable<ReturnType<typeof useMyAssignment>["data"]>["assignment"];
}) {
  const statusMutation = useUpdateMyAssignmentStatus(assignment.id);
  const [note, setNote] = useState("");
  const noteRef = useRef(note);
  const startedRef = useRef(false);
  const completedRef = useRef(false);
  const [timeSpentSeconds, setTimeSpentSeconds] = useState(0);

  useEffect(() => {
    noteRef.current = note;
  }, [note]);

  useEffect(() => {
    if (assignment.note) setNote(assignment.note);
    if (assignment.status === "COMPLETED") {
      setTimeSpentSeconds(assignment.timeSpentSeconds ?? 0);
      completedRef.current = true;
    }
  }, [assignment]);

  useEffect(() => {
    if (assignment.status === "PENDING" && !startedRef.current) {
      startedRef.current = true;
      statusMutation.mutate({ status: "IN_PROGRESS" });
    }
  }, [assignment, statusMutation]);

  useEffect(() => {
    if (assignment.status === "COMPLETED") return;
    const timer = setInterval(() => setTimeSpentSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [assignment]);

  useEffect(() => {
    if (assignment.status === "COMPLETED" || !assignment.timeLimitMinutes) return;
    if (timeSpentSeconds >= assignment.timeLimitMinutes * 60 && !statusMutation.isPending && !completedRef.current) {
      completedRef.current = true;
      statusMutation.mutate({
        status: "COMPLETED",
        note: noteRef.current.trim() || undefined,
        timeSpentSeconds
      });
    }
  }, [timeSpentSeconds, assignment, statusMutation]);

  const isDone = assignment.status === "COMPLETED";
  const timeLimit = assignment.timeLimitMinutes ? assignment.timeLimitMinutes * 60 : null;
  const displayTime = timeLimit ? Math.max(0, timeLimit - timeSpentSeconds) : timeSpentSeconds;

  return (
    <>
      <div className="flex justify-end">
        <div className="flex items-center gap-2 rounded-control border border-app-border bg-app-surface px-4 py-2 font-mono text-xl font-bold tracking-tight tabular-nums text-app-text">
          <Timer aria-hidden="true" className="size-5 text-app-muted" strokeWidth={2.25} />
          <span className={timeLimit && displayTime <= 60 && !isDone ? "text-warning-ink motion-safe:animate-pulse" : ""}>
            {formatTime(displayTime)}
          </span>
        </div>
      </div>

      <Card className="p-4">
        <PgnBoardViewer pgn={assignment.pgn} />
      </Card>

      <Card className="space-y-3 p-4">
        <label htmlFor="assignment-note" className="text-sm font-semibold text-app-text">
          Note for your coach (optional)
        </label>
        <Textarea
          id="assignment-note"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Anything you struggled with?"
          disabled={isDone}
        />
        <div className="flex flex-wrap items-center justify-end gap-3">
          {assignment.pgnUrl && (
            <a
              href={assignment.pgnUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-ink hover:underline"
            >
              <Download aria-hidden="true" className="size-4" strokeWidth={2.5} />
              Download PGN
            </a>
          )}
          <Button
            disabled={isDone || statusMutation.isPending}
            onClick={() =>
              statusMutation.mutate({
                status: "COMPLETED",
                note: note.trim() || undefined,
                timeSpentSeconds
              })
            }
          >
            <CheckCircle2 aria-hidden="true" className="size-4" strokeWidth={2.5} />
            {isDone ? "Completed" : "Mark as complete"}
          </Button>
        </div>
      </Card>
    </>
  );
}

// ── Evaluated activities ──────────────────────────────────────

function EvaluatedShell({
  assignmentId,
  assignment,
  onBack
}: {
  assignmentId: string;
  assignment: NonNullable<ReturnType<typeof useMyAssignment>["data"]>["assignment"];
  onBack: () => void;
}) {
  const [practicing, setPracticing] = useState(assignment.attemptCount === 0);
  const showSummary = !practicing;
  const { data: history } = useAttemptHistory(assignmentId, showSummary);
  const { rows: attempts, sortProps } = useTableSort({
    rows: history?.attempts,
    accessors: {
      accuracy: (a) => a.accuracyPercent,
      attempt: (a) => a.attemptNumber,
      result: (a) => a.result ?? a.status,
      score: (a) => a.scorePercent,
      time: (a) => a.durationSeconds
    }
  });

  if (practicing) {
    return <EvaluatedActivity assignmentId={assignmentId} onBack={onBack} />;
  }

  const canRetry =
    assignment.status !== "COMPLETED" &&
    (assignment.maxAttempts === null || assignment.attemptCount < assignment.maxAttempts);
  const canPracticeAgain =
    assignment.activityType === "FREE_ANALYSIS" ||
    assignment.maxAttempts === null ||
    assignment.attemptCount < assignment.maxAttempts;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Status" value={assignment.status === "COMPLETED" ? "Completed" : "In progress"} />
          <Stat
            label="Best score"
            value={assignment.bestScorePercent === null ? "—" : `${assignment.bestScorePercent}%`}
          />
          <Stat
            label="Best accuracy"
            value={
              assignment.bestAccuracyPercent === null ? "—" : `${assignment.bestAccuracyPercent}%`
            }
          />
          <Stat label="Attempts" value={String(assignment.attemptCount)} />
        </div>
        {canRetry || canPracticeAgain ? (
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button onClick={() => setPracticing(true)}>
              <Play aria-hidden="true" className="size-4" strokeWidth={2.5} />
              {assignment.status === "COMPLETED" ? "Practice again" : "Continue"}
            </Button>
          </div>
        ) : null}
      </Card>

      {attempts.length > 0 && (
        <SectionCard title="Attempt history">
          <div className="overflow-x-auto">
            <Table className="w-full text-sm">
              <TableHeader>
                <TableRow className="text-left text-xs text-app-muted">
                  <TableHead className="py-1 pr-4"><SortButton label="Attempt" {...sortProps("attempt")} /></TableHead>
                  <TableHead className="py-1 pr-4"><SortButton label="Score" {...sortProps("score")} /></TableHead>
                  <TableHead className="py-1 pr-4"><SortButton label="Accuracy" {...sortProps("accuracy")} /></TableHead>
                  <TableHead className="py-1 pr-4"><SortButton label="Result" {...sortProps("result")} /></TableHead>
                  <TableHead className="py-1"><SortButton label="Time" {...sortProps("time")} /></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attempts.map((a) => (
                  <TableRow key={a.id} className="border-t border-app-border/50">
                    <TableCell className="text-left py-1.5 pr-4 text-app-text">#{a.attemptNumber}</TableCell>
                    <TableCell className="text-left py-1.5 pr-4 text-app-text">
                      {a.scorePercent === null ? "—" : `${a.scorePercent}%`}
                    </TableCell>
                    <TableCell className="text-left py-1.5 pr-4 text-app-text">
                      {a.accuracyPercent === null ? "—" : `${a.accuracyPercent}%`}
                    </TableCell>
                    <TableCell className="text-left py-1.5 pr-4">
                      <span
                        className={
                          a.status === "COMPLETED"
                            ? "text-success-ink"
                            : a.status === "FAILED"
                              ? "text-warning-ink"
                              : "text-app-muted"
                        }
                      >
                        {a.result ?? ATTEMPT_STATUS_LABEL[a.status]}
                      </span>
                    </TableCell>
                    <TableCell className="text-left py-1.5">{formatTime(a.durationSeconds)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-app border border-app-border bg-app-soft p-3 text-center">
      <p className="text-xs font-medium text-app-muted">{label}</p>
      <p className="text-lg font-bold tabular-nums text-app-text">{value}</p>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Download, Play, Timer } from "lucide-react";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import {
  useAttemptHistory,
  useMyAssignment,
  useUpdateMyAssignmentStatus
} from "../hooks/useAssignmentsApi";
import { EvaluatedActivity } from "./activities/EvaluatedActivity";
import { PgnBoardViewer } from "./PgnBoardViewer";
import { ActivityBadge, DifficultyBadge, DueBadge, StatusBadge } from "./assignmentBadges";

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
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={goBack}>
          <ArrowLeft className="mr-1.5 size-4" />
          Back to assignments
        </Button>
        <p className="text-sm text-red-600">This assignment could not be found.</p>
      </div>
    );
  }

  const header = (
    <>
      <Button variant="ghost" size="sm" onClick={goBack}>
        <ArrowLeft className="mr-1.5 size-4" />
        Back to assignments
      </Button>
      <div className="space-y-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-app-text">{assignment.title}</h1>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <ActivityBadge activityType={assignment.activityType} />
          <DifficultyBadge difficulty={assignment.difficulty} />
          <DueBadge dueDate={assignment.dueDate} formatted={formatFullDate(assignment.dueDate, timeZone)} />
          <StatusBadge status={assignment.status} />
          {assignment.coachName && <span className="text-app-muted">by {assignment.coachName}</span>}
        </div>
        {assignment.description && (
          <p className="max-w-2xl text-sm text-app-muted">{assignment.description}</p>
        )}
      </div>
    </>
  );

  if (assignment.activityType === "REPLAY") {
    return (
      <div className="space-y-5 pb-10 animate-fade-in">
        {header}
        <ReplayActivity assignment={assignment} />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-10 animate-fade-in">
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
  const [timeSpentSeconds, setTimeSpentSeconds] = useState(0);

  useEffect(() => {
    noteRef.current = note;
  }, [note]);

  useEffect(() => {
    if (assignment.note) setNote(assignment.note);
    if (assignment.status === "COMPLETED") setTimeSpentSeconds(assignment.timeSpentSeconds ?? 0);
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
    if (timeSpentSeconds >= assignment.timeLimitMinutes * 60 && !statusMutation.isPending) {
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
        <div className="flex items-center gap-2 rounded-lg border border-app-border bg-app-background/50 px-4 py-2 font-mono text-xl font-bold tracking-tight text-app-text">
          <Timer className="size-5" />
          <span className={timeLimit && displayTime <= 60 && !isDone ? "text-red-500 animate-pulse" : ""}>
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
        <div className="flex flex-wrap items-center gap-3">
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
            <CheckCircle2 className="mr-2 size-4" strokeWidth={2.5} />
            {isDone ? "Completed" : "Mark as complete"}
          </Button>
          {assignment.pgnUrl && (
            <a
              href={assignment.pgnUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              <Download className="size-4" strokeWidth={2.5} />
              Download PGN
            </a>
          )}
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

  if (practicing) {
    return <EvaluatedActivity assignmentId={assignmentId} onBack={onBack} />;
  }

  const attempts = history?.attempts ?? [];
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
        <div className="mt-4 flex flex-wrap gap-2">
          {(canRetry || canPracticeAgain) && (
            <Button onClick={() => setPracticing(true)}>
              <Play className="mr-2 size-4" strokeWidth={2.5} />
              {assignment.status === "COMPLETED" ? "Practice again" : "Continue"}
            </Button>
          )}
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 size-4" strokeWidth={2.5} />
            Back to assignments
          </Button>
        </div>
      </Card>

      {attempts.length > 0 && (
        <Card className="p-5">
          <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-app-muted">
            Attempt history
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-app-muted">
                  <th className="py-1 pr-4">Attempt</th>
                  <th className="py-1 pr-4">Score</th>
                  <th className="py-1 pr-4">Accuracy</th>
                  <th className="py-1 pr-4">Result</th>
                  <th className="py-1">Time</th>
                </tr>
              </thead>
              <tbody>
                {attempts.map((a) => (
                  <tr key={a.id} className="border-t border-app-border/50">
                    <td className="py-1.5 pr-4 text-app-text">#{a.attemptNumber}</td>
                    <td className="py-1.5 pr-4 text-app-text">
                      {a.scorePercent === null ? "—" : `${a.scorePercent}%`}
                    </td>
                    <td className="py-1.5 pr-4 text-app-text">
                      {a.accuracyPercent === null ? "—" : `${a.accuracyPercent}%`}
                    </td>
                    <td className="py-1.5 pr-4">
                      <span
                        className={
                          a.status === "COMPLETED"
                            ? "text-green-600"
                            : a.status === "FAILED"
                              ? "text-red-500"
                              : "text-app-muted"
                        }
                      >
                        {a.result ?? a.status}
                      </span>
                    </td>
                    <td className="py-1.5">{formatTime(a.durationSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-app border border-app-border bg-app-background/50 p-3 text-center">
      <p className="text-xs uppercase tracking-wide text-app-muted">{label}</p>
      <p className="text-lg font-bold text-app-text">{value}</p>
    </div>
  );
}

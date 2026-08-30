"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Download, Timer } from "lucide-react";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { useMyAssignment, useUpdateMyAssignmentStatus } from "../hooks/useAssignmentsApi";
import { PgnBoardViewer } from "./PgnBoardViewer";
import { DifficultyBadge, DueBadge, StatusBadge } from "./assignmentBadges";

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function StudentAssignmentDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const timeZone = useUserTimeZone();
  const { data, isLoading, isError } = useMyAssignment(id);
  const statusMutation = useUpdateMyAssignmentStatus(id);
  const assignment = data?.assignment;

  const [note, setNote] = useState("");
  const noteRef = useRef(note);
  const startedRef = useRef(false);
  const [timeSpentSeconds, setTimeSpentSeconds] = useState(0);

  useEffect(() => {
    noteRef.current = note;
  }, [note]);

  useEffect(() => {
    if (assignment?.note) setNote(assignment.note);
    if (assignment?.status === "COMPLETED") {
      setTimeSpentSeconds(assignment.timeSpentSeconds ?? 0);
    }
  }, [assignment]);

  // First open marks it in progress so the coach sees the student engaged.
  useEffect(() => {
    if (assignment && assignment.status === "PENDING" && !startedRef.current) {
      startedRef.current = true;
      statusMutation.mutate({ status: "IN_PROGRESS" });
    }
  }, [assignment, statusMutation]);

  // Timer logic
  useEffect(() => {
    if (!assignment || assignment.status === "COMPLETED") return;

    const timer = setInterval(() => {
      setTimeSpentSeconds((s) => s + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [assignment]);

  // Auto-complete logic
  useEffect(() => {
    if (!assignment || assignment.status === "COMPLETED" || !assignment.timeLimitMinutes) return;
    
    if (timeSpentSeconds >= assignment.timeLimitMinutes * 60 && !statusMutation.isPending) {
      statusMutation.mutate({
        status: "COMPLETED",
        note: noteRef.current.trim() || undefined,
        timeSpentSeconds
      });
    }
  }, [timeSpentSeconds, assignment, statusMutation]);

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
        <Button variant="ghost" size="sm" onClick={() => router.push("/student/practice")}>
          <ArrowLeft className="mr-1.5 size-4" />
          Back to assignments
        </Button>
        <p className="text-sm text-red-600">This assignment could not be found.</p>
      </div>
    );
  }

  const isDone = assignment.status === "COMPLETED";
  const timeLimit = assignment.timeLimitMinutes ? assignment.timeLimitMinutes * 60 : null;
  const displayTime = timeLimit ? Math.max(0, timeLimit - timeSpentSeconds) : timeSpentSeconds;

  return (
    <div className="space-y-5 pb-10 animate-fade-in">
      <Button variant="ghost" size="sm" onClick={() => router.push("/student/practice")}>
        <ArrowLeft className="mr-1.5 size-4" />
        Back to assignments
      </Button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-extrabold tracking-tight text-app-text">{assignment.title}</h1>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <DifficultyBadge difficulty={assignment.difficulty} />
            <DueBadge dueDate={assignment.dueDate} formatted={formatFullDate(assignment.dueDate, timeZone)} />
            <StatusBadge status={assignment.status} />
            {assignment.coachName && <span className="text-app-muted">by {assignment.coachName}</span>}
          </div>
          {assignment.description && (
            <p className="max-w-2xl text-sm text-app-muted">{assignment.description}</p>
          )}
        </div>
        
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
    </div>
  );
}

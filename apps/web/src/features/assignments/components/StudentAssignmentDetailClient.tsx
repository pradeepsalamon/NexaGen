"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Download } from "lucide-react";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { useMyAssignment, useUpdateMyAssignmentStatus } from "../hooks/useAssignmentsApi";
import { PgnBoardViewer } from "./PgnBoardViewer";
import { DifficultyBadge, DueBadge, StatusBadge } from "./assignmentBadges";

export function StudentAssignmentDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const timeZone = useUserTimeZone();
  const { data, isLoading, isError } = useMyAssignment(id);
  const statusMutation = useUpdateMyAssignmentStatus(id);
  const assignment = data?.assignment;

  const [note, setNote] = useState("");
  const startedRef = useRef(false);

  useEffect(() => {
    if (assignment?.note) setNote(assignment.note);
  }, [assignment?.note]);

  // First open marks it in progress so the coach sees the student engaged.
  useEffect(() => {
    if (assignment && assignment.status === "PENDING" && !startedRef.current) {
      startedRef.current = true;
      statusMutation.mutate({ status: "IN_PROGRESS" });
    }
  }, [assignment, statusMutation]);

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

  return (
    <div className="space-y-5 pb-10 animate-fade-in">
      <Button variant="ghost" size="sm" onClick={() => router.push("/student/practice")}>
        <ArrowLeft className="mr-1.5 size-4" />
        Back to assignments
      </Button>

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
              statusMutation.mutate({ status: "COMPLETED", note: note.trim() || undefined })
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

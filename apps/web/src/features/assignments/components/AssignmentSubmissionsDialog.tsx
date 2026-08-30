"use client";

import { Timer } from "lucide-react";
import { formatFullDate } from "@/lib/datetime";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { Badge } from "@/components/ui/Badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAssignmentDeployment } from "../hooks/useAssignmentsApi";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed"
};

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deploymentId: string | null;
}

export function AssignmentSubmissionsDialog({ open, onOpenChange, deploymentId }: Props) {
  const timeZone = useUserTimeZone();
  const { data, isLoading } = useAssignmentDeployment(deploymentId ?? "", open && !!deploymentId);
  const deployment = data?.deployment;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{deployment ? deployment.title : "Submissions"}</DialogTitle>
          <DialogDescription>
            {deployment
              ? `${deployment.batchName} · due ${formatFullDate(deployment.dueDate, timeZone)}`
              : "Per-student progress for this assignment."}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="grid gap-2 py-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !deployment || deployment.submissions.length === 0 ? (
          <p className="py-6 text-center text-sm text-app-muted">
            No students in this batch yet.
          </p>
        ) : (
          <div className="divide-y divide-app-border/60">
            {deployment.submissions.map((s) => (
              <div key={s.studentId} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-app-text">{s.studentName}</p>
                  {s.note && <p className="text-xs text-app-muted">&ldquo;{s.note}&rdquo;</p>}
                  {(s.attemptCount > 0 || s.bestScorePercent !== null) && (
                    <p className="text-xs text-app-muted">
                      {s.bestScorePercent !== null && <>Score {s.bestScorePercent}% · </>}
                      {s.bestAccuracyPercent !== null && <>Accuracy {s.bestAccuracyPercent}% · </>}
                      {s.attemptCount} attempt{s.attemptCount === 1 ? "" : "s"}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {s.timeSpentSeconds != null && s.status === "COMPLETED" && (
                    <span className="flex items-center gap-1 text-xs text-app-muted">
                      <Timer className="size-3" />
                      {formatTime(s.timeSpentSeconds)}
                    </span>
                  )}
                  {s.completedAt && (
                    <span className="text-xs text-app-muted">
                      {formatFullDate(s.completedAt, timeZone)}
                    </span>
                  )}
                  <Badge
                    variant="outline"
                    className={
                      s.status === "COMPLETED"
                        ? "border-green-200 bg-green-50 text-green-700"
                        : s.status === "IN_PROGRESS"
                          ? "border-yellow-200 bg-yellow-50 text-yellow-700"
                          : "border-app-border bg-app-background text-app-muted"
                    }
                  >
                    {STATUS_LABEL[s.status] ?? s.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

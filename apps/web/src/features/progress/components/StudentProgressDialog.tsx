"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useStudentProgress } from "../hooks/useProgress";
import { ProgressView } from "./ProgressView";

/** A coach's (or admin's) look at one student's progress. */
export function StudentProgressDialog({
  studentId,
  studentName,
  onOpenChange
}: {
  studentId: string | null;
  studentName?: string;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading, isError, refetch } = useStudentProgress(studentId);

  return (
    <Dialog open={studentId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{studentName ? `${studentName}'s progress` : "Progress"}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-64 w-full rounded-app" />
        ) : isError || !data ? (
          <WidgetError onRetry={() => refetch()} />
        ) : (
          <ProgressView progress={data.progress} />
        )}
      </DialogContent>
    </Dialog>
  );
}

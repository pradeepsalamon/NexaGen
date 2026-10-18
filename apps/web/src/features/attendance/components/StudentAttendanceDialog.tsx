"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api";
import {
  API_ROUTES,
  type StudentAttendanceHistory,
  type StudentAttendanceResponse,
} from "@nexa-chess/types";
import { StudentAttendanceView } from "./StudentAttendanceView";
import { AttendanceLogDialog } from "./AttendanceLogDialog";

interface StudentAttendanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string | null;
  studentName?: string;
}

export function StudentAttendanceDialog({
  open,
  onOpenChange,
  studentId,
  studentName,
}: StudentAttendanceDialogProps) {
  const [data, setData] = useState<StudentAttendanceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [logRecord, setLogRecord] = useState<StudentAttendanceHistory | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  useEffect(() => {
    if (!open || !studentId) return;

    let cancelled = false;
    setData(null);
    setError(null);
    setIsLoading(true);

    apiFetch<StudentAttendanceResponse>(API_ROUTES.attendance.studentById(studentId))
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load attendance");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, studentId]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl lg:max-w-5xl max-h-[85dvh] overflow-hidden flex flex-col p-0">
          <div className="p-6 pb-4 border-b border-app-border">
            <DialogHeader>
              <DialogTitle className="text-xl">
                {studentName ? `${studentName} — Attendance` : "Student Attendance"}
              </DialogTitle>
              <DialogDescription>
                Overall live-class participation and history for this student.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="flex-1 overflow-y-auto p-6 pt-4">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-28 w-full rounded-control" />
                <Skeleton className="h-64 w-full rounded-control" />
              </div>
            ) : error ? (
              <div className="p-4 rounded-control border border-app-danger/30 bg-app-danger/[0.06] text-app-danger-ink">
                {error}
              </div>
            ) : data ? (
              <StudentAttendanceView
                data={data}
                hideHeading
                onRowClick={(record) => {
                  setLogRecord(record);
                  setLogOpen(true);
                }}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <AttendanceLogDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        classId={logRecord?.id ?? null}
        studentId={studentId}
        title={logRecord?.topic}
        date={logRecord ? (logRecord.actualStart ?? logRecord.date) : undefined}
      />
    </>
  );
}

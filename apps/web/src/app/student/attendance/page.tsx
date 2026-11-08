"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarX } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api";
import { API_ROUTES, type StudentAttendanceResponse, type StudentAttendanceHistory } from "@nexa-chess/types";
import { AttendanceLogDialog } from "@/features/attendance/components/AttendanceLogDialog";
import { StudentAttendanceView } from "@/features/attendance/components/StudentAttendanceView";
import { WidgetError } from "@/components/ui/WidgetError";
import { useAuthStore } from "@/stores/authStore";

export default function StudentAttendancePage() {
  const [data, setData] = useState<StudentAttendanceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const user = useAuthStore(state => state.user);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<StudentAttendanceHistory | null>(null);

  // Only the latest request may update state: a retry supersedes an earlier
  // one, and nothing lands after unmount.
  const latestRequest = useRef(0);

  const loadAttendance = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setIsLoading(true);
    setFailed(false);
    try {
      const result = await apiFetch<StudentAttendanceResponse>(API_ROUTES.attendance.student);
      if (requestId === latestRequest.current) setData(result);
    } catch (error) {
      if (requestId !== latestRequest.current) return;
      console.error("Failed to load attendance", error);
      setFailed(true);
    } finally {
      if (requestId === latestRequest.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAttendance();
    return () => {
      latestRequest.current += 1;
    };
  }, [loadAttendance]);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 pb-10" role="status">
        <span className="sr-only">Loading your attendance…</span>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-64 max-w-full" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <Skeleton className="h-10 w-56 rounded-full" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex h-36 flex-col justify-between rounded-app border border-app-border bg-app-surface p-4 shadow-card">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-8 w-1/2" />
            </div>
          ))}
        </div>
        <div className="space-y-3 rounded-app border border-app-border bg-app-surface p-4 shadow-card">
          <Skeleton className="h-5 w-48" />
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="max-w-7xl mx-auto pb-10">
        <WidgetError
          message="Couldn't load your attendance. Please check your connection and try again."
          onRetry={loadAttendance}
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-7xl pb-10">
        <EmptyState
          description="Join a live class and your attendance shows up here."
          icon={CalendarX}
          title="No attendance yet"
        />
      </div>
    );
  }

  const handleRowClick = (record: StudentAttendanceHistory) => {
    setSelectedRecord(record);
    setDialogOpen(true);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-10">
      <StudentAttendanceView data={data} onRowClick={handleRowClick} />

      <AttendanceLogDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        classId={selectedRecord?.id ?? null}
        studentId={user?.id || null}
        title={selectedRecord?.topic}
        date={selectedRecord ? (selectedRecord.actualStart ?? selectedRecord.date) : undefined}
      />
    </div>
  );
}

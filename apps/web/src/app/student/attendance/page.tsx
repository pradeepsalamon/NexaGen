"use client";

import { useEffect, useState } from "react";
import { CalendarX } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { API_ROUTES, type StudentAttendanceResponse, type StudentAttendanceHistory } from "@nexa-chess/types";
import { AttendanceLogDialog } from "@/features/attendance/components/AttendanceLogDialog";
import { StudentAttendanceView } from "@/features/attendance/components/StudentAttendanceView";
import { useAuthStore } from "@/stores/authStore";

export default function StudentAttendancePage() {
  const [data, setData] = useState<StudentAttendanceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const user = useAuthStore(state => state.user);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<StudentAttendanceHistory | null>(null);

  useEffect(() => {
    async function loadAttendance() {
      try {
        const result = await apiFetch<StudentAttendanceResponse>(API_ROUTES.attendance.student);
        setData(result);
      } catch (error) {
        console.error("Failed to load attendance", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadAttendance();
  }, []);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6 pb-10">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="space-y-2">
            <div className="h-8 w-64 bg-app-soft animate-pulse rounded-lg" />
            <div className="h-4 w-80 bg-app-soft animate-pulse rounded-lg" />
          </div>
          <div className="h-10 w-56 bg-app-soft animate-pulse rounded-full" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-36 bg-app-surface border border-app-border rounded-2xl animate-pulse" />
          ))}
        </div>
        <div className="h-96 w-full bg-app-surface border border-app-border rounded-2xl animate-pulse" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center">
        <div className="p-4 bg-app-soft rounded-full mb-4">
          <CalendarX className="h-10 w-10 text-app-muted" />
        </div>
        <h2 className="text-xl font-semibold mb-2">No Attendance Data</h2>
        <p className="text-app-muted max-w-md">
          There are no attendance records to display yet. Join a live class to start tracking your attendance.
        </p>
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
        date={selectedRecord?.date}
      />
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Loader2, CalendarX } from "lucide-react";
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
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
    <div className="max-w-6xl">
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

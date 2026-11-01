"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, CalendarX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { apiFetch } from "@/lib/api";
import { formatLongDate, formatTime } from "@/lib/datetime";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { API_ROUTES, type ClassDetailReport } from "@nexa-chess/types";
import { BackButton } from "@/components/ui/BackButton";
import { ClassSummaryCards } from "@/features/attendance/components/class-detail/ClassSummaryCards";
import { CoachAttendanceCard } from "@/features/attendance/components/class-detail/CoachAttendanceCard";
import { ClassStudentTable } from "@/features/attendance/components/class-detail/ClassStudentTable";
import { StudentAttendanceDialog } from "@/features/attendance/components/StudentAttendanceDialog";

export default function ClassDetailPage() {
  const params = useParams();
  const classId = params.id as string;
  const tz = useUserTimeZone();
  const [data, setData] = useState<ClassDetailReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [drilldownStudent, setDrilldownStudent] = useState<{ id: string; name: string } | null>(null);
  const [version, setVersion] = useState(0);
  const correction = useMemo(
    () => ({ classId, direct: true, onCorrected: () => setVersion((v) => v + 1) }),
    [classId]
  );

  useEffect(() => {
    async function loadClassDetail() {
      try {
        // A reload after a correction keeps the page on screen.
        setIsLoading(version === 0);
        const result = await apiFetch<ClassDetailReport>(
          API_ROUTES.attendance.classDetail(classId)
        );
        setData(result);
      } catch (error) {
        console.error("Failed to load class detail", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadClassDetail();
  }, [classId, version]);

  if (isLoading) {
    return (
      <div className="flex h-[60dvh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-ink" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6 max-w-6xl p-4 sm:p-6">
        <BackButton label="Back to Classes" />
        <div className="flex flex-col items-center justify-center h-[50dvh] text-center">
          <div className="p-4 bg-app-soft rounded-full mb-4">
            <CalendarX className="h-10 w-10 text-app-muted" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Class Not Found</h2>
          <p className="text-app-muted max-w-md">
            The requested class report could not be loaded.
          </p>
        </div>
      </div>
    );
  }

  const attended = data.presentCount + data.lateCount + data.partialCount;

  return (
    <div className="space-y-6 max-w-6xl p-4 sm:p-6">
      <BackButton label="Back to Classes" />

      {/* Class Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">
            {data.topic}
          </h1>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              data.status === "COMPLETED"
                ? "border border-success/40 bg-success/10 text-success-ink"
                : "border border-warning/40 bg-warning/10 text-warning-ink"
            }`}
          >
            {data.status}
          </span>
        </div>
        <p className="text-app-muted">
          {data.batchName} &middot; {data.coachName}
        </p>
        <p className="text-app-muted text-sm mt-0.5">
          {formatLongDate(data.actualStart ?? data.scheduledStart, tz)}{" "}
          {formatTime(data.actualStart ?? data.scheduledStart, tz)}{" "}
          —{" "}
          {formatTime(data.actualEnd ?? data.scheduledEnd, tz)}
        </p>
      </div>

      <ClassSummaryCards data={data} />

      {data.coachAttendance && (
        <CoachAttendanceCard coach={data.coachAttendance} />
      )}

      <ClassStudentTable
        students={data.students}
        onViewHistory={setDrilldownStudent}
        correction={correction}
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-app-border bg-app-surface shadow-card">
          <CardContent className="p-5">
            <p className="text-2xl font-bold tracking-tight">
              {data.totalStudents}
            </p>
            <p className="text-sm font-medium text-app-muted mt-1">
              Total Enrolled
            </p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-card">
          <CardContent className="p-5">
            <p className="text-2xl font-bold tracking-tight text-success-ink">
              {attended}
            </p>
            <p className="text-sm font-medium text-app-muted mt-1">Attended</p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-card">
          <CardContent className="p-5">
            <p className="text-2xl font-bold tracking-tight text-warning-ink">
              {data.absentCount}
            </p>
            <p className="text-sm font-medium text-app-muted mt-1">Absent</p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-card">
          <CardContent className="p-5">
            <p className="text-2xl font-bold tracking-tight">
              {Math.round(data.overallPercent)}%
            </p>
            <p className="text-sm font-medium text-app-muted mt-1">
              Average Attendance
            </p>
          </CardContent>
        </Card>
      </div>

      <StudentAttendanceDialog
        open={drilldownStudent !== null}
        onOpenChange={(open) => {
          if (!open) setDrilldownStudent(null);
        }}
        studentId={drilldownStudent?.id ?? null}
        studentName={drilldownStudent?.name}
      />
    </div>
  );
}

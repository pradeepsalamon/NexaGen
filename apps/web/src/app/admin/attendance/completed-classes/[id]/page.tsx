"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, CalendarX } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { apiFetch } from "@/lib/api";
import { API_ROUTES, type ClassDetailReport } from "@nexa-chess/types";
import { BackButton } from "@/components/ui/BackButton";
import { ClassSummaryCards } from "@/features/attendance/components/class-detail/ClassSummaryCards";
import { CoachAttendanceCard } from "@/features/attendance/components/class-detail/CoachAttendanceCard";
import { ClassStudentTable } from "@/features/attendance/components/class-detail/ClassStudentTable";
import { StudentAttendanceDialog } from "@/features/attendance/components/StudentAttendanceDialog";

export default function ClassDetailPage() {
  const params = useParams();
  const classId = params.id as string;
  const [data, setData] = useState<ClassDetailReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [drilldownStudent, setDrilldownStudent] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    async function loadClassDetail() {
      try {
        setIsLoading(true);
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
  }, [classId]);

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6 max-w-6xl p-4 sm:p-6">
        <BackButton label="Back to Classes" />
        <div className="flex flex-col items-center justify-center h-[50vh] text-center">
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
          <h1 className="text-3xl font-bold tracking-tight text-app-text">
            {data.topic}
          </h1>
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              data.status === "COMPLETED"
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-red-50 text-red-700 border border-red-200"
            }`}
          >
            {data.status}
          </span>
        </div>
        <p className="text-app-muted">
          {data.batchName} &middot; {data.coachName}
        </p>
        <p className="text-app-muted text-sm mt-0.5">
          {new Date(data.scheduledStart).toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}{" "}
          {new Date(data.scheduledStart).toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          —{" "}
          {new Date(data.scheduledEnd).toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>

      <ClassSummaryCards data={data} />

      {data.coachAttendance && (
        <CoachAttendanceCard coach={data.coachAttendance} />
      )}

      <ClassStudentTable
        students={data.students}
        onViewHistory={setDrilldownStudent}
      />

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-app-border bg-app-surface shadow-sm">
          <CardContent className="p-5">
            <p className="text-2xl font-bold tracking-tight">
              {data.totalStudents}
            </p>
            <p className="text-sm font-medium text-app-muted mt-1">
              Total Enrolled
            </p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-sm">
          <CardContent className="p-5">
            <p className="text-2xl font-bold tracking-tight text-green-600">
              {attended}
            </p>
            <p className="text-sm font-medium text-app-muted mt-1">Attended</p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-sm">
          <CardContent className="p-5">
            <p className="text-2xl font-bold tracking-tight text-red-600">
              {data.absentCount}
            </p>
            <p className="text-sm font-medium text-app-muted mt-1">Absent</p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-sm">
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

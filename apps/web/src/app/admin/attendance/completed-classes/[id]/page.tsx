"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, CalendarX } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { enumLabel } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { formatLongDate, formatTime } from "@/lib/datetime";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { API_ROUTES, type ClassDetailReport } from "@nexa-chess/types";
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

  const crumbs = [
    { href: "/admin/attendance", label: "Attendance" },
    { href: "/admin/attendance/completed-classes", label: "Completed classes" }
  ];

  if (!data) {
    return (
      <div className="animate-fade-in pb-10">
        <PageHeader breadcrumbs={[...crumbs, { label: "Class" }]} title="Class report" />
        <EmptyState
          description="The requested class report could not be loaded."
          icon={CalendarX}
          title="Class not found"
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6 pb-10">
      <PageHeader
        actions={
          <Badge variant={data.status === "COMPLETED" ? "success" : "warning"}>{enumLabel(data.status)}</Badge>
        }
        breadcrumbs={[...crumbs, { label: data.topic }]}
        description={
          <>
            {data.batchName} · {data.coachName} ·{" "}
            {formatLongDate(data.actualStart ?? data.scheduledStart, tz)}{" "}
            {formatTime(data.actualStart ?? data.scheduledStart, tz)}–{formatTime(data.actualEnd ?? data.scheduledEnd, tz)}
          </>
        }
        title={data.topic}
      />

      <ClassSummaryCards data={data} />

      {data.coachAttendance && (
        <CoachAttendanceCard coach={data.coachAttendance} />
      )}

      <ClassStudentTable
        students={data.students}
        onViewHistory={setDrilldownStudent}
        correction={correction}
      />

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

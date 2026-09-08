"use client";

import { useState } from "react";
import { Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Header } from "@/components/layout/Header";
import { getRoleDashboardHref, useAuthStore } from "@/stores/authStore";
import { useClassSummary } from "../../hooks/useClassSummary";
import { ClassSummaryCards } from "@/features/attendance/components/class-detail/ClassSummaryCards";
import { CoachAttendanceCard } from "@/features/attendance/components/class-detail/CoachAttendanceCard";
import { ClassStudentTable } from "@/features/attendance/components/class-detail/ClassStudentTable";
import { StudentAttendanceDialog } from "@/features/attendance/components/StudentAttendanceDialog";
import { AttendanceStatusBadge } from "@/features/attendance/components/AttendanceStatusBadge";
import { AttendancePercentBar } from "@/features/attendance/components/AttendancePercentBar";
import { formatDuration, formatLongDate, formatTime } from "@/lib/datetime";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";

function Shell({
  topic,
  children,
}: {
  topic: string;
  children: React.ReactNode;
}) {
  const user = useAuthStore((state) => state.user);
  return (
    <div className="flex h-[100dvh] flex-col">
      <Header
        compact
        centerSlot={
          <h1 className="max-w-[42vw] truncate text-center text-sm font-extrabold text-app-text sm:max-w-none sm:text-base">
            {topic}
          </h1>
        }
      />
      <div className="flex-1 overflow-auto bg-app-background pt-16">
        <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
          <div className="flex justify-end">
            <Button asChild variant="outline">
              <a href={getRoleDashboardHref(user?.role)}>Return to Dashboard</a>
            </Button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function ClassSummary({ classId }: { classId: string }) {
  const { data, isLoading, isError } = useClassSummary(classId);
  const tz = useUserTimeZone();
  const [drilldownStudent, setDrilldownStudent] = useState<{
    id: string;
    name: string;
  } | null>(null);

  if (isLoading || (!data && !isError)) {
    return (
      <Shell topic="Live Class">
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-app-muted">Loading class summary…</p>
        </div>
      </Shell>
    );
  }

  if (isError || !data) {
    return (
      <Shell topic="Live Class">
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
          <span className="text-4xl">👋</span>
          <h2 className="text-2xl font-bold tracking-tight">Class Ended</h2>
          <p className="max-w-md text-app-muted">
            This live class has concluded. Thank you for participating.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell topic={data.topic}>
      <div>
        <div className="mb-1 flex items-center gap-3">
          <h2 className="text-2xl font-bold tracking-tight text-app-text">
            {data.topic}
          </h2>
          <span className="inline-flex items-center rounded-full border border-app-border bg-app-soft px-2.5 py-0.5 text-xs font-medium text-app-muted">
            {data.status}
          </span>
        </div>
        <p className="text-sm text-app-muted">
          {data.batchName} &middot; {data.coachName} &middot;{" "}
          {formatLongDate(data.scheduledStart, tz)}{" "}
          &middot; {formatTime(data.actualStart ?? data.scheduledStart, tz)}–
          {formatTime(data.actualEnd ?? data.scheduledEnd, tz)}
          {data.actualDuration > 0 &&
            ` (${formatDuration(data.actualDuration)})`}
        </p>
      </div>

      {data.status === "CANCELLED" ? (
        <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
          <span className="text-4xl">🚫</span>
          <p className="font-medium text-app-text">This class was cancelled.</p>
        </div>
      ) : !data.finalized ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <Loader2 className="h-7 w-7 animate-spin text-primary" />
          <p className="font-medium text-app-text">Calculating attendance…</p>
          <p className="text-sm text-app-muted">
            This usually takes a few seconds. You can return to your dashboard
            anytime.
          </p>
        </div>
      ) : data.report ? (
        <>
          <ClassSummaryCards data={data.report} />
          {data.report.coachAttendance && (
            <CoachAttendanceCard coach={data.report.coachAttendance} />
          )}
          <ClassStudentTable
            students={data.report.students}
            onViewHistory={setDrilldownStudent}
          />
          <StudentAttendanceDialog
            open={drilldownStudent !== null}
            onOpenChange={(open) => {
              if (!open) setDrilldownStudent(null);
            }}
            studentId={drilldownStudent?.id ?? null}
            studentName={drilldownStudent?.name}
          />
        </>
      ) : data.myAttendance ? (
        <Card className="border-app-border bg-app-surface shadow-sm">
          <CardContent className="space-y-5 p-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-app-muted">
                Your attendance
              </span>
              <AttendanceStatusBadge status={data.myAttendance.status} />
            </div>

            <div>
              <p className="mb-1 text-2xl font-bold tracking-tight">
                {Math.round(data.myAttendance.attendancePercent)}%
              </p>
              <AttendancePercentBar
                percent={data.myAttendance.attendancePercent}
                showText={false}
              />
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs font-medium uppercase text-app-muted">
                  Joined
                </p>
                <p className="text-sm font-medium text-app-text">
                  {formatTime(data.myAttendance.joinedAt, tz) || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-app-muted">
                  Left
                </p>
                <p className="text-sm font-medium text-app-text">
                  {formatTime(data.myAttendance.leftAt, tz) || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-app-muted">
                  Time in class
                </p>
                <p className="text-sm font-medium text-app-text">
                  {formatDuration(data.myAttendance.totalDuration)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-app-muted">
                  Reconnects
                </p>
                <p className="text-sm font-medium text-app-text">
                  {data.myAttendance.reconnectCount}
                </p>
              </div>
            </div>

            <Button asChild variant="ghost" className="gap-1.5 px-0 text-primary">
              <a href="/student/attendance">
                <RotateCw className="h-4 w-4" />
                View full attendance history
              </a>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </Shell>
  );
}

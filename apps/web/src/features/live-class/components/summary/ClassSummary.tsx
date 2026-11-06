"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Ban, CalendarCheck, History } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Header } from "@/components/layout/Header";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { getRoleDashboardHref, useAuthStore } from "@/stores/authStore";
import { useClassSummary } from "../../hooks/useClassSummary";
import { ClassSummaryCards } from "@/features/attendance/components/class-detail/ClassSummaryCards";
import { CoachAttendanceCard } from "@/features/attendance/components/class-detail/CoachAttendanceCard";
import { ClassStudentTable } from "@/features/attendance/components/class-detail/ClassStudentTable";
import { StudentAttendanceDialog } from "@/features/attendance/components/StudentAttendanceDialog";
import { AttendanceStatusBadge } from "@/features/attendance/components/AttendanceStatusBadge";
import { AttendancePercentBar } from "@/features/attendance/components/AttendancePercentBar";
import { formatDuration, formatLongDate, formatTime } from "@/lib/datetime";
import { queryKeys } from "@/lib/queryKeys";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { ClassEndFeedback } from "@/features/feedback/components/ClassEndFeedback";
import { Badge } from "@/components/ui/Badge";
import { enumLabel } from "@/lib/utils";
import { Spinner } from "@/components/ui/Spinner";

function Shell({
  badge,
  description,
  topic,
  children,
}: {
  badge?: React.ReactNode;
  description?: React.ReactNode;
  topic: string;
  children: React.ReactNode;
}) {
  const user = useAuthStore((state) => state.user);
  return (
    <div className="flex h-[100dvh] flex-col">
      <Header
        compact
        centerSlot={
          // A location label, like the app header's: the page's h1 is below.
          <p className="max-w-[42vw] truncate text-center text-sm font-extrabold text-app-text sm:max-w-none sm:text-base">
            {topic}
          </p>
        }
      />
      <div className="flex-1 overflow-auto bg-app-background pt-16">
        <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
          <PageHeader
            actions={
              <Button asChild variant="neutral">
                <a href={getRoleDashboardHref(user?.role)}>Return to dashboard</a>
              </Button>
            }
            description={description}
            title={
              <span className="flex flex-wrap items-center gap-3">
                {topic}
                {badge}
              </span>
            }
          />
          {children}
        </div>
      </div>
    </div>
  );
}

export function ClassSummary({ classId }: { classId: string }) {
  const { data, isLoading, isError } = useClassSummary(classId);
  const queryClient = useQueryClient();
  const tz = useUserTimeZone();
  const [drilldownStudent, setDrilldownStudent] = useState<{
    id: string;
    name: string;
  } | null>(null);

  if (isLoading || (!data && !isError)) {
    return (
      <Shell topic="Live class">
        <p className="flex items-center justify-center gap-2 py-24 text-sm font-medium text-app-muted">
          <Spinner aria-hidden="true" className="size-4" />
          Loading class summary…
        </p>
      </Shell>
    );
  }

  if (isError || !data) {
    return (
      <Shell topic="Live class">
        <EmptyState
          description="This live class has concluded. Thank you for participating."
          icon={CalendarCheck}
          title="Class ended"
        />
      </Shell>
    );
  }

  return (
    <Shell
      badge={<Badge variant="secondary">{enumLabel(data.status)}</Badge>}
      description={
        <>
          {data.batchName} &middot; {data.coachName} &middot;{" "}
          {formatLongDate(data.scheduledStart, tz)}{" "}
          &middot; {formatTime(data.actualStart ?? data.scheduledStart, tz)}–
          {formatTime(data.actualEnd ?? data.scheduledEnd, tz)}
          {data.actualDuration > 0 &&
            ` (${formatDuration(data.actualDuration)})`}
        </>
      }
      topic={data.topic}
    >

      {data.status !== "CANCELLED" ? <ClassEndFeedback classId={classId} /> : null}

      {data.status === "CANCELLED" ? (
        <EmptyState icon={Ban} title="This class was cancelled" />
      ) : !data.finalized ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <Spinner aria-hidden="true" className="size-6 text-app-muted" />
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
            correction={{
              classId,
              direct: data.viewerRole === "ADMIN",
              onCorrected: () =>
                queryClient.invalidateQueries({ queryKey: queryKeys.attendance.classSummary(classId) }),
            }}
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
        <Card>
          <CardContent className="space-y-5 p-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-app-muted">
                Your attendance
              </span>
              <AttendanceStatusBadge status={data.myAttendance.status} />
            </div>

            <div>
              <p className="mb-1 font-display text-2xl font-bold tracking-tight tabular-nums text-app-text">
                {Math.round(data.myAttendance.attendancePercent)}%
              </p>
              <AttendancePercentBar
                percent={data.myAttendance.attendancePercent}
                showText={false}
              />
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div>
                <p className="text-xs font-medium text-app-muted">
                  Joined
                </p>
                <p className="text-sm font-medium text-app-text">
                  {formatTime(data.myAttendance.joinedAt, tz) || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-app-muted">
                  Left
                </p>
                <p className="text-sm font-medium text-app-text">
                  {formatTime(data.myAttendance.leftAt, tz) || "—"}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-app-muted">
                  Time in class
                </p>
                <p className="text-sm font-medium text-app-text">
                  {formatDuration(data.myAttendance.totalDuration)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-app-muted">
                  Reconnects
                </p>
                <p className="text-sm font-medium text-app-text">
                  {data.myAttendance.reconnectCount}
                </p>
              </div>
            </div>

            <Button asChild variant="outline">
              <a href="/student/attendance">
                <History className="size-4" strokeWidth={2.5} />
                View full attendance history
              </a>
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </Shell>
  );
}

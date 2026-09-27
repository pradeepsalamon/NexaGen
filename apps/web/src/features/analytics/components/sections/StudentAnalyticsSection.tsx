"use client";

import type { AnalyticsRangeQuery } from "@nexa-chess/types";
import { KpiCard } from "@/components/ui/KpiCard";
import { KpiCardRow } from "@/components/ui/KpiCardRow";
import { SectionCard } from "@/components/ui/SectionCard";
import { WidgetError } from "@/components/ui/WidgetError";
import { useStudentAnalyticsQuery } from "../../hooks/useAnalyticsApi";
import { asKpi, formatHours, formatPercent, relativeTime } from "../../lib/format";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";

export function StudentAnalyticsSection({
  query
}: {
  query: AnalyticsRangeQuery;
}) {
  const { data, isLoading, isError, refetch } = useStudentAnalyticsQuery(query);
  const k = data?.kpis;

  return (
    <SectionCard
      description="Student roster, engagement and who needs a nudge."
      title="Student analytics"
      updatedAt={data?.meta.generatedAt}
      onRefresh={() => refetch()}
    >
      {isError ? (
        <WidgetError message="Couldn't load student analytics." onRetry={() => refetch()} />
      ) : (
        <>
          <KpiCardRow columns={5}>
            <KpiCard isLoading={isLoading} kpi={asKpi(k?.totalStudents)} label="Total students" />
            <KpiCard isLoading={isLoading} kpi={asKpi(k?.activeStudents)} label="Active" />
            <KpiCard isLoading={isLoading} kpi={asKpi(k?.newStudents)} label="New" />
            <KpiCard isLoading={isLoading} kpi={asKpi(k?.enrolledInBatch)} label="In a batch" />
            <KpiCard isLoading={isLoading} kpi={asKpi(k?.attendingClasses)} label="Attending classes" />
            <KpiCard isLoading={isLoading} kpi={asKpi(k?.completedDemo)} label="Completed a demo" />
            <KpiCard isLoading={isLoading} kpi={asKpi(k?.convertedDemoToBatch)} label="Demo → batch" />
            <KpiCard invertDelta isLoading={isLoading} kpi={asKpi(k?.noUpcomingClass)} label="No upcoming class" />
            <KpiCard invertDelta isLoading={isLoading} kpi={asKpi(k?.poorAttendance)} label="Poor attendance" />
            <KpiCard invertDelta isLoading={isLoading} kpi={asKpi(k?.inactiveForThreshold)} label={`Inactive ${data?.inactivityThresholdDays ?? 30}d+`} />
          </KpiCardRow>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-bold text-app-text">
                Below {data?.lowAttendanceThreshold ?? 75}% attendance
              </p>
              <StudentTable rows={data?.lowAttendanceStudents ?? []} isLoading={isLoading} danger />
            </div>
            <div>
              <p className="mb-2 text-sm font-bold text-app-text">Most engaged</p>
              <StudentTable rows={data?.mostEngaged ?? []} isLoading={isLoading} />
            </div>
          </div>
        </>
      )}
    </SectionCard>
  );
}

function StudentTable({
  rows,
  isLoading,
  danger
}: {
  rows: {
    studentId: string;
    name: string;
    attendancePercent: number | null;
    classesAttended: number;
    classesMissed: number;
    learningHours: number;
    lastActiveAt: string | null;
  }[];
  isLoading: boolean;
  danger?: boolean;
}) {
  const tz = useUserTimeZone();
  return (
    <div className="overflow-x-auto">
      <Table className="w-full min-w-[420px] text-left text-sm">
        <TableHeader className="text-xs uppercase tracking-wide text-app-muted">
          <TableRow>
            <TableHead className="pb-2">Student</TableHead>
            <TableHead className="pb-2 text-right">Attendance</TableHead>
            <TableHead className="pb-2 text-right">Hours</TableHead>
            <TableHead className="pb-2 text-right">Last active</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="divide-y divide-app-border">
          {rows.map((s) => (
            <TableRow key={s.studentId}>
              <TableCell className="text-left py-2 font-medium text-app-text">{s.name}</TableCell>
              <TableCell
                className={`py-2 text-right font-semibold ${
                  danger ? "text-app-danger" : "text-app-text"
                }`}
              >
                {formatPercent(s.attendancePercent)}
              </TableCell>
              <TableCell className="py-2 text-right">{formatHours(s.learningHours)}</TableCell>
              <TableCell className="py-2 text-right text-app-muted">
                {relativeTime(s.lastActiveAt, tz)}
              </TableCell>
            </TableRow>
          ))}
          {isLoading ? (
            <TableRow><TableCell className="text-left py-3 text-app-muted" colSpan={4}>Loading…</TableCell></TableRow>
          ) : null}
          {!isLoading && rows.length === 0 ? (
            <TableRow><TableCell className="text-left py-3 text-app-muted" colSpan={4}>Nothing to show.</TableCell></TableRow>
          ) : null}
        </TableBody>
      </Table>
    </div>
  );
}

"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AreaChartCard } from "@/components/charts/Charts";
import { ChartContainer } from "@/components/charts/ChartContainer";
import { KpiCard } from "@/components/ui/KpiCard";
import { KpiCardRow } from "@/components/ui/KpiCardRow";
import { WidgetError } from "@/components/ui/WidgetError";
import { AnalyticsPageShell } from "@/features/analytics/components/AnalyticsPageShell";
import { RankBarList } from "@/features/analytics/components/RankBarList";
import { useCoachDetailQuery } from "@/features/analytics/hooks/useAnalyticsApi";
import {
  asKpi,
  formatHours,
  formatPercent
} from "@/features/analytics/lib/format";
import { formatDayMonth, formatFullDate } from "@/lib/datetime";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { useTableSort } from "@/hooks/useTableSort";
import { SortButton } from "@/components/ui/DataTableSortButton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";

export function CoachDetailPageClient({ coachId }: { coachId: string }) {
  return (
    <AnalyticsPageShell title="Coach Analytics">
      {(query) => <Body coachId={coachId} query={query} />}
    </AnalyticsPageShell>
  );
}

function Body({ coachId, query }: { coachId: string; query: Parameters<typeof useCoachDetailQuery>[1] }) {
  const { data, isLoading, isError, refetch } = useCoachDetailQuery(coachId, query);
  const tz = useUserTimeZone();
  const c = data?.coach;
  const { rows: classes, sortProps } = useTableSort({
    rows: data?.recentClasses,
    accessors: {
      attendance: (cls) => cls.attendancePercent,
      batch: (cls) => cls.batchName,
      date: (cls) => cls.date,
      duration: (cls) => cls.durationMinutes,
      status: (cls) => cls.status,
      topic: (cls) => cls.topic
    }
  });

  if (isError) {
    return <WidgetError message="Couldn't load this coach." onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-5">
      <Link
        className="inline-flex items-center gap-1 text-sm font-semibold text-primary-ink hover:underline"
        href="/admin/analytics/coaches"
      >
        <ArrowLeft className="size-4" /> All coaches
      </Link>

      <div>
        <h2 className="text-lg font-extrabold text-app-text">
          {isLoading ? "Loading…" : c?.name}
        </h2>
        {c ? <p className="text-sm text-app-muted">{c.email}</p> : null}
      </div>

      <KpiCardRow columns={4}>
        <KpiCard isLoading={isLoading} kpi={asKpi(c?.completedClasses)} label="Completed classes" />
        <KpiCard isLoading={isLoading} kpi={asKpi(c?.teachingHours)} label="Teaching hours" unit="hours" />
        <KpiCard isLoading={isLoading} kpi={asKpi(c?.students)} label="Students" />
        <KpiCard isLoading={isLoading} kpi={asKpi(c?.avgAttendancePercent)} label="Avg attendance" unit="percent" />
        <KpiCard isLoading={isLoading} kpi={asKpi(c?.avgClassDurationMinutes)} label="Avg duration (min)" />
        <KpiCard invertDelta isLoading={isLoading} kpi={asKpi(c?.cancelledClasses)} label="Cancelled" />
      </KpiCardRow>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="rounded-app border border-app-border bg-app-surface p-4 shadow-card">
          <p className="mb-2 text-sm font-bold text-app-text">Teaching hours over time</p>
          <ChartContainer
            isEmpty={!isLoading && (data?.teachingHoursTrend.points.every((p) => p.value === 0) ?? true)}
            isLoading={isLoading}
          >
            <AreaChartCard
              data={data?.teachingHoursTrend.points ?? []}
              series={[{ key: "value", label: "Hours" }]}
              xFormat={(d) => formatDayMonth(d, tz)}
              xKey="date"
            />
          </ChartContainer>
        </div>
        <div className="rounded-app border border-app-border bg-app-surface p-4 shadow-card">
          <p className="mb-2 text-sm font-bold text-app-text">Hours by batch</p>
          <RankBarList
            rows={(data?.hoursByBatch ?? []).map((b) => ({
              key: b.key,
              label: b.label,
              value: b.count,
              display: formatHours(b.count)
            }))}
          />
        </div>
      </div>

      <div className="rounded-app border border-app-border bg-app-surface p-4 shadow-card">
        <p className="mb-2 text-sm font-bold text-app-text">Recent classes</p>
        <div className="overflow-x-auto">
          <Table className="w-full min-w-[560px] text-left text-sm">
            <TableHeader className="text-xs uppercase tracking-wide text-app-muted">
              <TableRow>
                <TableHead className="pb-2"><SortButton label="Class" {...sortProps("topic")} /></TableHead>
                <TableHead className="pb-2"><SortButton label="Batch" {...sortProps("batch")} /></TableHead>
                <TableHead className="pb-2"><SortButton label="Date" {...sortProps("date")} /></TableHead>
                <TableHead className="pb-2 text-right"><SortButton label="Duration" {...sortProps("duration")} /></TableHead>
                <TableHead className="pb-2 text-right"><SortButton label="Attendance" {...sortProps("attendance")} /></TableHead>
                <TableHead className="pb-2"><SortButton label="Status" {...sortProps("status")} /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-app-border">
              {classes.map((cls) => (
                <TableRow key={cls.classId}>
                  <TableCell className="text-left py-2">
                    <Link className="text-primary-ink hover:underline" href={`/classes/${cls.classId}`}>
                      {cls.topic}
                    </Link>
                  </TableCell>
                  <TableCell className="text-left py-2 text-app-muted">{cls.batchName ?? "—"}</TableCell>
                  <TableCell className="text-left py-2 text-app-muted">{formatFullDate(cls.date, tz)}</TableCell>
                  <TableCell className="py-2 text-right">{cls.durationMinutes} min</TableCell>
                  <TableCell className="py-2 text-right">{formatPercent(cls.attendancePercent)}</TableCell>
                  <TableCell className="text-left py-2">{cls.status}</TableCell>
                </TableRow>
              ))}
              {!isLoading && (data?.recentClasses.length ?? 0) === 0 ? (
                <TableRow><TableCell className="text-left py-3 text-app-muted" colSpan={6}>No classes in this period.</TableCell></TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

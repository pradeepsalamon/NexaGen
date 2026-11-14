"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LineChartCard } from "@/components/charts/Charts";
import { ChartContainer } from "@/components/charts/ChartContainer";
import { KpiCard } from "@/components/ui/KpiCard";
import { KpiCardRow } from "@/components/ui/KpiCardRow";
import { WidgetError } from "@/components/ui/WidgetError";
import { AnalyticsPageShell } from "@/features/analytics/components/AnalyticsPageShell";
import { useBatchDetailQuery } from "@/features/analytics/hooks/useAnalyticsApi";
import {
  asKpi,
  formatPercent,
  relativeTime
} from "@/features/analytics/lib/format";
import { formatDayMonth } from "@/lib/datetime";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { useTableSort } from "@/hooks/useTableSort";
import { SortButton } from "@/components/ui/DataTableSortButton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";

export function BatchDetailPageClient({ batchId }: { batchId: string }) {
  return (
    <AnalyticsPageShell title="Batch analytics">
      {(query) => <Body batchId={batchId} query={query} />}
    </AnalyticsPageShell>
  );
}

function Body({
  batchId,
  query
}: {
  batchId: string;
  query: Parameters<typeof useBatchDetailQuery>[1];
}) {
  const { data, isLoading, isError, refetch } = useBatchDetailQuery(batchId, query);
  const tz = useUserTimeZone();
  const b = data?.batch;
  const { rows: students, sortProps } = useTableSort({
    rows: data?.students,
    accessors: {
      attendance: (s) => s.attendancePercent,
      attended: (s) => s.classesAttended,
      lastActive: (s) => s.lastActiveAt,
      name: (s) => s.name
    }
  });

  if (isError) {
    return <WidgetError message="Couldn't load this batch." onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-5">
      <Link
        className="inline-flex items-center gap-1 text-sm font-semibold text-primary-ink hover:underline"
        href="/admin/analytics/batches"
      >
        <ArrowLeft className="size-4" /> All batches
      </Link>
      <div>
        <h2 className="text-lg font-extrabold text-app-text">
          {isLoading ? "Loading…" : b?.name}
        </h2>
        {b ? (
          <p className="text-sm text-app-muted">
            {b.status} · {b.coachNames.join(", ") || "no coach"}
          </p>
        ) : null}
      </div>

      <KpiCardRow columns={4}>
        <KpiCard isLoading={isLoading} kpi={asKpi(b?.students)} label="Students" />
        <KpiCard isLoading={isLoading} kpi={asKpi(b?.classes)} label="Classes" />
        <KpiCard isLoading={isLoading} kpi={asKpi(b?.completedClasses)} label="Completed" />
        <KpiCard isLoading={isLoading} kpi={asKpi(b?.attendancePercent)} label="Attendance" unit="percent" />
        <KpiCard isLoading={isLoading} kpi={asKpi(b?.teachingHours)} label="Teaching hours" unit="hours" />
      </KpiCardRow>

      <div className="rounded-app border border-app-border bg-app-surface p-4 shadow-card">
        <p className="mb-2 text-sm font-bold text-app-text">Attendance over time</p>
        <ChartContainer
          isEmpty={!isLoading && (data?.attendanceTrend.points.every((p) => p.value === 0) ?? true)}
          isLoading={isLoading}
        >
          <LineChartCard
            data={data?.attendanceTrend.points ?? []}
            format={(v) => `${v}%`}
            series={[{ key: "value", label: "Attendance %" }]}
            xFormat={(d) => formatDayMonth(d, tz)}
            xKey="date"
          />
        </ChartContainer>
      </div>

      <div className="rounded-app border border-app-border bg-app-surface p-4 shadow-card">
        <p className="mb-2 text-sm font-bold text-app-text">Students</p>
        <div className="overflow-x-auto">
          <Table className="w-full min-w-[480px] text-left text-sm">
            <TableHeader className="text-xs text-app-muted">
              <TableRow>
                <TableHead className="pb-2"><SortButton label="Student" {...sortProps("name")} /></TableHead>
                <TableHead className="pb-2 text-right"><SortButton label="Attendance" {...sortProps("attendance")} /></TableHead>
                <TableHead className="pb-2 text-right"><SortButton label="Attended" {...sortProps("attended")} /></TableHead>
                <TableHead className="pb-2 text-right"><SortButton label="Last active" {...sortProps("lastActive")} /></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-app-border">
              {students.map((s) => (
                <TableRow key={s.studentId}>
                  <TableCell className="text-left py-2 font-medium text-app-text">{s.name}</TableCell>
                  <TableCell className="py-2 text-right">{formatPercent(s.attendancePercent)}</TableCell>
                  <TableCell className="py-2 text-right">
                    {s.classesAttended}/{s.classesAttended + s.classesMissed}
                  </TableCell>
                  <TableCell className="py-2 text-right text-app-muted">
                    {relativeTime(s.lastActiveAt, tz)}
                  </TableCell>
                </TableRow>
              ))}
              {!isLoading && (data?.students.length ?? 0) === 0 ? (
                <TableRow><TableCell className="text-left py-3 text-app-muted" colSpan={4}>No students enrolled.</TableCell></TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

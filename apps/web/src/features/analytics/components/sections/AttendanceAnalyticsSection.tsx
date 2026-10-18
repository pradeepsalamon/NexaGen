"use client";

import type { AnalyticsRangeQuery } from "@nexa-chess/types";
import Link from "next/link";
import { LineChartCard } from "@/components/charts/Charts";
import { ChartContainer } from "@/components/charts/ChartContainer";
import { KpiCard } from "@/components/ui/KpiCard";
import { KpiCardRow } from "@/components/ui/KpiCardRow";
import { SectionCard } from "@/components/ui/SectionCard";
import { WidgetError } from "@/components/ui/WidgetError";
import { useAttendanceAnalyticsQuery } from "../../hooks/useAnalyticsApi";
import { asKpi, formatPercent, relativeTime } from "../../lib/format";
import { formatDayMonth } from "@/lib/datetime";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { RankBarList } from "../RankBarList";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useTableSort } from "@/hooks/useTableSort";
import { SortButton } from "@/components/ui/DataTableSortButton";

export function AttendanceAnalyticsSection({
  query
}: {
  query: AnalyticsRangeQuery;
}) {
  const { data, isLoading, isError, refetch } = useAttendanceAnalyticsQuery(query);
  const tz = useUserTimeZone();
  const k = data?.kpis;
  const { rows: lowStudents, sortProps } = useTableSort({
    rows: data?.lowAttendanceStudents,
    accessors: {
      attendance: (s) => s.attendancePercent,
      attended: (s) => s.classesAttended,
      batch: (s) => s.batchName,
      lastActive: (s) => s.lastActiveAt,
      name: (s) => s.name
    }
  });

  return (
    <SectionCard
      description="Overall attendance, trend, and which batches / coaches / students need attention."
      title="Attendance analytics"
      updatedAt={data?.meta.generatedAt}
      onRefresh={() => refetch()}
    >
      {isError ? (
        <WidgetError message="Couldn't load attendance analytics." onRetry={() => refetch()} />
      ) : (
        <>
          <KpiCardRow columns={4}>
            <KpiCard isLoading={isLoading} kpi={asKpi(k?.overallRate)} label="Overall rate" unit="percent" tooltip="Attended rows (PRESENT/LATE) ÷ expected rows over COMPLETED classes." />
            <KpiCard isLoading={isLoading} kpi={asKpi(k?.coachCompletionRate)} label="Coach completion" unit="percent" tooltip="Share of scheduled batch classes that reached COMPLETED status." />
            <KpiCard isLoading={isLoading} kpi={asKpi(k?.classesAttended)} label="Attendances" />
            <KpiCard invertDelta isLoading={isLoading} kpi={asKpi(k?.classesMissed)} label="Missed" />
            <KpiCard isLoading={isLoading} kpi={asKpi(k?.avgAttendanceDurationMinutes)} label="Avg time in class (min)" />
          </KpiCardRow>

          <div className="mt-6">
            <p className="mb-2 text-sm font-bold text-app-text">Attendance rate over time</p>
            <ChartContainer
              isEmpty={!isLoading && (data?.trend.points.every((p) => p.value === 0) ?? true)}
              isError={isError}
              isLoading={isLoading}
              emptyMessage="No completed classes in this period."
            >
              <LineChartCard
                data={data?.trend.points ?? []}
                format={(v) => `${v}%`}
                series={[{ key: "value", label: "Attendance %" }]}
                xFormat={(d) => formatDayMonth(d, tz)}
                xKey="date"
              />
            </ChartContainer>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-bold text-app-text">Attendance by batch</p>
              <RankBarList
                emptyMessage="No batch attendance yet."
                rows={(data?.byBatch ?? []).map((r) => ({
                  key: r.id,
                  label: r.label,
                  sublabel: `${r.attended}/${r.expected} across ${r.classes} classes`,
                  value: r.attendancePercent ?? 0,
                  display: formatPercent(r.attendancePercent),
                  href: `/admin/analytics/batches/${r.id}`
                }))}
              />
            </div>
            <div>
              <p className="mb-2 text-sm font-bold text-app-text">Attendance by coach</p>
              <RankBarList
                emptyMessage="No coach attendance yet."
                rows={(data?.byCoach ?? []).map((r) => ({
                  key: r.id,
                  label: r.label,
                  sublabel: r.sublabel,
                  value: r.attendancePercent ?? 0,
                  display: formatPercent(r.attendancePercent),
                  href: `/admin/analytics/coaches/${r.id}`
                }))}
              />
            </div>
          </div>

          <div className="mt-6">
            <p className="mb-2 text-sm font-bold text-app-text">
              Students below {data?.lowAttendanceThreshold ?? 75}% attendance
            </p>
            <div className="overflow-x-auto">
              <Table className="w-full min-w-[520px] text-left text-sm">
                <TableHeader className="text-xs text-app-muted">
                  <TableRow>
                    <TableHead className="pb-2"><SortButton label="Student" {...sortProps("name")} /></TableHead>
                    <TableHead className="pb-2"><SortButton label="Batch" {...sortProps("batch")} /></TableHead>
                    <TableHead className="pb-2 text-right"><SortButton label="Attendance" {...sortProps("attendance")} /></TableHead>
                    <TableHead className="pb-2 text-right"><SortButton label="Attended" {...sortProps("attended")} /></TableHead>
                    <TableHead className="pb-2 text-right"><SortButton label="Last active" {...sortProps("lastActive")} /></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-app-border">
                  {lowStudents.map((s) => (
                    <TableRow key={s.studentId}>
                      <TableCell className="text-left py-2 font-medium text-app-text">{s.name}</TableCell>
                      <TableCell className="text-left py-2 text-app-muted">{s.batchName ?? "—"}</TableCell>
                      <TableCell className="py-2 text-right font-semibold text-app-danger">
                        {formatPercent(s.attendancePercent)}
                      </TableCell>
                      <TableCell className="py-2 text-right">
                        {s.classesAttended}/{s.classesAttended + s.classesMissed}
                      </TableCell>
                      <TableCell className="py-2 text-right text-app-muted">
                        {relativeTime(s.lastActiveAt, tz)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!isLoading && (data?.lowAttendanceStudents.length ?? 0) === 0 ? (
                    <TableRow>
                      <TableCell className="text-left py-3 text-app-muted" colSpan={5}>
                        No students are below the threshold. 🎉
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
            <Link
              className="mt-2 inline-block text-xs font-semibold text-primary-ink hover:underline"
              href="/admin/analytics/attendance"
            >
              Full attendance report →
            </Link>
          </div>
        </>
      )}
    </SectionCard>
  );
}

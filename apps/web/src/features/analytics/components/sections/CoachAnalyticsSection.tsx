"use client";

import type { AnalyticsRangeQuery } from "@nexa-chess/types";
import { useMemo } from "react";
import Link from "next/link";
import { AreaChartCard } from "@/components/charts/Charts";
import { ChartContainer } from "@/components/charts/ChartContainer";
import { KpiCard } from "@/components/ui/KpiCard";
import { KpiCardRow } from "@/components/ui/KpiCardRow";
import { SectionCard } from "@/components/ui/SectionCard";
import { WidgetError } from "@/components/ui/WidgetError";
import { useCoachAnalyticsQuery } from "../../hooks/useAnalyticsApi";
import { asKpi as num, formatHours, formatPercent } from "../../lib/format";
import { formatDayMonth } from "@/lib/datetime";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { METRIC_TOOLTIPS } from "../../lib/metricTooltips";
import { RankBarList } from "../RankBarList";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useTableSort } from "@/hooks/useTableSort";
import { SortButton } from "@/components/ui/DataTableSortButton";

export function CoachAnalyticsSection({
  query,
  showTable = true
}: {
  query: AnalyticsRangeQuery;
  showTable?: boolean;
}) {
  const { data, isLoading, isError, refetch } = useCoachAnalyticsQuery(query);
  const topCoaches = useMemo(() => data?.leaderboard.slice(0, 8), [data]);
  const { rows: coaches, sortProps } = useTableSort({
    rows: topCoaches,
    accessors: {
      attendance: (c) => c.avgAttendancePercent,
      classes: (c) => c.completedClasses,
      duration: (c) => c.avgClassDurationMinutes,
      hours: (c) => c.teachingHours,
      name: (c) => c.name,
      students: (c) => c.students
    }
  });
  const tz = useUserTimeZone();
  const k = data?.kpis;

  return (
    <SectionCard
      description="Coach activity, teaching hours and a performance leaderboard for the period."
      title="Coach performance"
      updatedAt={data?.meta.generatedAt}
      onRefresh={() => refetch()}
    >
      {isError ? (
        <WidgetError message="Couldn't load coach analytics." onRetry={() => refetch()} />
      ) : (
        <>
          <KpiCardRow columns={4}>
            <KpiCard isLoading={isLoading} kpi={num(k?.totalCoaches)} label="Total coaches" />
            <KpiCard isLoading={isLoading} kpi={num(k?.activeCoaches)} label="Active coaches" />
            <KpiCard isLoading={isLoading} kpi={num(k?.teachingThisMonth)} label="Teaching this month" />
            <KpiCard isLoading={isLoading} kpi={num(k?.totalClassesConducted)} label="Classes conducted" />
            <KpiCard isLoading={isLoading} kpi={num(k?.totalTeachingHours)} label="Teaching hours" tooltip={METRIC_TOOLTIPS.coachTeachingHours} unit="hours" />
            <KpiCard isLoading={isLoading} kpi={num(k?.teachingHoursThisMonth)} label="Hours this month" unit="hours" />
            <KpiCard isLoading={isLoading} kpi={num(k?.teachingHoursThisWeek)} label="Hours this week" unit="hours" />
            <KpiCard isLoading={isLoading} kpi={num(k?.avgClassDurationMinutes)} label="Avg class (min)" />
            <KpiCard isLoading={isLoading} kpi={num(k?.avgAttendancePercent)} label="Avg attendance" unit="percent" />
            <KpiCard invertDelta isLoading={isLoading} kpi={num(k?.cancelledClasses)} label="Cancelled classes" />
          </KpiCardRow>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
            <div>
              <p className="mb-2 text-sm font-bold text-app-text">Teaching hours over time</p>
              <ChartContainer
                isEmpty={!isLoading && (data?.teachingHoursTrend.points.every((p) => p.value === 0) ?? true)}
                isError={isError}
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
            <div>
              <p className="mb-2 text-sm font-bold text-app-text">Hours by coach</p>
              <RankBarList
                rows={(data?.hoursByCoach ?? []).map((c) => ({
                  key: c.key,
                  label: c.label,
                  value: c.count,
                  display: formatHours(c.count),
                  href: `/admin/analytics/coaches/${c.key}`
                }))}
              />
            </div>
          </div>

          {showTable ? (
            <div className="mt-6 overflow-x-auto">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-bold text-app-text">Leaderboard</p>
                <Link className="text-xs font-semibold text-primary-ink hover:underline" href="/admin/analytics/coaches">
                  View full table →
                </Link>
              </div>
              <Table className="w-full min-w-[640px] text-left text-sm">
                <TableHeader className="text-xs text-app-muted">
                  <TableRow>
                    <TableHead className="pb-2"><SortButton label="Coach" {...sortProps("name")} /></TableHead>
                    <TableHead className="pb-2 text-right"><SortButton label="Classes" {...sortProps("classes")} /></TableHead>
                    <TableHead className="pb-2 text-right"><SortButton label="Hours" {...sortProps("hours")} /></TableHead>
                    <TableHead className="pb-2 text-right"><SortButton label="Students" {...sortProps("students")} /></TableHead>
                    <TableHead className="pb-2 text-right"><SortButton label="Attendance" {...sortProps("attendance")} /></TableHead>
                    <TableHead className="pb-2 text-right"><SortButton label="Avg duration" {...sortProps("duration")} /></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-app-border">
                  {coaches.map((c) => (
                    <TableRow key={c.coachId}>
                      <TableCell className="text-left py-2">
                        <Link className="font-medium text-primary-ink hover:underline" href={`/admin/analytics/coaches/${c.coachId}`}>
                          {c.name}
                        </Link>
                      </TableCell>
                      <TableCell className="py-2 text-right">{c.completedClasses}/{c.classesConducted}</TableCell>
                      <TableCell className="py-2 text-right">{formatHours(c.teachingHours)}</TableCell>
                      <TableCell className="py-2 text-right">{c.students}</TableCell>
                      <TableCell className="py-2 text-right">{formatPercent(c.avgAttendancePercent)}</TableCell>
                      <TableCell className="py-2 text-right">{c.avgClassDurationMinutes ?? "—"} min</TableCell>
                    </TableRow>
                  ))}
                  {isLoading ? (
                    <TableRow><TableCell className="text-left py-3 text-app-muted" colSpan={6}>Loading…</TableCell></TableRow>
                  ) : null}
                  {!isLoading && (data?.leaderboard.length ?? 0) === 0 ? (
                    <TableRow><TableCell className="text-left py-3 text-app-muted" colSpan={6}>No coach activity for this period.</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </>
      )}
    </SectionCard>
  );
}

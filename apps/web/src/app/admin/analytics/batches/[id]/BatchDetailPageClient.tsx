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

export function BatchDetailPageClient({ batchId }: { batchId: string }) {
  return (
    <AnalyticsPageShell title="Batch Analytics">
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

  if (isError) {
    return <WidgetError message="Couldn't load this batch." onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-5">
      <Link
        className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
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
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-app-muted">
              <tr>
                <th className="pb-2">Student</th>
                <th className="pb-2 text-right">Attendance</th>
                <th className="pb-2 text-right">Attended</th>
                <th className="pb-2 text-right">Last active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border">
              {(data?.students ?? []).map((s) => (
                <tr key={s.studentId}>
                  <td className="py-2 font-medium text-app-text">{s.name}</td>
                  <td className="py-2 text-right">{formatPercent(s.attendancePercent)}</td>
                  <td className="py-2 text-right">
                    {s.classesAttended}/{s.classesAttended + s.classesMissed}
                  </td>
                  <td className="py-2 text-right text-app-muted">
                    {relativeTime(s.lastActiveAt, tz)}
                  </td>
                </tr>
              ))}
              {!isLoading && (data?.students.length ?? 0) === 0 ? (
                <tr><td className="py-3 text-app-muted" colSpan={4}>No students enrolled.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

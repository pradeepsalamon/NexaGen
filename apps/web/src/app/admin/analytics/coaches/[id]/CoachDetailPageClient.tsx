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
  formatDate,
  formatHours,
  formatPercent
} from "@/features/analytics/lib/format";

export function CoachDetailPageClient({ coachId }: { coachId: string }) {
  return (
    <AnalyticsPageShell title="Coach Analytics">
      {(query) => <Body coachId={coachId} query={query} />}
    </AnalyticsPageShell>
  );
}

function Body({ coachId, query }: { coachId: string; query: Parameters<typeof useCoachDetailQuery>[1] }) {
  const { data, isLoading, isError, refetch } = useCoachDetailQuery(coachId, query);
  const c = data?.coach;

  if (isError) {
    return <WidgetError message="Couldn't load this coach." onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-5">
      <Link
        className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
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
              xFormat={(d) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
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
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-app-muted">
              <tr>
                <th className="pb-2">Class</th>
                <th className="pb-2">Batch</th>
                <th className="pb-2">Date</th>
                <th className="pb-2 text-right">Duration</th>
                <th className="pb-2 text-right">Attendance</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border">
              {(data?.recentClasses ?? []).map((cls) => (
                <tr key={cls.classId}>
                  <td className="py-2">
                    <Link className="text-primary hover:underline" href={`/classes/${cls.classId}`}>
                      {cls.topic}
                    </Link>
                  </td>
                  <td className="py-2 text-app-muted">{cls.batchName ?? "—"}</td>
                  <td className="py-2 text-app-muted">{formatDate(cls.date)}</td>
                  <td className="py-2 text-right">{cls.durationMinutes} min</td>
                  <td className="py-2 text-right">{formatPercent(cls.attendancePercent)}</td>
                  <td className="py-2">{cls.status}</td>
                </tr>
              ))}
              {!isLoading && (data?.recentClasses.length ?? 0) === 0 ? (
                <tr><td className="py-3 text-app-muted" colSpan={6}>No classes in this period.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

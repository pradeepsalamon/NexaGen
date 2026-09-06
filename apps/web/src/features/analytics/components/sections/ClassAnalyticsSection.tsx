"use client";

import type { AnalyticsRangeQuery, ClassSegmentStats } from "@nexa-chess/types";
import { AreaChartCard, DonutChartCard } from "@/components/charts/Charts";
import { ChartContainer } from "@/components/charts/ChartContainer";
import { KpiCard } from "@/components/ui/KpiCard";
import { KpiCardRow } from "@/components/ui/KpiCardRow";
import { SectionCard } from "@/components/ui/SectionCard";
import { WidgetError } from "@/components/ui/WidgetError";
import { useClassAnalyticsQuery } from "../../hooks/useAnalyticsApi";
import { asKpi, formatHours, formatPercent } from "../../lib/format";
import { formatDayMonth } from "@/lib/datetime";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";

function SegmentCard({ title, stats }: { title: string; stats?: ClassSegmentStats }) {
  return (
    <div className="rounded-app border border-app-border bg-app-soft p-4">
      <p className="mb-2 text-sm font-bold text-app-text">{title}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {[
          ["Scheduled", stats?.scheduled],
          ["Completed", stats?.completed],
          ["Cancelled", stats?.cancelled],
          ["Total hours", stats ? formatHours(stats.totalHours) : "—"],
          ["Avg duration", stats?.avgDurationMinutes ? `${stats.avgDurationMinutes} min` : "—"]
        ].map(([label, value]) => (
          <div className="flex items-center justify-between" key={label}>
            <dt className="text-app-muted">{label}</dt>
            <dd className="font-semibold text-app-text">{value ?? 0}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function ClassAnalyticsSection({ query }: { query: AnalyticsRangeQuery }) {
  const { data, isLoading, isError, refetch } = useClassAnalyticsQuery(query);
  const tz = useUserTimeZone();
  const o = data?.overall;

  return (
    <SectionCard
      description="Live-class delivery — demo vs batch, lifecycle status, and volume over time."
      title="Live class analytics"
      updatedAt={data?.meta.generatedAt}
      onRefresh={() => refetch()}
    >
      {isError ? (
        <WidgetError message="Couldn't load class analytics." onRetry={() => refetch()} />
      ) : (
        <>
          <KpiCardRow columns={4}>
            <KpiCard isLoading={isLoading} kpi={asKpi(o?.totalClasses)} label="Total classes" />
            <KpiCard isLoading={isLoading} kpi={asKpi(o?.completedClasses)} label="Completed" />
            <KpiCard isLoading={isLoading} kpi={asKpi(o?.totalHours)} label="Live class hours" unit="hours" />
            <KpiCard isLoading={isLoading} kpi={asKpi(o?.avgDurationMinutes)} label="Avg duration (min)" />
            <KpiCard isLoading={isLoading} kpi={asKpi(o?.avgStudentsPerClass)} label="Avg students / class" />
            <KpiCard isLoading={isLoading} kpi={asKpi(o?.attendanceRate)} label="Attendance rate" unit="percent" />
            <KpiCard isLoading={isLoading} kpi={asKpi(data?.demoConversionPercent)} label="Demo → batch (approx)" unit="percent" tooltip="Of students who completed a demo in the period, the share now enrolled in a batch. Heuristic — labelled approximate." />
          </KpiCardRow>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <SegmentCard stats={data?.demo} title="Demo classes" />
            <SegmentCard stats={data?.batch} title="Batch classes" />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <div>
              <p className="mb-2 text-sm font-bold text-app-text">Completed classes over time</p>
              <ChartContainer
                isEmpty={!isLoading && (data?.trend.points.every((p) => p.value === 0) ?? true)}
                isError={isError}
                isLoading={isLoading}
              >
                <AreaChartCard
                  data={data?.trend.points ?? []}
                  series={[{ key: "value", label: "Completed" }]}
                  xFormat={(d) => formatDayMonth(d, tz)}
                  xKey="date"
                />
              </ChartContainer>
            </div>
            <div>
              <p className="mb-2 text-sm font-bold text-app-text">Status distribution</p>
              <ChartContainer
                height={220}
                isEmpty={!isLoading && (data?.statusDistribution.length ?? 0) === 0}
                isError={isError}
                isLoading={isLoading}
              >
                <DonutChartCard
                  data={(data?.statusDistribution ?? []).map((s) => ({
                    label: s.label,
                    value: s.count
                  }))}
                  height={220}
                />
              </ChartContainer>
            </div>
          </div>
          <p className="mt-3 text-xs text-app-muted">
            Attendance rate = attended (PRESENT/LATE) ÷ expected rows over COMPLETED classes. {formatPercent(o?.attendanceRate)} for this period.
          </p>
        </>
      )}
    </SectionCard>
  );
}

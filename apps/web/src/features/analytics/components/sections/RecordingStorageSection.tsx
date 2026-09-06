"use client";

import type { AnalyticsRangeQuery } from "@nexa-chess/types";
import { AreaChartCard, DonutChartCard } from "@/components/charts/Charts";
import { ChartContainer } from "@/components/charts/ChartContainer";
import { KpiCard } from "@/components/ui/KpiCard";
import { KpiCardRow } from "@/components/ui/KpiCardRow";
import { SectionCard } from "@/components/ui/SectionCard";
import { WidgetError } from "@/components/ui/WidgetError";
import { cn } from "@/lib/utils";
import {
  useRecordingAnalyticsQuery,
  useStorageAnalyticsQuery
} from "../../hooks/useAnalyticsApi";
import { asKpi, formatBytes, formatDuration } from "../../lib/format";
import { formatDayMonth } from "@/lib/datetime";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { METRIC_TOOLTIPS } from "../../lib/metricTooltips";

const STATE_STYLES: Record<string, string> = {
  normal: "text-accent",
  warning: "text-warm",
  critical: "text-app-danger",
  unknown: "text-app-muted"
};

export function RecordingStorageSection({
  query
}: {
  query: AnalyticsRangeQuery;
}) {
  const recordings = useRecordingAnalyticsQuery(query);
  const storage = useStorageAnalyticsQuery(query);
  const tz = useUserTimeZone();
  const rk = recordings.data?.kpis;
  const s = storage.data;

  return (
    <SectionCard
      description="Recording volume and duration, plus disk usage, growth and a capacity forecast."
      title="Recordings & storage"
      updatedAt={recordings.data?.meta.generatedAt}
      onRefresh={() => {
        recordings.refetch();
        storage.refetch();
      }}
    >
      {recordings.isError ? (
        <WidgetError message="Couldn't load recording analytics." onRetry={() => recordings.refetch()} />
      ) : (
        <KpiCardRow columns={4}>
          <KpiCard isLoading={recordings.isLoading} kpi={asKpi(rk?.totalRecordings)} label="Total recordings" />
          <KpiCard isLoading={recordings.isLoading} kpi={asKpi(rk?.recordingsThisMonth)} label="This month" />
          <KpiCard isLoading={recordings.isLoading} kpi={asKpi(rk?.totalDurationHours)} label="Recorded hours" unit="hours" />
          <KpiCard isLoading={recordings.isLoading} kpi={asKpi(rk?.avgDurationMinutes)} label="Avg duration (min)" />
          <KpiCard isLoading={recordings.isLoading} kpi={asKpi(rk?.totalSizeGb)} label="Recorded size" unit="gb" />
          <KpiCard invertDelta isLoading={recordings.isLoading} kpi={asKpi(rk?.missingRecordings)} label="Missing recordings" />
          <KpiCard invertDelta isLoading={recordings.isLoading} kpi={asKpi(rk?.failedRecordings)} label="Failed recordings" />
        </KpiCardRow>
      )}

      {/* Storage */}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <div className="rounded-app border border-app-border bg-app-soft p-4">
          <p className="text-sm font-bold text-app-text">Disk usage</p>
          {storage.isLoading ? (
            <p className="mt-2 text-sm text-app-muted">Loading…</p>
          ) : !s?.available ? (
            <p className="mt-2 text-sm text-app-muted">
              Data unavailable — the recordings directory could not be read.
            </p>
          ) : (
            <>
              <div className="mt-3 flex items-baseline gap-2">
                <span className={cn("text-2xl font-extrabold", STATE_STYLES[s.state])}>
                  {s.usagePercent}%
                </span>
                <span className="text-sm text-app-muted">
                  {formatBytes(s.usedBytes)} of {formatBytes(s.limitBytes)}
                </span>
              </div>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-app-surface">
                <div
                  className={cn(
                    "h-full rounded-full",
                    s.state === "critical"
                      ? "bg-app-danger"
                      : s.state === "warning"
                        ? "bg-warm"
                        : "bg-accent"
                  )}
                  style={{ width: `${Math.min(100, s.usagePercent ?? 0)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-app-muted">
                Warning at {s.warningThresholdPercent}%, critical at {s.criticalThresholdPercent}%.
                {" "}
                {formatBytes(s.remainingBytes)} remaining.
              </p>
              {s.forecast ? (
                <p className="mt-2 text-xs text-app-muted">
                  ~{formatBytes(s.forecast.avgMonthlyGrowthBytes)}/month.{" "}
                  {s.forecast.daysUntilWarning !== null
                    ? `Warning threshold in ~${s.forecast.daysUntilWarning} days.`
                    : s.forecast.daysUntilFull !== null
                      ? `Full in ~${s.forecast.daysUntilFull} days.`
                      : "No threshold breach projected within 10 years."}
                </p>
              ) : (
                <p className="mt-2 text-xs text-app-muted">
                  Not enough historical data to calculate a forecast (needs ~14 daily snapshots).
                </p>
              )}
            </>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-bold text-app-text">Storage growth</p>
          <ChartContainer
            isEmpty={!storage.isLoading && (s?.growth.points.length ?? 0) < 2}
            isError={storage.isError}
            isLoading={storage.isLoading}
            emptyMessage="Not enough snapshots yet — the growth chart fills in from deploy."
          >
            <AreaChartCard
              data={(s?.growth.points ?? []).map((p) => ({ date: p.date, GB: p.value / 1024 ** 3 }))}
              format={(v) => `${v.toFixed(1)} GB`}
              series={[{ key: "GB", label: "Storage" }]}
              xFormat={(d) => formatDayMonth(d, tz)}
              xKey="date"
            />
          </ChartContainer>
        </div>
      </div>

      {/* composition + by-type */}
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-bold text-app-text">Recordings by type</p>
          <ChartContainer
            height={200}
            isEmpty={!recordings.isLoading && (recordings.data?.byType.every((t) => t.count === 0) ?? true)}
            isLoading={recordings.isLoading}
          >
            <DonutChartCard
              data={(recordings.data?.byType ?? []).map((t) => ({ label: t.label, value: t.count }))}
              height={200}
            />
          </ChartContainer>
        </div>
        <div>
          <p className="mb-2 text-sm font-bold text-app-text">Largest recordings</p>
          <ul className="space-y-1.5 text-sm">
            {(recordings.data?.largest ?? []).slice(0, 6).map((r) => (
              <li className="flex items-center justify-between gap-2" key={r.classId}>
                <span className="truncate text-app-text">{r.topic}</span>
                <span className="shrink-0 text-app-muted">
                  {formatBytes(r.sizeBytes)} · {formatDuration(r.durationSeconds)}
                </span>
              </li>
            ))}
            {!recordings.isLoading && (recordings.data?.largest.length ?? 0) === 0 ? (
              <li className="text-app-muted">No recordings on file.</li>
            ) : null}
          </ul>
        </div>
      </div>
      <p className="mt-3 text-xs text-app-muted">{METRIC_TOOLTIPS.storageForecast}</p>
    </SectionCard>
  );
}

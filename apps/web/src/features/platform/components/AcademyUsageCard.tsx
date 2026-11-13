"use client";

import { useMemo, useState } from "react";
import { TENANT_USAGE_METRICS, type TenantUsageDayItem } from "@nexa-chess/types";
import { AreaChartCard, BarChartCard } from "@/components/charts/Charts";
import { SectionCard } from "@/components/ui/SectionCard";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { usePlatformUsageHistory } from "../hooks/usePlatformApi";
import {
  formatUsage,
  formatUsageDay,
  usageAxisFormat,
  usageLabel,
  usageOverPeriod,
  USAGE_RANGE_OPTIONS,
  type UsageKey
} from "../lib/usage";

type Panel = {
  title: string;
  /** The figures beside the title: the period's sum, or the latest total. */
  headline: UsageKey[];
  series: UsageKey[];
  chart: "area" | "bar";
};

const PANELS: Panel[] = [
  { chart: "area", headline: ["storageBytes"], series: ["recordingBytes", "documentBytes", "uploadBytes"], title: "Storage" },
  { chart: "bar", headline: ["participantMinutes"], series: ["participantMinutes"], title: "Live-class minutes" },
  { chart: "bar", headline: ["emailsSent", "whatsappSent"], series: ["emailsSent", "whatsappSent"], title: "Messages" },
  { chart: "bar", headline: ["analysesCompleted"], series: ["analysesCompleted"], title: "Engine analyses" }
];

function UsagePanel({ panel, rows }: { panel: Panel; rows: TenantUsageDayItem[] }) {
  // A day a key wasn't measured stays a gap (null), never a zero.
  const data = useMemo(
    () => rows.map((row) => ({ day: row.day, ...Object.fromEntries(panel.series.map((key) => [key, row.counts[key] ?? null])) })),
    [panel, rows]
  );
  const series = panel.series.map((key) => ({ key, label: usageLabel(key) }));
  const headline = panel.headline
    .map((key) => {
      const value = formatUsage(key, usageOverPeriod(rows, key));
      return panel.headline.length > 1 ? `${usageLabel(key)}: ${value}` : value;
    })
    .join(" · ");
  const Chart = panel.chart === "area" ? AreaChartCard : BarChartCard;

  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="text-sm font-semibold text-app-text">{panel.title}</h3>
        <p className="text-sm tabular-nums text-app-muted">{headline}</p>
      </div>
      <Chart
        data={data}
        format={usageAxisFormat(panel.headline[0])}
        height={180}
        series={series}
        stacked
        xFormat={formatUsageDay}
        xKey="day"
      />
    </div>
  );
}

/**
 * Console: one academy's measured usage over time (docs/SAAS_PLANS.md § "Usage
 * history"). Analytics only: none of these figures is limited or billed.
 */
export function AcademyUsageCard({ tenantId }: { tenantId: string }) {
  const [range, setRange] = useState("90");
  const history = usePlatformUsageHistory(Number(range), tenantId);
  const rows = history.data?.days ?? [];

  return (
    <SectionCard
      actions={
        <Select
          aria-label="Period"
          density="compact"
          onChange={(event) => setRange(event.target.value)}
          options={USAGE_RANGE_OPTIONS}
          value={range}
        />
      }
      description={`Measured every night. Storage is the total at the end of each day; the rest is per day. ${TENANT_USAGE_METRICS.uploadBytes.description}`}
      title="Usage history"
    >
      {history.isError ? (
        <WidgetError message="Could not load usage history." onRetry={() => void history.refetch()} />
      ) : history.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : rows.length === 0 ? (
        <p className="text-sm text-app-muted">Nothing measured yet. The first figures appear after tonight&apos;s run.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {PANELS.map((panel) => (
            <UsagePanel key={panel.title} panel={panel} rows={rows} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

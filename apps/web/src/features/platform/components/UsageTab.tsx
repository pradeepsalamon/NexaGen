"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { TENANT_USAGE_METRICS, type TenantUsageDayItem } from "@nexa-chess/types";
import { AreaChartCard, BarChartCard } from "@/components/charts/Charts";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionCard } from "@/components/ui/SectionCard";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { WidgetError } from "@/components/ui/WidgetError";
import { BarChart3 } from "lucide-react";
import { usePlatformUsageHistory } from "../hooks/usePlatformApi";
import {
  formatUsage,
  formatUsageDay,
  groupUsageByAcademy,
  isDailyUsage,
  usageAxisFormat,
  usageLabel,
  usageOverPeriod,
  USAGE_RANGE_OPTIONS,
  type UsageKey
} from "../lib/usage";

/** The table's columns, and what the chart can show. */
const COLUMNS: UsageKey[] = [
  "maxStudents",
  "maxCoaches",
  "storageBytes",
  "participantMinutes",
  "emailsSent",
  "whatsappSent",
  "analysesCompleted"
];

const METRIC_OPTIONS = COLUMNS.map((key) => ({ label: usageLabel(key), value: key }));

/** Academies drawn as their own series; the rest are added together. */
const MAX_SERIES = 5;
const OTHERS = "__others";

type AcademyUsage = { tenantId: string; rows: TenantUsageDayItem[]; figures: Record<string, number | null> };

function useAcademyUsage(rows: TenantUsageDayItem[], metric: UsageKey): AcademyUsage[] {
  return useMemo(
    () =>
      [...groupUsageByAcademy(rows)]
        .map(([tenantId, academyRows]) => ({
          figures: Object.fromEntries(COLUMNS.map((key) => [key, usageOverPeriod(academyRows, key)])),
          rows: academyRows,
          tenantId
        }))
        .sort((a, b) => (b.figures[metric] ?? -1) - (a.figures[metric] ?? -1)),
    [metric, rows]
  );
}

/** One point per day, one key per charted academy (plus the rest together). */
function chartData(academies: AcademyUsage[], metric: UsageKey) {
  const charted = new Set(academies.slice(0, MAX_SERIES).map((academy) => academy.tenantId));
  const byDay = new Map<string, Record<string, number | string>>();
  for (const academy of academies) {
    const seriesKey = charted.has(academy.tenantId) ? academy.tenantId : OTHERS;
    for (const row of academy.rows) {
      const value = row.counts[metric];
      if (typeof value !== "number") continue;
      const point = byDay.get(row.day) ?? { day: row.day };
      point[seriesKey] = ((point[seriesKey] as number | undefined) ?? 0) + value;
      byDay.set(row.day, point);
    }
  }
  return [...byDay.values()].sort((a, b) => String(a.day).localeCompare(String(b.day)));
}

/**
 * Console → Usage: what every academy consumed (docs/SAAS_PLANS.md § "Usage
 * history"). Analytics only: only the plan limits (students, coaches, batches,
 * live classes at once) are enforced.
 */
export function UsageTab({ academyName }: { academyName: (tenantId: string) => string }) {
  const [range, setRange] = useState("90");
  const [metric, setMetric] = useState<UsageKey>("storageBytes");
  const history = usePlatformUsageHistory(Number(range));
  const academies = useAcademyUsage(history.data?.days ?? [], metric);
  const data = useMemo(() => chartData(academies, metric), [academies, metric]);
  const daily = isDailyUsage(metric);

  if (history.isError) return <WidgetError message="Could not load usage." onRetry={() => void history.refetch()} />;
  if (history.isLoading) return <Skeleton className="h-96 w-full" />;
  if (academies.length === 0) {
    return (
      <EmptyState
        description="Usage is measured every night. The first figures appear after tonight's run."
        icon={BarChart3}
        title="Nothing measured yet"
      />
    );
  }

  const series = [
    ...academies.slice(0, MAX_SERIES).map((academy) => ({ key: academy.tenantId, label: academyName(academy.tenantId) })),
    ...(academies.length > MAX_SERIES ? [{ key: OTHERS, label: "Other academies" }] : [])
  ];
  const Chart = daily ? BarChartCard : AreaChartCard;
  const total = (key: UsageKey) => {
    const measured = academies.map((academy) => academy.figures[key]).filter((value): value is number => value !== null);
    return measured.length ? measured.reduce((sum, value) => sum + value, 0) : null;
  };

  return (
    <div className="grid gap-6">
      <SectionCard
        actions={
          <div className="flex flex-wrap gap-2">
            <Select
              aria-label="What to chart"
              density="compact"
              onChange={(event) => setMetric(event.target.value as UsageKey)}
              options={METRIC_OPTIONS}
              value={metric}
            />
            <Select
              aria-label="Period"
              density="compact"
              onChange={(event) => setRange(event.target.value)}
              options={USAGE_RANGE_OPTIONS}
              value={range}
            />
          </div>
        }
        description={
          metric in TENANT_USAGE_METRICS
            ? `${TENANT_USAGE_METRICS[metric as keyof typeof TENANT_USAGE_METRICS].description} ${daily ? "Per day." : "Total at the end of each day."}`
            : "As counted for the plan limit, at the end of each day."
        }
        title={`${usageLabel(metric)} by academy`}
      >
        <Chart data={data} format={usageAxisFormat(metric)} height={300} series={series} stacked xFormat={formatUsageDay} xKey="day" />
      </SectionCard>

      <div className="overflow-x-auto rounded-panel border border-app-border bg-app-surface shadow-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Academy</TableHead>
              {COLUMNS.map((key) => (
                <TableHead className="whitespace-nowrap text-right" key={key}>
                  {usageLabel(key)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {academies.map((academy) => (
              <TableRow key={academy.tenantId}>
                <TableCell>
                  <Link
                    className="font-semibold text-primary-ink hover:underline"
                    href={`/admin/platform/academies/${academy.tenantId}`}
                  >
                    {academyName(academy.tenantId)}
                  </Link>
                </TableCell>
                {COLUMNS.map((key) => (
                  <TableCell className="text-right tabular-nums" key={key}>
                    {formatUsage(key, academy.figures[key])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-semibold">All academies</TableCell>
              {COLUMNS.map((key) => (
                <TableCell className="text-right font-semibold tabular-nums" key={key}>
                  {formatUsage(key, total(key))}
                </TableCell>
              ))}
            </TableRow>
          </TableFooter>
        </Table>
      </div>
      <p className="text-xs text-app-muted">
        Students, coaches and storage are the latest totals; minutes, messages and analyses are added up over the period.
        Days are UTC. Nothing here is limited or billed.
      </p>
    </div>
  );
}

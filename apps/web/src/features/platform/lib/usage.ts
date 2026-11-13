import {
  PLAN_LIMITS,
  TENANT_USAGE_METRICS,
  type PlanLimitKey,
  type TenantUsageDayItem,
  type TenantUsageMetricKey
} from "@nexa-chess/types";
import { formatBytes, formatNumber } from "@/features/analytics/lib/format";
import { formatDayMonth } from "@/lib/datetime";

/** Anything a daily usage row can hold: a measured metric or a plan-limit count. */
export type UsageKey = TenantUsageMetricKey | PlanLimitKey;

export const USAGE_RANGE_OPTIONS = [
  { label: "Last 30 days", value: "30" },
  { label: "Last 90 days", value: "90" },
  { label: "Last 12 months", value: "365" }
];

const isMetric = (key: UsageKey): key is TenantUsageMetricKey => key in TENANT_USAGE_METRICS;

export const usageLabel = (key: UsageKey) => (isMetric(key) ? TENANT_USAGE_METRICS[key].label : PLAN_LIMITS[key].label);

/** A daily metric is added up over a period; everything else is a total as of a day. */
export const isDailyUsage = (key: UsageKey) => isMetric(key) && TENANT_USAGE_METRICS[key].kind === "daily";

export function formatUsage(key: UsageKey, value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return isMetric(key) && TENANT_USAGE_METRICS[key].unit === "bytes" ? formatBytes(value) : formatNumber(value);
}

/** Chart axis: short, so a byte count fits beside the plot. */
export const usageAxisFormat = (key: UsageKey) => (value: number) =>
  isMetric(key) && TENANT_USAGE_METRICS[key].unit === "bytes"
    ? formatBytes(value)
    : Math.abs(value) >= 1000
      ? `${(value / 1000).toFixed(1)}k`
      : String(Math.round(value));

/** `YYYY-MM-DD` as "Mar 5". A date-only value, so always formatted in UTC. */
export const formatUsageDay = (day: string) => formatDayMonth(`${day}T00:00:00.000Z`, "UTC");

/**
 * One academy's figure for a period: the sum for a daily metric, the latest
 * measured value for a total. `null` when it was never measured in the period.
 */
export function usageOverPeriod(rows: TenantUsageDayItem[], key: UsageKey): number | null {
  const measured = rows.map((row) => row.counts[key]).filter((value): value is number => typeof value === "number");
  if (measured.length === 0) return null;
  return isDailyUsage(key) ? measured.reduce((sum, value) => sum + value, 0) : measured[measured.length - 1];
}

/** Rows grouped by academy, each academy's rows oldest first (the API's order). */
export function groupUsageByAcademy(rows: TenantUsageDayItem[]): Map<string, TenantUsageDayItem[]> {
  const groups = new Map<string, TenantUsageDayItem[]>();
  for (const row of rows) {
    const list = groups.get(row.tenantId);
    if (list) list.push(row);
    else groups.set(row.tenantId, [row]);
  }
  return groups;
}

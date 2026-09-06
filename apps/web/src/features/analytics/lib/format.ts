import type { KpiValue } from "@nexa-chess/types";

/** Wrap a plain number as a comparison-less KpiValue for <KpiCard>. */
export function asKpi(value: number | null | undefined): KpiValue | undefined {
  if (value === null || value === undefined) return undefined;
  return { value, previous: null, deltaPct: null, insufficientHistory: true };
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString();
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value}%`;
}

export function formatHours(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value.toLocaleString()} h`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Pass the requesting admin's timezone (`useUserTimeZone()`) — the analytics
 * API already buckets every series in it, so the labels must match. Omitting it
 * falls back to the browser zone.
 */
export function formatDate(
  iso: string | null | undefined,
  timeZone?: string
): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(timeZone ? { timeZone } : {})
  });
}

export function formatDateTime(
  iso: string | null | undefined,
  timeZone?: string
): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {})
  });
}

export function relativeTime(
  iso: string | null | undefined,
  timeZone?: string
): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso, timeZone);
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

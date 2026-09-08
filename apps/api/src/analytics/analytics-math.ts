import type {
  AnalyticsGranularity,
  KpiValue,
  TimeSeriesPoint
} from "@nexa-chess/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export function roundTo(value: number, decimals = 1): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/**
 * Percentage change from `previous` to `current`. Returns null when there is no
 * meaningful baseline (missing or zero previous) — the UI then hides the arrow
 * instead of showing a misleading "+100%".
 */
export function deltaPct(
  current: number | null,
  previous: number | null
): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return roundTo(((current - previous) / previous) * 100, 1);
}

export function makeKpi(
  value: number | null,
  previous: number | null,
  unit?: string
): KpiValue {
  const insufficientHistory =
    previous === null || previous === undefined || previous === 0;
  return {
    value,
    previous,
    deltaPct: deltaPct(value, previous),
    insufficientHistory,
    unit
  };
}

/**
 * The SQL `date_trunc` bucket key for a timestamp in the given granularity,
 * expressed as an ISO date string (yyyy-mm-dd). Weeks are truncated to Monday.
 */
export function bucketKey(date: Date, granularity: AnalyticsGranularity): string {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  if (granularity === "week") {
    const dow = (d.getUTCDay() + 6) % 7; // Mon = 0
    d.setUTCDate(d.getUTCDate() - dow);
  } else if (granularity === "month") {
    d.setUTCDate(1);
  }
  return d.toISOString().slice(0, 10);
}

/** Every bucket key between start and end (end exclusive), inclusive of start's bucket. */
export function enumerateBuckets(
  start: Date,
  end: Date,
  granularity: AnalyticsGranularity
): string[] {
  const keys: string[] = [];
  const cursor = new Date(start);
  cursor.setUTCHours(0, 0, 0, 0);
  if (granularity === "week") {
    const dow = (cursor.getUTCDay() + 6) % 7;
    cursor.setUTCDate(cursor.getUTCDate() - dow);
  } else if (granularity === "month") {
    cursor.setUTCDate(1);
  }
  let guard = 0;
  while (cursor.getTime() < end.getTime() && guard++ < 2000) {
    keys.push(cursor.toISOString().slice(0, 10));
    if (granularity === "day") cursor.setUTCDate(cursor.getUTCDate() + 1);
    else if (granularity === "week") cursor.setUTCDate(cursor.getUTCDate() + 7);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys;
}

/**
 * Turns a sparse `{ bucketKey -> value }` map into a dense, gap-filled series
 * over [start, end). Optionally carries a running cumulative total in `secondary`.
 */
export function densifySeries(
  counts: Map<string, number>,
  start: Date,
  end: Date,
  granularity: AnalyticsGranularity,
  opts: { cumulative?: boolean; cumulativeBase?: number } = {}
): TimeSeriesPoint[] {
  const keys = enumerateBuckets(start, end, granularity);
  let running = opts.cumulativeBase ?? 0;
  return keys.map((key) => {
    const value = counts.get(key) ?? 0;
    running += value;
    return opts.cumulative
      ? { date: key, value, secondary: running }
      : { date: key, value };
  });
}

export interface StorageForecast {
  avgMonthlyGrowthBytes: number;
  daysUntilWarning: number | null;
  daysUntilCritical: number | null;
  daysUntilFull: number | null;
}

/**
 * Least-squares linear fit of `bytes` over time and a projection to each
 * threshold. Returns null unless there are at least `minPoints` snapshots
 * spanning a non-trivial window and growth is positive — we never show a
 * forecast we can't stand behind.
 */
export function forecastStorage(
  points: { at: Date; bytes: number }[],
  limitBytes: number,
  warnPercent: number,
  criticalPercent: number,
  minPoints = 14
): StorageForecast | null {
  if (points.length < minPoints || limitBytes <= 0) return null;

  const sorted = [...points].sort((a, b) => a.at.getTime() - b.at.getTime());
  const t0 = sorted[0].at.getTime();
  const xs = sorted.map((p) => (p.at.getTime() - t0) / DAY_MS); // days
  const ys = sorted.map((p) => p.bytes);
  const n = xs.length;
  const meanX = xs.reduce((s, v) => s + v, 0) / n;
  const meanY = ys.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  if (den === 0) return null;
  const slopePerDay = num / den; // bytes/day
  if (slopePerDay <= 0) return null;

  const current = ys[n - 1];
  const currentX = xs[n - 1];
  const intercept = meanY - slopePerDay * meanX;

  const daysTo = (targetBytes: number): number | null => {
    if (current >= targetBytes) return 0;
    const targetX = (targetBytes - intercept) / slopePerDay;
    const days = targetX - currentX;
    return days > 0 && days < 3650 ? Math.round(days) : null;
  };

  return {
    avgMonthlyGrowthBytes: Math.round(slopePerDay * 30),
    daysUntilWarning: daysTo((warnPercent / 100) * limitBytes),
    daysUntilCritical: daysTo((criticalPercent / 100) * limitBytes),
    daysUntilFull: daysTo(limitBytes)
  };
}

export function toCategoryCounts(
  entries: { key: string; label: string; count: number }[]
): { key: string; label: string; count: number; percent: number }[] {
  const total = entries.reduce((s, e) => s + e.count, 0);
  return entries.map((e) => ({
    ...e,
    percent: total > 0 ? roundTo((e.count / total) * 100, 1) : 0
  }));
}

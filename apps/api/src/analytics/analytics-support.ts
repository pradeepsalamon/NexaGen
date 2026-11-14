import type { AnalyticsMeta, UserRole } from "@nexa-chess/types";
import { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import type { AnalyticsGranularity } from "@nexa-chess/types";
import type { ResolvedRange } from "./analytics-range.util";

/**
 * A bound for a `timestamp` (naive UTC) column. A bare JS Date goes out as
 * timestamptz and shifts by the session zone (CLAUDE.md §3.4).
 */
export const sqlTimestamp = (d: Date) => Prisma.sql`${d.toISOString()}::timestamp`;

export interface AnalyticsUser {
  id: string;
  role: UserRole;
  timezone: string;
}

export interface AnalyticsFilters {
  role?: string;
  batchId?: string;
  coachId?: string;
  classType?: "all" | "demo" | "batch";
  acquisitionSource?: string;
  status?: string;
  threshold?: number;
}

export interface AnalyticsContext {
  range: ResolvedRange;
  user: AnalyticsUser;
  filters: AnalyticsFilters;
}

export function buildMeta(range: ResolvedRange, cached: boolean): AnalyticsMeta {
  return {
    generatedAt: new Date().toISOString(),
    timezone: range.timezone,
    rangeStart: range.start.toISOString(),
    rangeEnd: range.end.toISOString(),
    compareStart: range.compareStart?.toISOString() ?? null,
    compareEnd: range.compareEnd?.toISOString() ?? null,
    cached
  };
}

/**
 * Actual run length of a completed class in seconds: the live-session's
 * start→end when available, otherwise the scheduled window. This mirrors the
 * ternary repeated across `attendance.service.ts`.
 */
export function classDurationSeconds(row: {
  liveStartedAt?: Date | null;
  liveEndedAt?: Date | null;
  startsAt: Date;
  endsAt: Date;
}): number {
  if (row.liveStartedAt && row.liveEndedAt) {
    const s = (row.liveEndedAt.getTime() - row.liveStartedAt.getTime()) / 1000;
    if (s > 0) return s;
  }
  return Math.max(0, (row.endsAt.getTime() - row.startsAt.getTime()) / 1000);
}

const PG_TRUNC: Record<AnalyticsGranularity, string> = {
  day: "day",
  week: "week",
  month: "month"
};

/**
 * `{ bucketISODate -> count }` for `dateColumn` on `table`, truncated in the
 * business timezone. Table/column names are internal constants (never user
 * input); values are parameterised.
 */
export async function bucketedCounts(
  prisma: PrismaService,
  table: string,
  dateColumn: string,
  range: ResolvedRange,
  where: Prisma.Sql = Prisma.empty
): Promise<Map<string, number>> {
  const trunc = PG_TRUNC[range.granularity];
  const col = Prisma.raw(`"${table}"."${dateColumn}"`);
  const rows = await prisma.$queryRaw<{ bucket: string; count: bigint }[]>(Prisma.sql`
    SELECT to_char(date_trunc(${trunc}, ((${col} AT TIME ZONE 'UTC') AT TIME ZONE ${range.timezone})), 'YYYY-MM-DD') AS bucket,
           count(*)::bigint AS count
    FROM ${Prisma.raw(`"${table}"`)}
    WHERE ${col} >= ${sqlTimestamp(range.start)}
      AND ${col} < ${sqlTimestamp(range.end)}
      ${where === Prisma.empty ? Prisma.empty : Prisma.sql`AND ${where}`}
    GROUP BY 1
    ORDER BY 1
  `);
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(r.bucket, Number(r.count));
  }
  return map;
}

export function pct(part: number, whole: number): number | null {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 1000) / 10;
}

export function safeAvg(sum: number, count: number): number | null {
  if (count <= 0) return null;
  return Math.round((sum / count) * 10) / 10;
}

export const BYTES_PER_GB = 1024 ** 3;

import type {
  AnalyticsCompare,
  AnalyticsGranularity,
  AnalyticsRangePreset,
  AnalyticsRangeQuery
} from "@nexa-chess/types";
import {
  DEFAULT_TIME_ZONE,
  zonedDateToUtc,
  zonedDayBounds,
  zonedMonthBounds,
  zonedYmd,
  zonedYearBounds
} from "../common/time";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ResolvedRange {
  preset: AnalyticsRangePreset;
  timezone: string;
  start: Date; // inclusive
  end: Date; // exclusive
  compare: AnalyticsCompare;
  compareStart: Date | null;
  compareEnd: Date | null;
  granularity: AnalyticsGranularity;
}

function parseDateInput(value: string | undefined): Date | null {
  if (!value) return null;
  const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00.000Z`
    : value;
  const d = new Date(isoDate);
  return Number.isNaN(d.getTime()) ? null : d;
}

function nDayWindow(tz: string, now: Date, days: number) {
  const today = zonedDayBounds(tz, now);
  const { year, month, day } = zonedYmd(tz, now);
  const start = zonedDateToUtc(tz, year, month, day - (days - 1));
  return { start, end: today.end };
}

function autoGranularity(start: Date, end: Date): AnalyticsGranularity {
  const spanDays = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  if (spanDays <= 31) return "day";
  if (spanDays <= 180) return "week";
  return "month";
}

function shiftMonths(tz: string, date: Date, delta: number): Date {
  const { year, month, day } = zonedYmd(tz, date);
  const total = (year * 12 + (month - 1)) + delta;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return zonedDateToUtc(tz, y, m, day);
}

/**
 * Resolves the analytics date-range query into concrete UTC instants + a
 * comparison window, all in the caller's business timezone. Pure and
 * unit-tested; every section builds its `where` clauses from this.
 */
export function resolveAnalyticsRange(
  query: AnalyticsRangeQuery | undefined,
  timezone: string | null | undefined,
  now: Date = new Date()
): ResolvedRange {
  const tz = timezone || DEFAULT_TIME_ZONE;
  let preset: AnalyticsRangePreset =
    query?.preset ?? (query?.from || query?.to ? "custom" : "last30");

  let start: Date;
  let end: Date;

  switch (preset) {
    case "today": {
      ({ start, end } = zonedDayBounds(tz, now));
      break;
    }
    case "yesterday": {
      ({ start, end } = zonedDayBounds(tz, new Date(now.getTime() - DAY_MS)));
      break;
    }
    case "last7": {
      ({ start, end } = nDayWindow(tz, now, 7));
      break;
    }
    case "last30": {
      ({ start, end } = nDayWindow(tz, now, 30));
      break;
    }
    case "thisMonth": {
      ({ start, end } = zonedMonthBounds(tz, now));
      break;
    }
    case "prevMonth": {
      const thisMonth = zonedMonthBounds(tz, now);
      ({ start, end } = zonedMonthBounds(
        tz,
        new Date(thisMonth.start.getTime() - 1)
      ));
      break;
    }
    case "thisYear": {
      ({ start, end } = zonedYearBounds(tz, now));
      break;
    }
    case "prevYear": {
      const thisYear = zonedYearBounds(tz, now);
      ({ start, end } = zonedYearBounds(
        tz,
        new Date(thisYear.start.getTime() - 1)
      ));
      break;
    }
    case "custom":
    default: {
      preset = "custom";
      const fromDate = parseDateInput(query?.from) ?? new Date(now.getTime() - 29 * DAY_MS);
      const toDate = parseDateInput(query?.to) ?? now;
      const fromYmd = zonedYmd(tz, fromDate);
      const toYmd = zonedYmd(tz, toDate);
      start = zonedDateToUtc(tz, fromYmd.year, fromYmd.month, fromYmd.day);
      end = zonedDateToUtc(tz, toYmd.year, toYmd.month, toYmd.day + 1);
      if (end <= start) end = new Date(start.getTime() + DAY_MS);
      break;
    }
  }

  const compare: AnalyticsCompare = query?.compare ?? "prevPeriod";
  let compareStart: Date | null = null;
  let compareEnd: Date | null = null;

  if (compare === "prevPeriod") {
    const len = end.getTime() - start.getTime();
    compareEnd = new Date(start.getTime());
    compareStart = new Date(start.getTime() - len);
  } else if (compare === "prevMonth") {
    compareStart = shiftMonths(tz, start, -1);
    compareEnd = shiftMonths(tz, end, -1);
  } else if (compare === "prevYear") {
    compareStart = shiftMonths(tz, start, -12);
    compareEnd = shiftMonths(tz, end, -12);
  }

  const granularity: AnalyticsGranularity =
    query?.granularity ?? autoGranularity(start, end);

  return {
    preset,
    timezone: tz,
    start,
    end,
    compare,
    compareStart,
    compareEnd,
    granularity
  };
}

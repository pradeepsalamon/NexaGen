/**
 * Calendar arithmetic for the coach schedule's week / month views.
 *
 * Days are "YYYY-MM-DD" keys in the coach's own timezone. Stepping them goes
 * through `Date.UTC`, which rolls month and year boundaries (and leap days)
 * over by itself and never sees a DST shift — a key is a date, not an instant.
 */

export type CalendarView = "week" | "month";

const DAY_MS = 24 * 60 * 60 * 1000;

function keyToUtc(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function utcToKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The calendar day an instant falls on in `timeZone`. */
export function zonedDayKey(iso: string | number | Date, timeZone: string): string {
  const date = new Date(iso);
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone,
      year: "numeric"
    }).format(date);
  } catch {
    return utcToKey(date);
  }
}

export function addDays(key: string, days: number): string {
  return utcToKey(new Date(keyToUtc(key).getTime() + days * DAY_MS));
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(key: string): number {
  return keyToUtc(key).getUTCDay();
}

/** The Sunday that starts `key`'s week (the academy's calendars start on Sunday). */
export function startOfWeek(key: string): string {
  return addDays(key, -weekdayOf(key));
}

export function startOfMonth(key: string): string {
  return `${key.slice(0, 7)}-01`;
}

/** First day of the month `delta` months from `key`'s. */
export function addMonths(key: string, delta: number): string {
  const d = keyToUtc(startOfMonth(key));
  return utcToKey(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1)));
}

export function isSameMonth(a: string, b: string): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** The seven days of the week containing `key`. */
export function weekDays(key: string): string[] {
  const start = startOfWeek(key);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Whole weeks covering `key`'s month: leading/trailing days of the neighbours included. */
export function monthGridDays(key: string): string[] {
  const first = startOfMonth(key);
  const last = addDays(addMonths(first, 1), -1);
  const start = startOfWeek(first);
  const end = addDays(startOfWeek(last), 6);
  const days: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) days.push(day);
  return days;
}

/** The visible days of a view anchored on `anchor`. */
export function visibleDays(view: CalendarView, anchor: string): string[] {
  return view === "week" ? weekDays(anchor) : monthGridDays(anchor);
}

/** Move the anchor one week / month back (−1) or forward (+1). */
export function shiftAnchor(view: CalendarView, anchor: string, delta: number): string {
  return view === "week" ? addDays(anchor, 7 * delta) : addMonths(anchor, delta);
}

/**
 * The instants to fetch for a run of day keys. Padded a day each side, since
 * a zone is at most 14h off UTC; the caller files classes by `zonedDayKey`,
 * so the padding never shows.
 */
export function fetchRange(days: string[]): { from: string; to: string } {
  return {
    from: addDays(days[0], -1) + "T00:00:00.000Z",
    to: addDays(days[days.length - 1], 2) + "T00:00:00.000Z"
  };
}

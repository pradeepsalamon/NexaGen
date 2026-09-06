export const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];

export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Common IANA timezones offered in the schedule builder. */
export const TIMEZONE_OPTIONS = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Australia/Sydney",
  "UTC"
];

/** "18:00" → "6:00 PM" */
export function formatWallTime(value: string): string {
  const [h, m] = value.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/** Render an ISO instant in a given IANA timezone. */
export function formatInZone(
  iso: string,
  timeZone: string,
  opts: Intl.DateTimeFormatOptions = {}
): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...opts
  }).format(new Date(iso));
}

/** Today as a local "YYYY-MM-DD" string. */
export function todayISODate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

export function addMonthsISO(dateISO: string, months: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  return dt.toISOString().slice(0, 10);
}

/** Format a date-only "YYYY-MM-DD" as e.g. "Sep 6, 2026" — no timezone, no drift. */
export function formatISODate(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Parse a "YYYY-MM-DD" string into a local-midnight Date (undefined if blank/invalid). */
export function isoDateToLocalDate(dateISO: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return undefined;
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Local Date → "YYYY-MM-DD" using local calendar parts. */
export function localDateToISODate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

type CountRule = { dayOfWeek: number };

/**
 * Walk forward from `startISO` counting rule occurrences (one per matching rule
 * per day, skipping `exceptions`) and return the "YYYY-MM-DD" of the day the
 * `target`-th class lands on. Returns "" if the rules never match or the target
 * is not reached within ~4 years.
 */
export function endDateForClassCount(
  startISO: string,
  rules: CountRule[],
  exceptions: string[],
  target: number
): string {
  const start = isoDateToLocalDate(startISO);
  if (!start || !Number.isInteger(target) || target < 1 || rules.length === 0) {
    return "";
  }
  const excluded = new Set(exceptions);
  const cursor = new Date(start);
  let counted = 0;
  for (let i = 0; i < 366 * 4; i += 1) {
    const iso = localDateToISODate(cursor);
    if (!excluded.has(iso)) {
      counted += rules.filter((r) => r.dayOfWeek === cursor.getDay()).length;
      if (counted >= target) return iso;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return "";
}

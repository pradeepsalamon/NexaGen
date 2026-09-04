export const DEFAULT_TIME_ZONE = "Asia/Kolkata";

/**
 * Start (inclusive) and end (exclusive) UTC instants of the calendar day that
 * `ref` falls on **in `timeZone`** (AUDIT M7). The old approach used a rolling
 * `now-4h … now+20h` window, so late in the evening a class the next morning
 * still counted as "today".
 */
export function zonedDayBounds(
  timeZone: string | null | undefined,
  ref: Date = new Date()
): { start: Date; end: Date } {
  const tz = timeZone || DEFAULT_TIME_ZONE;

  let y: number;
  let m: number;
  let d: number;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(ref);
    [y, m, d] = parts.split("-").map(Number);
  } catch {
    // Invalid IANA zone — fall back to the default.
    return zonedDayBounds(DEFAULT_TIME_ZONE, ref);
  }

  const guess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  // Offset between UTC and the target zone at that instant.
  const offset =
    new Date(guess.toLocaleString("en-US", { timeZone: "UTC" })).getTime() -
    new Date(guess.toLocaleString("en-US", { timeZone: tz })).getTime();

  const start = new Date(guess.getTime() + offset);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/** Calendar y/m/d that `ref` falls on in `timeZone` (1-indexed month). */
export function zonedYmd(
  timeZone: string | null | undefined,
  ref: Date = new Date()
): { year: number; month: number; day: number } {
  const tz = timeZone || DEFAULT_TIME_ZONE;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(ref);
    const [year, month, day] = parts.split("-").map(Number);
    return { year, month, day };
  } catch {
    return zonedYmd(DEFAULT_TIME_ZONE, ref);
  }
}

/**
 * UTC instant of local midnight for the given calendar date in `timeZone`.
 * Handles the timezone offset the same way `zonedDayBounds` does.
 */
export function zonedDateToUtc(
  timeZone: string | null | undefined,
  year: number,
  month: number, // 1-indexed
  day: number
): Date {
  const tz = timeZone || DEFAULT_TIME_ZONE;
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  let offset = 0;
  try {
    offset =
      new Date(guess.toLocaleString("en-US", { timeZone: "UTC" })).getTime() -
      new Date(guess.toLocaleString("en-US", { timeZone: tz })).getTime();
  } catch {
    offset = 0;
  }
  return new Date(guess.getTime() + offset);
}

/** Start (inclusive) / end (exclusive) UTC bounds of the calendar month `ref` is in. */
export function zonedMonthBounds(
  timeZone: string | null | undefined,
  ref: Date = new Date()
): { start: Date; end: Date } {
  const { year, month } = zonedYmd(timeZone, ref);
  const start = zonedDateToUtc(timeZone, year, month, 1);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = zonedDateToUtc(timeZone, nextYear, nextMonth, 1);
  return { start, end };
}

/** Start (inclusive) / end (exclusive) UTC bounds of the calendar year `ref` is in. */
export function zonedYearBounds(
  timeZone: string | null | undefined,
  ref: Date = new Date()
): { start: Date; end: Date } {
  const { year } = zonedYmd(timeZone, ref);
  return {
    start: zonedDateToUtc(timeZone, year, 1, 1),
    end: zonedDateToUtc(timeZone, year + 1, 1, 1)
  };
}

/**
 * Formats a millisecond duration as a human-readable string, largest unit
 * first, space-separated (e.g. `125000` -> `"2m 5s"`).
 *
 * - Every non-zero unit is emitted, largest first (`90061000` -> `"1h 1m 1s"`).
 * - Zero units are omitted; if that would leave an empty string (0, sub-second
 *   values) the result is `"0s"`.
 * - Negative input is prefixed with `"-"` and the absolute value is formatted.
 * - Non-finite input (NaN, Infinity) yields `"0s"`.
 * - Units are h, m, s only — no days, no sub-second component.
 */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return "0s";

  const sign = ms < 0 ? "-" : "";
  const totalSeconds = Math.floor(Math.abs(ms) / 1000);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);

  if (parts.length === 0) return "0s";
  return `${sign}${parts.join(" ")}`;
}

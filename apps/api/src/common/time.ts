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

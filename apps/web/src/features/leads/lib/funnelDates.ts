/** `YYYY-MM-DD` of `ref` in `timeZone` (the funnel's default range). */
export function dayInZone(timeZone: string, ref: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone, year: "numeric" }).format(ref);
  } catch {
    return ref.toISOString().slice(0, 10);
  }
}

/** The calendar day `days` before a `YYYY-MM-DD`. */
export function daysBefore(ymd: string, days: number): string {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) - days * 24 * 60 * 60_000).toISOString().slice(0, 10);
}

/** "42%", or "–" when there is nothing to divide by. */
export function percentOf(part: number, whole: number): string {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–";
}

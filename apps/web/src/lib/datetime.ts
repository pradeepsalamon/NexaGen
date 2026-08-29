/**
 * Date/time formatting for API payloads.
 *
 * The API returns ISO-8601 strings only — it must never pre-format a date,
 * because Node would format it in the *server's* timezone (AUDIT H11).
 * Everything user-facing is formatted here, in the viewer's timezone.
 */

const FALLBACK_TIME_ZONE = "Asia/Kolkata";

/** The user's saved `timezone`, falling back to the browser's, then the default. */
export function resolveTimeZone(preferred?: string | null): string {
  if (preferred) {
    return preferred;
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || FALLBACK_TIME_ZONE;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}

function formatIso(
  iso: string | null | undefined,
  timeZone: string,
  options: Intl.DateTimeFormatOptions
): string {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("en-US", { ...options, timeZone }).format(date);
}

/** e.g. "06:30 PM" */
export function formatTime(iso: string | null | undefined, timeZone: string): string {
  return formatIso(iso, timeZone, { hour: "2-digit", minute: "2-digit" });
}

/** e.g. "Mar 5" */
export function formatDayMonth(iso: string | null | undefined, timeZone: string): string {
  return formatIso(iso, timeZone, { day: "numeric", month: "short" });
}

/** e.g. "Mar 5, 2026" */
export function formatFullDate(iso: string | null | undefined, timeZone: string): string {
  return formatIso(iso, timeZone, { day: "numeric", month: "short", year: "numeric" });
}

/** e.g. "MAR" — the month half of a calendar badge */
export function formatMonthShort(iso: string | null | undefined, timeZone: string): string {
  return formatIso(iso, timeZone, { month: "short" }).toUpperCase();
}

/** e.g. "5" — the day half of a calendar badge */
export function formatDayOfMonth(iso: string | null | undefined, timeZone: string): string {
  return formatIso(iso, timeZone, { day: "numeric" });
}

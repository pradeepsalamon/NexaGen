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

/** Calendar days from today to `iso`, counted in `timeZone` (negative = past). */
function daysFromToday(iso: string, timeZone: string): number | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  // Compare calendar dates, not elapsed hours: 11pm → 1am is "tomorrow", and
  // 26 hours out on the same weekday is not "today".
  const key = (value: Date) =>
    formatIso(value.toISOString(), timeZone, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  const target = key(date);
  const today = new Date();

  for (let offset = 0; offset <= 7; offset += 1) {
    const ahead = new Date(today.getTime() + offset * 86400000);
    if (key(ahead) === target) {
      return offset;
    }
    const behind = new Date(today.getTime() - offset * 86400000);
    if (key(behind) === target) {
      return -offset;
    }
  }

  return null;
}

/** "Today" / "Tomorrow" / "Friday" within the week, else "Mar 5". */
export function formatRelativeDay(
  iso: string | null | undefined,
  timeZone: string
): string {
  if (!iso) {
    return "";
  }
  const offset = daysFromToday(iso, timeZone);

  if (offset === 0) {
    return "Today";
  }
  if (offset === 1) {
    return "Tomorrow";
  }
  if (offset !== null && offset > 1 && offset <= 6) {
    return formatIso(iso, timeZone, { weekday: "long" });
  }

  return formatDayMonth(iso, timeZone);
}

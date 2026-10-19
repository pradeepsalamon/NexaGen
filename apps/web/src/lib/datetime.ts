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
  // A bad saved zone would make every Intl formatter below throw a RangeError.
  if (preferred) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: preferred });
      return preferred;
    } catch {
      // fall through to the browser's zone
    }
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

/**
 * Escape hatch for one-off option sets — still forced into the viewer's zone.
 * Prefer a named helper below; reach for this only when none of them fit.
 */
export function formatDate(
  iso: string | null | undefined,
  timeZone: string,
  options: Intl.DateTimeFormatOptions
): string {
  return formatIso(iso, timeZone, options);
}

/**
 * Elapsed time, e.g. "5h 50m" / "24 min" / "0 min". No timezone — this is a
 * span of seconds (computed on the API from UTC timestamps), not an instant.
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 0) {
    return "0 min";
  }
  const minutes = Math.floor(seconds / 60);
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hrs > 0 ? `${hrs}h ${mins}m` : `${minutes} min`;
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

/** e.g. "Sunday, September 6, 2026" */
export function formatLongDate(iso: string | null | undefined, timeZone: string): string {
  return formatIso(iso, timeZone, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** e.g. "Mar 5, 2026, 06:36 PM" */
export function formatDateTime(iso: string | null | undefined, timeZone: string): string {
  return formatIso(iso, timeZone, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

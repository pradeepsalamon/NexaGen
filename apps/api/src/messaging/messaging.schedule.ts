import type { MessagingRule } from "@prisma/client";
import { DEFAULT_TIME_ZONE, zonedDateToUtc, zonedYmd } from "../common/time";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The UTC instant of a wall-clock time on a calendar date in `timeZone`.
 *
 * `zonedDateToUtc` gives local midnight; adding the hours would be an hour out
 * on a DST-transition day, so the result is read back in the zone and corrected
 * once by the difference.
 */
export function zonedTimeToUtc(
  timeZone: string | null | undefined,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): Date {
  const tz = timeZone || DEFAULT_TIME_ZONE;
  const midnight = zonedDateToUtc(tz, year, month, day);
  const candidate = new Date(midnight.getTime() + hour * 3_600_000 + minute * 60_000);

  const actual = readClock(candidate, tz);
  const driftMinutes = actual.hour * 60 + actual.minute - (hour * 60 + minute);
  if (driftMinutes === 0) return candidate;

  return new Date(candidate.getTime() - driftMinutes * 60_000);
}

function readClock(value: Date, timeZone: string): { hour: number; minute: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(value);
    const [hour, minute] = parts.split(":").map(Number);
    return { hour: hour % 24, minute };
  } catch {
    return { hour: value.getUTCHours(), minute: value.getUTCMinutes() };
  }
}

/** 0 = Sunday .. 6 = Saturday, in `timeZone`. */
function zonedDayOfWeek(value: Date, timeZone: string): number {
  const { year, month, day } = zonedYmd(timeZone, value);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

type ScheduleFields = Pick<
  MessagingRule,
  | "scheduleMode"
  | "scheduleHour"
  | "scheduleMinute"
  | "scheduleDayOfWeek"
  | "weekdaysOnly"
>;

/**
 * When a message queued now becomes due, in the **recipient's** timezone — so a
 * "daily at 9am" rule reaches everyone at their own 9am rather than the
 * server's. IMMEDIATE (and anything mis-configured) is due straight away.
 */
export function computeScheduledFor(
  rule: ScheduleFields,
  timeZone: string | null | undefined,
  now: Date = new Date()
): Date {
  if (rule.scheduleMode === "IMMEDIATE") return now;

  const hour = rule.scheduleHour ?? 9;
  const minute = rule.scheduleMinute ?? 0;
  const tz = timeZone || DEFAULT_TIME_ZONE;

  // Walk forward from today until a day satisfies the rule and is still ahead.
  for (let offset = 0; offset <= 8; offset += 1) {
    const probe = new Date(now.getTime() + offset * DAY_MS);
    const { year, month, day } = zonedYmd(tz, probe);
    const candidate = zonedTimeToUtc(tz, year, month, day, hour, minute);

    if (candidate.getTime() <= now.getTime()) continue;

    const dow = zonedDayOfWeek(candidate, tz);
    if (rule.scheduleMode === "WEEKLY" && dow !== (rule.scheduleDayOfWeek ?? 1)) {
      continue;
    }
    if (rule.scheduleMode === "DAILY" && rule.weekdaysOnly && (dow === 0 || dow === 6)) {
      continue;
    }

    return candidate;
  }

  // Unreachable for valid input; sending now beats never sending.
  return now;
}

/** Backoff for a retryable failure: 1m, 5m, 25m, 2h05m. */
export function nextAttemptAt(attempts: number, now: Date = new Date()): Date {
  const minutes = Math.min(5 ** Math.max(0, attempts - 1), 60 * 4);
  return new Date(now.getTime() + minutes * 60_000);
}

/**
 * When an agent runs out of quota, work out when it comes back.
 *
 * The CLIs do not report a machine-readable reset time; they say it in prose,
 * in the error text, in whatever wording they feel like:
 *
 *   "You've hit your session limit · resets 9:30am (UTC)"
 *   "5-hour limit reached · resets at 14:00"
 *   "rate limit exceeded, try again in 42 minutes"
 *
 * So this parses prose. That is unavoidably approximate, which is why an
 * unparseable message still yields a usable answer -- a conservative fixed
 * delay -- rather than nothing. Waiting slightly too long costs a little time;
 * retrying too early burns the retry and can re-trip the limit.
 */

/** How long to wait when the message says a limit was hit but not when it lifts. */
const FALLBACK_WAIT_MINUTES = 30;

/** Never sleep longer than this on one parse, however the text reads. */
const MAX_WAIT_MINUTES = 6 * 60;

export interface QuotaWait {
  /** ISO timestamp to retry at. */
  retryAt: string;
  /** How the time was arrived at, for the human reading the task. */
  basis: string;
}

function clamp(ms: number): number {
  const max = MAX_WAIT_MINUTES * 60_000;
  return Math.max(60_000, Math.min(ms, max));
}

/**
 * "resets 9:30am (UTC)" / "resets at 14:00" -> the next time that clock reads.
 * Interpreted as UTC, which is what the CLIs report and what this box runs on.
 */
function parseClockTime(text: string, now: Date): QuotaWait | null {
  const match = text.match(/resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? 0);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;

  const target = new Date(now);
  target.setUTCHours(hour, minute, 0, 0);
  // A reset time already past today is tomorrow's.
  if (target.getTime() <= now.getTime()) target.setUTCDate(target.getUTCDate() + 1);

  // A minute of slack: retrying on the exact second tends to still be limited.
  const retryAt = new Date(target.getTime() + 60_000);
  return {
    retryAt: retryAt.toISOString(),
    basis: `the message said it resets at ${match[0].replace(/^resets?\s+(at\s+)?/i, "")}`,
  };
}

/** "try again in 42 minutes" / "retry in 2 hours". */
function parseRelative(text: string, now: Date): QuotaWait | null {
  const match = text.match(/(?:in|after)\s+(\d+)\s*(second|minute|hour)s?/i);
  if (!match) return null;
  const n = Number(match[1]);
  const unit = match[2].toLowerCase();
  const ms = unit === "hour" ? n * 3_600_000 : unit === "minute" ? n * 60_000 : n * 1000;
  return {
    retryAt: new Date(now.getTime() + clamp(ms + 60_000)).toISOString(),
    basis: `the message said to retry in ${n} ${unit}${n === 1 ? "" : "s"}`,
  };
}

/**
 * When should this agent be retried?
 *
 * Always returns a time. An unrecognised message is not a reason to give up on
 * the task -- it is a reason to wait a sensible default and try again.
 */
export function quotaWaitFor(errorText: string | null | undefined, now = new Date()): QuotaWait {
  const text = (errorText ?? "").trim();

  return (
    parseClockTime(text, now) ??
    parseRelative(text, now) ?? {
      retryAt: new Date(now.getTime() + FALLBACK_WAIT_MINUTES * 60_000).toISOString(),
      basis: text
        ? `no reset time in "${text.slice(0, 80)}", so waiting ${FALLBACK_WAIT_MINUTES} minutes`
        : `no reset time reported, so waiting ${FALLBACK_WAIT_MINUTES} minutes`,
    }
  );
}

export function isDue(retryAt: string | null | undefined, now = new Date()): boolean {
  if (!retryAt) return true;
  return Date.parse(retryAt) <= now.getTime();
}

/** "in 42 minutes" / "in 2 hours", for a status line. */
export function describeWait(retryAt: string, now = new Date()): string {
  const ms = Date.parse(retryAt) - now.getTime();
  if (ms <= 0) return "now";
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `in ${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `in ${hours}h${rest ? ` ${rest}m` : ""}`;
}

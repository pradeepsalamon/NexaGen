/**
 * Timezone-aware weekly recurrence generator for batch class schedules.
 *
 * No date library is available in this workspace, so timezone math is done with
 * `Intl.DateTimeFormat` — the standard dependency-free technique. Wall-clock
 * rule times ("18:00" on Mondays) are interpreted in the schedule's IANA
 * timezone and converted to absolute UTC instants, correctly handling DST
 * transitions via a two-pass offset refinement.
 */

export const DEFAULT_SCHEDULE_TIMEZONE = "Asia/Kolkata";

export interface RecurrenceRuleInput {
  /** Stable id used to key generated occurrences for idempotency. */
  id: string;
  /** 0 = Sunday … 6 = Saturday (matches Date#getUTCDay). */
  dayOfWeek: number;
  /** "HH:MM" 24h wall-clock in the schedule timezone. */
  startTime: string;
  /** "HH:MM" 24h wall-clock in the schedule timezone. */
  endTime: string;
  coachId: string;
  isEnabled?: boolean;
}

export interface RecurrenceInput {
  /** Local calendar day, inclusive. "YYYY-MM-DD" or a Date (UTC day is read). */
  startDate: string | Date;
  /** Local calendar day, inclusive. */
  endDate: string | Date;
  timezone: string;
  rules: RecurrenceRuleInput[];
  /** Local dates ("YYYY-MM-DD") that are skipped (holidays / breaks). */
  exceptions?: Array<string | Date>;
}

export interface Occurrence {
  ruleId: string;
  coachId: string;
  /** Local calendar day "YYYY-MM-DD" the occurrence falls on. */
  date: string;
  dayOfWeek: number;
  /** Absolute start instant. */
  startsAt: Date;
  /** Absolute end instant. */
  endsAt: Date;
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class RecurrenceValidationError extends Error {}

/** Parses "YYYY-MM-DD" (or the UTC day of a Date) into numeric parts. */
export function toLocalDateParts(value: string | Date): {
  year: number;
  month: number;
  day: number;
} {
  if (value instanceof Date) {
    return {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate()
    };
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    throw new RecurrenceValidationError(`Invalid date: ${value}`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() + 1 !== month ||
    check.getUTCDate() !== day
  ) {
    throw new RecurrenceValidationError(`Invalid date: ${value}`);
  }
  return { year, month, day };
}

export function formatLocalDate(year: number, month: number, day: number): string {
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/**
 * Offset in ms between the given timezone's wall clock and UTC at `instant`
 * (i.e. `localWallClockAsIfUTC - actualUTC`). Positive east of UTC.
 */
function tzOffsetMs(timeZone: string, instant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const parts = dtf.formatToParts(instant);
  const map: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = Number(part.value);
    }
  }
  const asUtc = Date.UTC(
    map.year,
    map.month - 1,
    map.day,
    map.hour,
    map.minute,
    map.second
  );
  return asUtc - instant.getTime();
}

/**
 * Converts a wall-clock time in `timeZone` to the absolute UTC instant.
 * Two-pass: guess with the offset at the naive instant, then re-check with the
 * offset at the candidate instant so DST-boundary times resolve correctly.
 */
export function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, 0);
  const offset1 = tzOffsetMs(timeZone, new Date(naive));
  let utc = naive - offset1;
  const offset2 = tzOffsetMs(timeZone, new Date(utc));
  if (offset2 !== offset1) {
    utc = naive - offset2;
  }
  return new Date(utc);
}

function parseTime(value: string): { hour: number; minute: number } {
  const match = TIME_RE.exec(value);
  if (!match) {
    throw new RecurrenceValidationError(`Invalid time "${value}" (expected HH:MM)`);
  }
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

/** Minutes since local midnight, for ordering / overlap checks. */
export function timeToMinutes(value: string): number {
  const { hour, minute } = parseTime(value);
  return hour * 60 + minute;
}

/**
 * Structural validation of a rule set (independent of the date range):
 * - times are well-formed and start < end,
 * - no two enabled rules on the same weekday overlap.
 */
export function validateRules(rules: RecurrenceRuleInput[]): void {
  if (rules.length === 0) {
    throw new RecurrenceValidationError("At least one weekly class is required.");
  }

  for (const rule of rules) {
    if (rule.dayOfWeek < 0 || rule.dayOfWeek > 6) {
      throw new RecurrenceValidationError(`Invalid day of week: ${rule.dayOfWeek}`);
    }
    const start = timeToMinutes(rule.startTime);
    const end = timeToMinutes(rule.endTime);
    if (end <= start) {
      throw new RecurrenceValidationError(
        `End time (${rule.endTime}) must be after start time (${rule.startTime}).`
      );
    }
  }

  const enabled = rules.filter((r) => r.isEnabled !== false);
  for (let i = 0; i < enabled.length; i += 1) {
    for (let j = i + 1; j < enabled.length; j += 1) {
      const a = enabled[i];
      const b = enabled[j];
      if (a.dayOfWeek !== b.dayOfWeek) continue;
      const aStart = timeToMinutes(a.startTime);
      const aEnd = timeToMinutes(a.endTime);
      const bStart = timeToMinutes(b.startTime);
      const bEnd = timeToMinutes(b.endTime);
      if (aStart < bEnd && bStart < aEnd) {
        throw new RecurrenceValidationError(
          "Two weekly classes on the same day overlap. Adjust their times."
        );
      }
    }
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Expands a recurrence into every concrete occurrence within [startDate,
 * endDate] (both inclusive, interpreted as local calendar days), sorted by
 * start instant. Deterministic: same input → same output, no duplicates.
 */
export function generateOccurrences(input: RecurrenceInput): Occurrence[] {
  const timeZone = input.timezone || DEFAULT_SCHEDULE_TIMEZONE;
  validateRules(input.rules);

  const start = toLocalDateParts(input.startDate);
  const end = toLocalDateParts(input.endDate);

  const startCursor = Date.UTC(start.year, start.month - 1, start.day);
  const endCursor = Date.UTC(end.year, end.month - 1, end.day);
  if (endCursor < startCursor) {
    throw new RecurrenceValidationError("End date must be on or after start date.");
  }
  if (endCursor - startCursor > 2 * 366 * DAY_MS) {
    throw new RecurrenceValidationError("Schedule range cannot exceed 2 years.");
  }

  const exclusions = new Set(
    (input.exceptions ?? []).map((value) => {
      const parts = toLocalDateParts(value);
      return formatLocalDate(parts.year, parts.month, parts.day);
    })
  );

  const rulesByDay = new Map<number, RecurrenceRuleInput[]>();
  for (const rule of input.rules) {
    if (rule.isEnabled === false) continue;
    const list = rulesByDay.get(rule.dayOfWeek) ?? [];
    list.push(rule);
    rulesByDay.set(rule.dayOfWeek, list);
  }

  const occurrences: Occurrence[] = [];

  for (let cursor = startCursor; cursor <= endCursor; cursor += DAY_MS) {
    const cursorDate = new Date(cursor);
    const dow = cursorDate.getUTCDay();
    const dayRules = rulesByDay.get(dow);
    if (!dayRules || dayRules.length === 0) continue;

    const year = cursorDate.getUTCFullYear();
    const month = cursorDate.getUTCMonth() + 1;
    const day = cursorDate.getUTCDate();
    const localDate = formatLocalDate(year, month, day);
    if (exclusions.has(localDate)) continue;

    for (const rule of dayRules) {
      const startParts = parseTime(rule.startTime);
      const endParts = parseTime(rule.endTime);
      const startsAt = zonedWallTimeToUtc(
        year,
        month,
        day,
        startParts.hour,
        startParts.minute,
        timeZone
      );
      const endsAt = zonedWallTimeToUtc(
        year,
        month,
        day,
        endParts.hour,
        endParts.minute,
        timeZone
      );
      occurrences.push({
        ruleId: rule.id,
        coachId: rule.coachId,
        date: localDate,
        dayOfWeek: dow,
        startsAt,
        endsAt
      });
    }
  }

  occurrences.sort((a, b) => {
    const diff = a.startsAt.getTime() - b.startsAt.getTime();
    return diff !== 0 ? diff : a.ruleId.localeCompare(b.ruleId);
  });

  return occurrences;
}

/** Two [start, end) instant ranges overlap. */
export function instantsOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

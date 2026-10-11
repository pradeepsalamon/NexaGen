import {
  BadRequestException,
} from "@nestjs/common";
import {
  AttendanceStatus,
  AttendanceEventType,
} from "@prisma/client";

/** Pure attendance calculations shared by the event, report and export paths. */

/**
 * Parse a date query param, rejecting garbage with a 400 instead of letting
 * `new Date("junk")` → Invalid Date reach Prisma and surface as a 500
 * (AUDIT M31).
 */
export function parseDateFilter(value: string | undefined, field: string): Date | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException(`Invalid ${field}: expected an ISO date string.`);
  }
  return d;
}

/**
 * One consistent attendance tally for the class-report endpoints (AUDIT M4).
 * `absentCount` was computed two different ways (`total - presentCount` vs
 * `total - attendances.length`) and could go negative when an attendee had
 * since left the batch. Here "absent" = batch students with no PRESENT/LATE/
 * PARTIAL record, clamped at 0.
 */
export function tallyAttendance(
  attendances: Array<{ status: AttendanceStatus | string }>,
  totalStudents: number
) {
  const has = (...statuses: AttendanceStatus[]) =>
    attendances.filter((a) => statuses.includes(a.status as AttendanceStatus)).length;

  const presentCount = has(AttendanceStatus.PRESENT, AttendanceStatus.LATE);
  const lateCount = has(AttendanceStatus.LATE);
  const partialCount = has(AttendanceStatus.PARTIAL);
  const accountedFor = has(
    AttendanceStatus.PRESENT,
    AttendanceStatus.LATE,
    AttendanceStatus.PARTIAL
  );
  const absentCount = Math.max(0, totalStudents - accountedFor);
  const overallPercent =
    totalStudents > 0 ? Math.round((presentCount / totalStudents) * 100) : 0;

  return { presentCount, lateCount, partialCount, absentCount, overallPercent };
}

/**
 * Render one CSV cell safely (AUDIT H25):
 * - double embedded quotes and always wrap in quotes, so a value containing
 *   `"`, `,` or a newline can't corrupt the row/column structure;
 * - prefix a leading `=`, `+`, `-`, `@`, tab or CR with `'` so spreadsheet
 *   apps don't evaluate it as a formula.
 */
export function toCsvCell(value: unknown): string {
  let str = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * How long a class ran, in seconds: the live session's real start → end when
 * both are known, else the scheduled window. The single denominator for the
 * attendance %, the history row and the session-log dialog — they used to
 * disagree (the dialog divided by the schedule).
 */
export function classRunSeconds(cls: {
  startsAt: Date;
  endsAt: Date;
  liveSession?: { startedAt: Date | null; endedAt: Date | null } | null;
}): number {
  const startedAt = cls.liveSession?.startedAt;
  const endedAt = cls.liveSession?.endedAt;
  if (startedAt && endedAt && endedAt > startedAt) {
    return Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);
  }
  return Math.max(0, Math.floor((cls.endsAt.getTime() - cls.startsAt.getTime()) / 1000));
}

export function calculateTotalDuration(
  logs: Array<{
    eventType: string | AttendanceEventType;
    sessionStart: Date | null;
    sessionEnd: Date | null;
    sessionDuration: number | null;
  }>,
  // Every session — open or already closed — is clamped to this instant, so a
  // session left open past the class (a lost `participant_left`) and a
  // `sessionEnd` corrupted by an earlier bad write both stop inflating the
  // total, and the computation is stable across re-runs (AUDIT M3).
  openSessionEnd: Date = new Date()
): number {
  const cap = openSessionEnd.getTime();
  let total = 0;
  const intervals: Array<[number, number]> = [];
  for (const log of logs) {
    const isSession =
      log.eventType === AttendanceEventType.JOIN ||
      log.eventType === AttendanceEventType.RECONNECT ||
      log.eventType === "JOIN" ||
      log.eventType === "RECONNECT";
    if (!isSession) continue;

    if (log.sessionStart) {
      const start = log.sessionStart.getTime();
      const end = Math.min(log.sessionEnd?.getTime() ?? cap, cap);
      if (end > start) intervals.push([start, end]);
    } else if (log.sessionDuration) {
      // No start to clamp against (legacy row) — trust the stored value.
      total += log.sessionDuration;
    }
  }

  // Overlapping sessions (two tabs, or a token JOIN beside its webhook
  // RECONNECT) count their shared time once.
  intervals.sort((a, b) => a[0] - b[0]);
  let curStart = -1;
  let curEnd = -1;
  let mergedMs = 0;
  for (const [start, end] of intervals) {
    if (start > curEnd) {
      if (curEnd > curStart) mergedMs += curEnd - curStart;
      curStart = start;
      curEnd = end;
    } else if (end > curEnd) {
      curEnd = end;
    }
  }
  if (curEnd > curStart) mergedMs += curEnd - curStart;

  return total + Math.floor(mergedMs / 1000);
}

/**
 * Join / leave stamps for a finalized attendance row, read from its session
 * logs and clamped to the class window. Used when the live LEAVE / DISCONNECT
 * webhooks that normally set `joinedAt` / `leftAt` were lost (routine in local
 * dev, where LiveKit can't reach localhost) — a session still open at
 * finalize means the participant was present until the class ended.
 */
export function deriveAttendanceStamps(
  row: {
    joinedAt: Date | null;
    logs: Array<{
      eventType: string | AttendanceEventType;
      sessionStart: Date | null;
      sessionEnd: Date | null;
    }>;
  },
  classEndTime: Date
): { joinedAt: Date | null; leftAt: Date } {
  const cap = classEndTime.getTime();
  const starts: number[] = [];
  let lastEnd = 0;
  for (const log of row.logs) {
    const isSession =
      log.eventType === AttendanceEventType.JOIN ||
      log.eventType === AttendanceEventType.RECONNECT ||
      log.eventType === "JOIN" ||
      log.eventType === "RECONNECT";
    if (!isSession || !log.sessionStart) continue;
    starts.push(log.sessionStart.getTime());
    lastEnd = Math.max(lastEnd, Math.min(log.sessionEnd?.getTime() ?? cap, cap));
  }
  return {
    joinedAt: row.joinedAt ?? (starts.length ? new Date(Math.min(...starts)) : null),
    leftAt: new Date(lastEnd || cap),
  };
}

export function determineStatus(
  percent: number,
  policy: {
    presentThreshold: number;
    lateThreshold: number;
    partialThreshold: number;
  }
): AttendanceStatus {
  if (percent >= policy.presentThreshold) return AttendanceStatus.PRESENT;
  if (percent >= policy.lateThreshold) return AttendanceStatus.LATE;
  if (percent >= policy.partialThreshold) return AttendanceStatus.PARTIAL;
  return AttendanceStatus.ABSENT;
}

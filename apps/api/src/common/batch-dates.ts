import { BadRequestException } from "@nestjs/common";
import { DEFAULT_TIME_ZONE, zonedDateToUtc } from "./time";

/**
 * A batch's `startsAt` / `endsAt` are calendar days (`@db.Date`, read back as
 * UTC midnight), inclusive at both ends, either one optional. Every path that
 * puts a class on a batch — recurring schedules, approved extra classes and
 * reschedules — checks against them, so the batch's advertised dates and its
 * actual sessions can't drift apart. The days are the academy's calendar
 * (`DEFAULT_TIME_ZONE`) unless a schedule supplies its own zone.
 */
export type BatchDates = { startsAt: Date | null; endsAt: Date | null };

/** `YYYY-MM-DD` of a date-only column. */
export function batchDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Instants the batch's days cover: `from` inclusive, `until` exclusive. */
export function batchClassWindow(
  batch: BatchDates,
  timeZone: string = DEFAULT_TIME_ZONE
): { from: Date | null; until: Date | null } {
  const at = (date: Date, dayOffset: number) =>
    zonedDateToUtc(
      timeZone,
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate() + dayOffset
    );
  return {
    from: batch.startsAt ? at(batch.startsAt, 0) : null,
    until: batch.endsAt ? at(batch.endsAt, 1) : null
  };
}

export function isWithinBatchDates(
  batch: BatchDates,
  startsAt: Date,
  timeZone: string = DEFAULT_TIME_ZONE
): boolean {
  const { from, until } = batchClassWindow(batch, timeZone);
  if (from && startsAt < from) return false;
  if (until && startsAt >= until) return false;
  return true;
}

/** Same check for a local `YYYY-MM-DD` day (a schedule occurrence's date). */
export function isDayWithinBatchDates(batch: BatchDates, day: string): boolean {
  if (batch.startsAt && day < batchDateKey(batch.startsAt)) return false;
  if (batch.endsAt && day > batchDateKey(batch.endsAt)) return false;
  return true;
}

export function describeBatchDates(batch: BatchDates): string {
  const start = batch.startsAt ? batchDateKey(batch.startsAt) : "open start";
  const end = batch.endsAt ? batchDateKey(batch.endsAt) : "no end date";
  return `${start} – ${end}`;
}

export function assertWithinBatchDates(
  batch: BatchDates & { name?: string },
  startsAt: Date,
  timeZone: string = DEFAULT_TIME_ZONE
) {
  if (!isWithinBatchDates(batch, startsAt, timeZone)) {
    throw new BadRequestException(
      `This class falls outside the batch${batch.name ? ` "${batch.name}"` : ""}'s dates (${describeBatchDates(batch)}). Change the batch dates first.`
    );
  }
}

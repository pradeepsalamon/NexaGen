import { ConflictException } from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service";

/**
 * Shared class-scheduling checks for CoachClass rows (both admin-scheduled demo
 * classes and coach-scheduled batch classes go through `coach_classes`).
 *
 * Previously `AdminService` had this conflict check and `CoachService` did not
 * (AUDIT H17), so a coach could double-book themselves while an admin
 * scheduling on their behalf could not. Both now call the same helper.
 */

const CONFLICTING_STATUSES = ["SCHEDULED", "LIVE"] as const;

/** `timeZone` is the acting user's `User.timezone` so the conflict message
 *  reads in their local time; `"UTC"` is the safe fallback. */
function formatRange(d: Date, timeZone: string) {
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone
  });
}

/**
 * Throws `ConflictException` if the coach already has a SCHEDULED/LIVE class
 * whose time range overlaps `[startsAt, endsAt)`. Pass `excludeClassId` when
 * checking an update, so the class being edited doesn't conflict with itself.
 * `timeZone` (the acting user's) localizes the conflict message.
 */
export async function assertNoSchedulingConflict(
  prisma: PrismaService,
  params: {
    coachId: string;
    startsAt: Date;
    endsAt: Date;
    excludeClassId?: string;
    timeZone?: string;
  }
): Promise<void> {
  const { coachId, startsAt, endsAt, excludeClassId, timeZone = "UTC" } = params;

  const conflicting = await prisma.coachClass.findFirst({
    where: {
      coachId,
      ...(excludeClassId ? { id: { not: excludeClassId } } : {}),
      status: { in: [...CONFLICTING_STATUSES] },
      // Two ranges overlap when: existingStart < newEnd AND existingEnd > newStart
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt }
    },
    select: { topic: true, startsAt: true, endsAt: true }
  });

  if (conflicting) {
    throw new ConflictException(
      `Coach already has a class "${conflicting.topic || "Untitled"}" scheduled from ${formatRange(conflicting.startsAt, timeZone)} to ${formatRange(conflicting.endsAt, timeZone)}. Please choose a different time.`
    );
  }
}

/**
 * Throws `ConflictException` if `startsAt` is in the past. A coach (or an
 * admin scheduling a demo class) should not be able to create/reschedule a
 * class that starts before now (AUDIT H17).
 */
export function assertNotInPast(startsAt: Date): void {
  if (startsAt.getTime() < Date.now()) {
    throw new ConflictException("Class start time must be in the future.");
  }
}

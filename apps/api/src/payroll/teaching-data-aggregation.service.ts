import { ConflictException, Injectable } from "@nestjs/common";
import type { CancelledByActor, TeachingSummary } from "@nexa-chess/types";
import { AttendanceStatus, ClassStatus, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { EngineCancelledClass } from "./payroll-calculation.engine";

export type TeachingData = {
  summary: TeachingSummary;
  cancelledClasses: EngineCancelledClass[];
};

/**
 * Reads (never re-derives) teaching activity for one coach over a date range.
 * `CoachAttendance.totalDuration`/`boardDuration` are the authoritative
 * numbers — `AttendanceService.finalizeClassAttendance` already computed them
 * from the LiveKit session logs; this service only aggregates.
 */
@Injectable()
export class TeachingDataAggregationService {
  constructor(private readonly prisma: PrismaService) {}

  async getTeachingData(coachId: string, periodStart: Date, periodEnd: Date): Promise<TeachingData> {
    const inFlightCount = await this.prisma.coachClass.count({
      where: {
        coachId,
        startsAt: { gte: periodStart, lt: periodEnd },
        status: { in: [ClassStatus.SCHEDULED, ClassStatus.LIVE, ClassStatus.IN_PROGRESS] }
      }
    });
    if (inFlightCount > 0) {
      throw new ConflictException(
        `${inFlightCount} class(es) in this period for this coach have not run yet (still SCHEDULED/LIVE/IN_PROGRESS). Wait until the period is fully in the past, or exclude it, before calculating.`
      );
    }

    const classes = await this.prisma.coachClass.findMany({
      where: {
        coachId,
        startsAt: { gte: periodStart, lt: periodEnd },
        status: { in: [ClassStatus.COMPLETED, ClassStatus.CANCELLED] }
      },
      include: {
        coachAttendance: true,
        cancelledBy: { select: { role: true } }
      }
    });

    const summary: TeachingSummary = {
      scheduledClassesCount: classes.length,
      completedClassesCount: 0,
      cancelledByCoachCount: 0,
      cancelledByStudentCount: 0,
      cancelledByAdminCount: 0,
      noShowCount: 0,
      totalTeachingSeconds: 0,
      totalBoardSeconds: 0
    };

    const cancelledClasses: EngineCancelledClass[] = [];

    for (const cls of classes) {
      if (cls.status === ClassStatus.COMPLETED) {
        // A coach no-show is not a taught class: it must not earn per-class pay.
        if (cls.coachAttendance?.status === AttendanceStatus.ABSENT) {
          summary.noShowCount += 1;
          continue;
        }
        summary.completedClassesCount += 1;
        summary.totalTeachingSeconds += cls.coachAttendance?.totalDuration ?? 0;
        summary.totalBoardSeconds += cls.coachAttendance?.boardDuration ?? 0;
        continue;
      }

      // CANCELLED
      const actor = actorForRole(cls.cancelledBy?.role);
      if (actor === "COACH") summary.cancelledByCoachCount += 1;
      else if (actor === "STUDENT") summary.cancelledByStudentCount += 1;
      else if (actor === "ADMIN") summary.cancelledByAdminCount += 1;
      // actor === null (unattributed / legacy row): counted in
      // scheduledClassesCount but not in any of the three buckets above —
      // there is no rule to apply without knowing who cancelled.

      cancelledClasses.push({
        classId: cls.id,
        cancelledBy: actor,
        noticeHours: cls.cancelledAt
          ? (cls.startsAt.getTime() - cls.cancelledAt.getTime()) / 3_600_000
          : null,
        scheduledDurationSeconds: Math.max(
          0,
          Math.floor((cls.endsAt.getTime() - cls.startsAt.getTime()) / 1000)
        )
      });
    }

    return { summary, cancelledClasses };
  }
}

function actorForRole(role: UserRole | undefined): CancelledByActor | null {
  if (!role) return null;
  if (role === UserRole.COACH) return "COACH";
  if (role === UserRole.STUDENT) return "STUDENT";
  if (role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN) return "ADMIN";
  return null;
}

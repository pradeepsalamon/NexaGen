import { Injectable } from "@nestjs/common";
import type {
  AlertsResponse,
  AnalyticsAlert,
  OperationsResponse,
  TodayResponse
} from "@nexa-chess/types";
import { Prisma } from "@prisma/client";
import { getApiEnv } from "@nexa-chess/config/api";
import { RecordingStorageService } from "../../live-class/recording-storage.service";
import { PrismaService } from "../../prisma/prisma.service";
import { zonedDayBounds } from "../../common/time";
import { roundTo } from "../analytics-math";
import { buildMeta, type AnalyticsContext } from "../analytics-support";

@Injectable()
export class OperationsAnalyticsSection {
  private readonly env = getApiEnv();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: RecordingStorageService
  ) {}

  private async storageState(): Promise<OperationsResponse["storageState"]> {
    try {
      const usage = await this.storage.getStorageUsage();
      if (usage.usagePercent >= this.env.ANALYTICS_STORAGE_CRITICAL_PERCENT)
        return "critical";
      if (usage.usagePercent >= this.env.ANALYTICS_STORAGE_WARN_PERCENT)
        return "warning";
      return "normal";
    } catch {
      return "unknown";
    }
  }

  async operations(ctx: AnalyticsContext): Promise<OperationsResponse> {
    const { range } = ctx;
    const now = new Date();
    const { start, end } = zonedDayBounds(range.timezone, now);

    const [
      todayGroups,
      liveNow,
      needAttention,
      recordingFailures,
      missingRecordings,
      unfinalized,
      storageState
    ] = await Promise.all([
      this.prisma.coachClass.groupBy({
        by: ["status"],
        where: { startsAt: { gte: start, lt: end } },
        _count: { _all: true }
      }),
      this.prisma.liveSession.count({ where: { status: "LIVE" } }),
      this.prisma.coachClass.count({
        where: {
          status: { in: ["SCHEDULED", "LIVE"] },
          endsAt: { lt: now }
        }
      }),
      this.prisma.liveSession.count({ where: { recordingStatus: "FAILED" } }),
      this.prisma.liveSession.count({
        where: {
          status: "ENDED",
          recordingUrl: null,
          recordingStatus: { notIn: ["PURGED_STORAGE_LIMIT"] }
        }
      }),
      this.prisma.liveSession.count({
        where: { status: "ENDED", attendanceFinalizedAt: null }
      }),
      this.storageState()
    ]);

    const count = (status: string) =>
      todayGroups
        .filter((g) => g.status === status)
        .reduce((s, g) => s + g._count._all, 0);

    return {
      meta: buildMeta(range, false),
      classesToday: todayGroups.reduce((s, g) => s + g._count._all, 0),
      classesLiveNow: liveNow,
      classesCompletedToday: count("COMPLETED"),
      classesCancelledToday: count("CANCELLED"),
      classesNeedingAttention: needAttention,
      // Every class has a required coach FK in this schema, so this is always 0.
      classesWithoutCoach: 0,
      recordingFailures,
      missingRecordings,
      unfinalizedAttendance: unfinalized,
      storageState
    };
  }

  async today(ctx: AnalyticsContext): Promise<TodayResponse> {
    const { range } = ctx;
    const now = new Date();
    const { start, end } = zonedDayBounds(range.timezone, now);

    const classes = await this.prisma.coachClass.findMany({
      where: { startsAt: { gte: start, lt: end } },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        topic: true,
        title: true,
        isDemo: true,
        status: true,
        coachId: true,
        coach: { select: { firstName: true, lastName: true } },
        batch: { select: { name: true } },
        _count: { select: { attendances: true } },
        attendances: { select: { status: true } }
      }
    });

    const statusCount = (s: string) => classes.filter((c) => c.status === s).length;
    const upcoming = classes.filter(
      (c) => c.status === "SCHEDULED" && c.startsAt >= now
    ).length;
    const noShow = classes.filter(
      (c) => c.status === "SCHEDULED" && c.endsAt < now
    ).length;

    const scheduledCoachIds = new Set(classes.map((c) => c.coachId));
    const teachingCoachIds = new Set(
      classes.filter((c) => c.status === "LIVE").map((c) => c.coachId)
    );
    const completedCoachIds = new Set(
      classes.filter((c) => c.status === "COMPLETED").map((c) => c.coachId)
    );
    const absentCoachIds = new Set(
      classes
        .filter((c) => c.status === "SCHEDULED" && c.endsAt < now)
        .map((c) => c.coachId)
    );

    let expected = 0;
    let attended = 0;
    for (const c of classes) {
      if (c.status !== "COMPLETED") continue;
      expected += c.attendances.length;
      attended += c.attendances.filter(
        (a) => a.status === "PRESENT" || a.status === "LATE"
      ).length;
    }

    return {
      meta: buildMeta(range, false),
      classes: {
        total: classes.length,
        upcoming,
        live: statusCount("LIVE"),
        completed: statusCount("COMPLETED"),
        cancelled: statusCount("CANCELLED"),
        noShow
      },
      coaches: {
        scheduled: scheduledCoachIds.size,
        teaching: teachingCoachIds.size,
        completed: completedCoachIds.size,
        absent: absentCoachIds.size
      },
      students: {
        expected,
        attended,
        missed: Math.max(0, expected - attended)
      },
      schedule: classes.map((c) => ({
        classId: c.id,
        time: c.startsAt.toISOString(),
        topic: c.topic ?? c.title ?? "Class",
        type: c.isDemo ? "demo" : "batch",
        batchName: c.batch?.name ?? null,
        coachName: `${c.coach.firstName} ${c.coach.lastName ?? ""}`.trim(),
        studentCount: c._count.attendances,
        status: c.status
      }))
    };
  }

  async alerts(ctx: AnalyticsContext): Promise<AlertsResponse> {
    const { range } = ctx;
    const alerts: AnalyticsAlert[] = [];
    const now = new Date();

    const [
      storageUsage,
      recordingFailures,
      missingRecordings,
      classesNoCoachStart,
      lowAttendance,
      studentsNoUpcoming,
      regThisWeek,
      regPrevWeek
    ] = await Promise.all([
      this.storage.getStorageUsage().catch(() => null),
      this.prisma.liveSession.count({ where: { recordingStatus: "FAILED" } }),
      this.prisma.liveSession.count({
        where: {
          status: "ENDED",
          recordingUrl: null,
          recordingStatus: { notIn: ["PURGED_STORAGE_LIMIT"] }
        }
      }),
      this.prisma.coachClass.count({
        where: {
          status: { in: ["SCHEDULED", "LIVE"] },
          endsAt: { lt: now }
        }
      }),
      this.lowAttendanceCount(range),
      this.studentsWithoutUpcomingCount(),
      this.prisma.user.count({
        where: {
          isDeleted: false,
          createdAt: { gte: new Date(now.getTime() - 7 * 86_400_000) }
        }
      }),
      this.prisma.user.count({
        where: {
          isDeleted: false,
          createdAt: {
            gte: new Date(now.getTime() - 14 * 86_400_000),
            lt: new Date(now.getTime() - 7 * 86_400_000)
          }
        }
      })
    ]);

    if (storageUsage) {
      if (storageUsage.usagePercent >= this.env.ANALYTICS_STORAGE_CRITICAL_PERCENT) {
        alerts.push({
          kind: "storage-critical",
          severity: "critical",
          title: "Recording storage critical",
          message: `Storage is ${roundTo(storageUsage.usagePercent, 1)}% full. New recordings may fail.`,
          count: null,
          href: "/admin/analytics/storage"
        });
      } else if (storageUsage.usagePercent >= this.env.ANALYTICS_STORAGE_WARN_PERCENT) {
        alerts.push({
          kind: "storage-warning",
          severity: "warning",
          title: "Recording storage running low",
          message: `Storage is ${roundTo(storageUsage.usagePercent, 1)}% full.`,
          count: null,
          href: "/admin/analytics/storage"
        });
      }
    }

    if (recordingFailures > 0) {
      alerts.push({
        kind: "recording-failed",
        severity: "warning",
        title: "Recording failures",
        message: `${recordingFailures} live class recording(s) failed to complete.`,
        count: recordingFailures,
        href: "/admin/analytics/recordings"
      });
    }
    if (missingRecordings > 0) {
      alerts.push({
        kind: "recording-missing",
        severity: "info",
        title: "Missing recordings",
        message: `${missingRecordings} ended class(es) have no recording on file.`,
        count: missingRecordings,
        href: "/admin/analytics/recordings"
      });
    }
    if (classesNoCoachStart > 0) {
      alerts.push({
        kind: "class-not-started",
        severity: "warning",
        title: "Classes not started",
        message: `${classesNoCoachStart} class(es) passed their scheduled end without going live.`,
        count: classesNoCoachStart,
        href: "/admin/analytics/operations"
      });
    }
    if (lowAttendance > 0) {
      alerts.push({
        kind: "low-attendance",
        severity: "warning",
        title: "Students with low attendance",
        message: `${lowAttendance} student(s) are below the ${this.env.ANALYTICS_LOW_ATTENDANCE_PERCENT}% attendance threshold.`,
        count: lowAttendance,
        href: "/admin/analytics/attendance"
      });
    }
    if (studentsNoUpcoming > 0) {
      alerts.push({
        kind: "students-no-upcoming",
        severity: "info",
        title: "Students without an upcoming class",
        message: `${studentsNoUpcoming} enrolled student(s) have no scheduled class ahead.`,
        count: studentsNoUpcoming,
        href: "/admin/analytics/students"
      });
    }
    if (regPrevWeek >= 5 && regThisWeek < regPrevWeek * 0.6) {
      alerts.push({
        kind: "registration-decline",
        severity: "warning",
        title: "Registrations dropped",
        message: `New sign-ups fell from ${regPrevWeek} last week to ${regThisWeek} this week.`,
        count: null,
        href: "/admin/analytics/users"
      });
    }

    const severityRank = { critical: 0, warning: 1, info: 2 } as const;
    alerts.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

    return { meta: buildMeta(range, false), alerts };
  }

  private async lowAttendanceCount(range: {
    start: Date;
    end: Date;
  }): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT count(*)::bigint AS count FROM (
        SELECT ca."studentId"
        FROM "class_attendance" ca
        JOIN "classes" c ON c.id = ca."classId"
        WHERE c.status = 'COMPLETED'
          AND c."startsAt" >= ${range.start} AND c."startsAt" < ${range.end}
        GROUP BY ca."studentId"
        HAVING count(*) >= 3
          AND (count(*) FILTER (WHERE ca.status IN ('PRESENT','LATE'))::float / count(*)) * 100
              < ${this.env.ANALYTICS_LOW_ATTENDANCE_PERCENT}
      ) t
    `);
    return Number(rows[0]?.count ?? 0);
  }

  private async studentsWithoutUpcomingCount(): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT count(*)::bigint AS count
      FROM "users" u
      WHERE u.role = 'STUDENT' AND u."isDeleted" = false
        AND EXISTS (
          SELECT 1 FROM "batch_students" bs WHERE bs."studentId" = u.id AND bs."isDeleted" = false
        )
        AND NOT EXISTS (
          SELECT 1 FROM "batch_students" bs
          JOIN "classes" c ON c."batchId" = bs."batchId"
          WHERE bs."studentId" = u.id AND bs."isDeleted" = false
            AND c.status IN ('SCHEDULED','LIVE') AND c."startsAt" >= now()
        )
    `);
    return Number(rows[0]?.count ?? 0);
  }
}

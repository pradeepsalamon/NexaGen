import { Injectable } from "@nestjs/common";
import type {
  BatchAnalyticsResponse,
  BatchAnalyticsRow,
  BatchDetailAnalyticsResponse,
  StudentAnalyticsResponse,
  StudentRankRow
} from "@nexa-chess/types";
import { Prisma } from "@prisma/client";
import { getApiEnv } from "@nexa-chess/config/api";
import { PrismaService } from "../../prisma/prisma.service";
import { zonedMonthBounds } from "../../common/time";
import { densifySeries, roundTo } from "../analytics-math";
import { buildMeta, pct, type AnalyticsContext } from "../analytics-support";

@Injectable()
export class BatchesAnalyticsSection {
  private readonly env = getApiEnv();

  constructor(private readonly prisma: PrismaService) {}

  private async batchRows(where: Prisma.BatchWhereInput): Promise<BatchAnalyticsRow[]> {
    const batches = await this.prisma.batch.findMany({
      where,
      select: {
        id: true,
        name: true,
        status: true,
        coaches: {
          where: { isDeleted: false },
          select: { coach: { select: { firstName: true, lastName: true } } }
        },
        _count: {
          select: {
            students: { where: { isDeleted: false } },
            classes: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    const ids = batches.map((b) => b.id);
    const [completedByBatch, attendanceByBatch, hoursByBatch] = await Promise.all([
      this.prisma.coachClass.groupBy({
        by: ["batchId"],
        where: { batchId: { in: ids }, status: "COMPLETED" },
        _count: { _all: true }
      }),
      this.attendanceByBatch(ids),
      this.hoursByBatch(ids)
    ]);
    const completedMap = new Map(
      completedByBatch.map((g) => [g.batchId, g._count._all])
    );

    return batches.map((b) => ({
      batchId: b.id,
      name: b.name,
      status: b.status,
      coachNames: b.coaches.map((c) =>
        `${c.coach.firstName} ${c.coach.lastName ?? ""}`.trim()
      ),
      students: b._count.students,
      classes: b._count.classes,
      completedClasses: completedMap.get(b.id) ?? 0,
      attendancePercent: attendanceByBatch.get(b.id) ?? null,
      teachingHours: hoursByBatch.get(b.id) ?? 0
    }));
  }

  private async attendanceByBatch(
    ids: string[]
  ): Promise<Map<string, number | null>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<
      { batch_id: string; attended: bigint; total: bigint }[]
    >(Prisma.sql`
      SELECT c."batchId" AS batch_id,
             count(*) FILTER (WHERE ca.status IN ('PRESENT','LATE'))::bigint AS attended,
             count(*)::bigint AS total
      FROM "class_attendance" ca
      JOIN "classes" c ON c.id = ca."classId"
      WHERE c.status = 'COMPLETED' AND c."batchId" IN (${Prisma.join(ids)})
      GROUP BY 1
    `);
    return new Map(
      rows.map((r) => [r.batch_id, pct(Number(r.attended), Number(r.total))])
    );
  }

  private async hoursByBatch(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<
      { batch_id: string; hours: number }[]
    >(Prisma.sql`
      SELECT c."batchId" AS batch_id,
             coalesce(sum(
               coalesce(cca."totalDuration",
                 EXTRACT(EPOCH FROM (coalesce(ls."endedAt", c."endsAt") - coalesce(ls."startedAt", c."startsAt")))
               )
             ), 0)::float / 3600 AS hours
      FROM "classes" c
      LEFT JOIN "coach_attendance" cca ON cca."classId" = c.id
      LEFT JOIN "live_sessions" ls ON ls."classId" = c.id
      WHERE c.status = 'COMPLETED' AND c."batchId" IN (${Prisma.join(ids)})
      GROUP BY 1
    `);
    return new Map(rows.map((r) => [r.batch_id, roundTo(r.hours, 1)]));
  }

  async batches(ctx: AnalyticsContext): Promise<BatchAnalyticsResponse> {
    const { range } = ctx;
    const [statusGroups, rows] = await Promise.all([
      this.prisma.batch.groupBy({
        by: ["status"],
        where: { isDeleted: false },
        _count: { _all: true }
      }),
      this.batchRows({ isDeleted: false })
    ]);

    const count = (status: string) =>
      statusGroups
        .filter((g) => g.status === status)
        .reduce((s, g) => s + g._count._all, 0);
    const totalStudents = rows.reduce((s, r) => s + r.students, 0);

    return {
      meta: buildMeta(range, false),
      kpis: {
        totalBatches: statusGroups.reduce((s, g) => s + g._count._all, 0),
        activeBatches: count("ACTIVE"),
        upcomingBatches: count("UPCOMING"),
        completedBatches: count("COMPLETED"),
        archivedBatches: count("ARCHIVED"),
        avgStudentsPerBatch:
          rows.length > 0 ? roundTo(totalStudents / rows.length, 1) : null
      },
      batches: rows
    };
  }

  async batchById(
    ctx: AnalyticsContext,
    batchId: string
  ): Promise<BatchDetailAnalyticsResponse> {
    const { range } = ctx;
    const [rows, trendRows, students] = await Promise.all([
      this.batchRows({ id: batchId }),
      this.prisma.$queryRaw<
        { bucket: string; attended: bigint; total: bigint }[]
      >(Prisma.sql`
        SELECT to_char(date_trunc(${range.granularity}, (c."startsAt" AT TIME ZONE ${range.timezone})), 'YYYY-MM-DD') AS bucket,
               count(*) FILTER (WHERE ca.status IN ('PRESENT','LATE'))::bigint AS attended,
               count(*)::bigint AS total
        FROM "class_attendance" ca
        JOIN "classes" c ON c.id = ca."classId"
        WHERE c.status = 'COMPLETED' AND c."batchId" = ${batchId}
          AND c."startsAt" >= ${range.start} AND c."startsAt" < ${range.end}
        GROUP BY 1 ORDER BY 1
      `),
      this.studentsForBatch(batchId, range)
    ]);

    const trendMap = new Map<string, number>();
    for (const r of trendRows) {
      const total = Number(r.total);
      trendMap.set(
        r.bucket,
        total > 0 ? roundTo((Number(r.attended) / total) * 100, 1) : 0
      );
    }

    return {
      meta: buildMeta(range, false),
      batch: rows[0] ?? {
        batchId,
        name: "Unknown",
        status: "UNKNOWN",
        coachNames: [],
        students: 0,
        classes: 0,
        completedClasses: 0,
        attendancePercent: null,
        teachingHours: 0
      },
      attendanceTrend: {
        granularity: range.granularity,
        points: densifySeries(trendMap, range.start, range.end, range.granularity)
      },
      students
    };
  }

  private async studentsForBatch(
    batchId: string,
    range: { start: Date; end: Date }
  ): Promise<StudentRankRow[]> {
    const rows = await this.prisma.$queryRaw<
      {
        student_id: string;
        first_name: string;
        last_name: string | null;
        last_active: Date | null;
        attended: bigint;
        total: bigint;
        last_attended: Date | null;
      }[]
    >(Prisma.sql`
      SELECT u.id AS student_id, u."firstName" AS first_name, u."lastName" AS last_name,
             u."lastActiveAt" AS last_active,
             count(ca.*) FILTER (WHERE ca.status IN ('PRESENT','LATE'))::bigint AS attended,
             count(ca.*)::bigint AS total,
             max(c."startsAt") FILTER (WHERE ca.status IN ('PRESENT','LATE')) AS last_attended
      FROM "batch_students" bs
      JOIN "users" u ON u.id = bs."studentId"
      LEFT JOIN "classes" c ON c."batchId" = bs."batchId" AND c.status = 'COMPLETED'
        AND c."startsAt" >= ${range.start} AND c."startsAt" < ${range.end}
      LEFT JOIN "class_attendance" ca ON ca."classId" = c.id AND ca."studentId" = u.id
      WHERE bs."batchId" = ${batchId} AND bs."isDeleted" = false AND u."isDeleted" = false
      GROUP BY 1, 2, 3, 4
      ORDER BY attended DESC
    `);

    return rows.map((r) => {
      const attended = Number(r.attended);
      const total = Number(r.total);
      return {
        studentId: r.student_id,
        name: `${r.first_name} ${r.last_name ?? ""}`.trim(),
        batchName: null,
        attendancePercent: pct(attended, total),
        classesAttended: attended,
        classesMissed: Math.max(0, total - attended),
        learningHours: 0,
        lastActiveAt: r.last_active ? new Date(r.last_active).toISOString() : null,
        lastAttendedAt: r.last_attended
          ? new Date(r.last_attended).toISOString()
          : null
      };
    });
  }

  // ── /analytics/students ──

  async students(ctx: AnalyticsContext): Promise<StudentAnalyticsResponse> {
    const { range } = ctx;
    const now = new Date();
    const inactiveDays =
      ctx.filters.threshold && ctx.filters.threshold > 0
        ? ctx.filters.threshold
        : this.env.ANALYTICS_INACTIVE_DAYS;
    const inactiveCutoff = new Date(now.getTime() - inactiveDays * 86_400_000);
    const lowThreshold = this.env.ANALYTICS_LOW_ATTENDANCE_PERCENT;
    const month = zonedMonthBounds(range.timezone, now);

    const [
      totalStudents,
      activeStudents,
      newStudents,
      enrolledInBatch,
      attendingClasses,
      completedDemo,
      convertedDemoToBatch,
      inactiveForThreshold,
      lowAttendanceStudents,
      mostEngaged
    ] = await Promise.all([
      this.prisma.user.count({ where: { role: "STUDENT", isDeleted: false } }),
      this.countActiveStudents(range.start, range.end),
      this.prisma.user.count({
        where: {
          role: "STUDENT",
          isDeleted: false,
          createdAt: { gte: range.start, lt: range.end }
        }
      }),
      this.countStudentsInBatch(),
      this.countStudentsAttending(month.start, month.end),
      this.countCompletedDemo(),
      this.countConvertedDemo(),
      this.prisma.user.count({
        where: {
          role: "STUDENT",
          isDeleted: false,
          OR: [
            { lastActiveAt: { lt: inactiveCutoff } },
            { lastActiveAt: null, createdAt: { lt: inactiveCutoff } }
          ]
        }
      }),
      this.lowStudents(range, lowThreshold),
      this.topStudents(range)
    ]);

    const noUpcomingClass = await this.countStudentsWithoutUpcomingClass();

    return {
      meta: buildMeta(range, false),
      kpis: {
        totalStudents,
        activeStudents,
        newStudents,
        enrolledInBatch,
        attendingClasses,
        completedDemo,
        convertedDemoToBatch,
        noUpcomingClass,
        poorAttendance: lowAttendanceStudents.length,
        inactiveForThreshold
      },
      inactivityThresholdDays: inactiveDays,
      lowAttendanceThreshold: lowThreshold,
      lowAttendanceStudents,
      mostEngaged
    };
  }

  private async countActiveStudents(start: Date, end: Date): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT count(DISTINCT u.id)::bigint AS count
      FROM "users" u
      WHERE u.role = 'STUDENT' AND u."isDeleted" = false
        AND (
          (u."lastActiveAt" >= ${start} AND u."lastActiveAt" < ${end})
          OR EXISTS (
            SELECT 1 FROM "analytics_events" e
            WHERE e."userId" = u.id AND e."occurredAt" >= ${start} AND e."occurredAt" < ${end}
          )
        )
    `);
    return Number(rows[0]?.count ?? 0);
  }

  private async countStudentsInBatch(): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT count(DISTINCT "studentId")::bigint AS count
      FROM "batch_students" WHERE "isDeleted" = false
    `);
    return Number(rows[0]?.count ?? 0);
  }

  private async countStudentsAttending(start: Date, end: Date): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT count(DISTINCT ca."studentId")::bigint AS count
      FROM "class_attendance" ca
      JOIN "classes" c ON c.id = ca."classId"
      WHERE ca.status IN ('PRESENT','LATE') AND c.status = 'COMPLETED'
        AND c."startsAt" >= ${start} AND c."startsAt" < ${end}
    `);
    return Number(rows[0]?.count ?? 0);
  }

  private async countCompletedDemo(): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT count(DISTINCT ca."studentId")::bigint AS count
      FROM "class_attendance" ca
      JOIN "classes" c ON c.id = ca."classId"
      WHERE c."isDemo" = true AND c.status = 'COMPLETED'
        AND ca.status IN ('PRESENT','LATE')
    `);
    return Number(rows[0]?.count ?? 0);
  }

  private async countConvertedDemo(): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT count(DISTINCT ca."studentId")::bigint AS count
      FROM "class_attendance" ca
      JOIN "classes" c ON c.id = ca."classId"
      WHERE c."isDemo" = true AND c.status = 'COMPLETED' AND ca.status IN ('PRESENT','LATE')
        AND EXISTS (
          SELECT 1 FROM "batch_students" bs
          WHERE bs."studentId" = ca."studentId" AND bs."isDeleted" = false
        )
    `);
    return Number(rows[0]?.count ?? 0);
  }

  private async countStudentsWithoutUpcomingClass(): Promise<number> {
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

  private async lowStudents(
    range: { start: Date; end: Date },
    threshold: number
  ): Promise<StudentRankRow[]> {
    const rows = await this.prisma.$queryRaw<
      {
        student_id: string;
        first_name: string;
        last_name: string | null;
        last_active: Date | null;
        attended: bigint;
        total: bigint;
      }[]
    >(Prisma.sql`
      SELECT u.id AS student_id, u."firstName" AS first_name, u."lastName" AS last_name,
             u."lastActiveAt" AS last_active,
             count(*) FILTER (WHERE ca.status IN ('PRESENT','LATE'))::bigint AS attended,
             count(*)::bigint AS total
      FROM "class_attendance" ca
      JOIN "classes" c ON c.id = ca."classId"
      JOIN "users" u ON u.id = ca."studentId"
      WHERE c.status = 'COMPLETED' AND u."isDeleted" = false
        AND c."startsAt" >= ${range.start} AND c."startsAt" < ${range.end}
      GROUP BY 1, 2, 3, 4
      HAVING count(*) >= 3
        AND (count(*) FILTER (WHERE ca.status IN ('PRESENT','LATE'))::float / count(*)) * 100 < ${threshold}
      ORDER BY (count(*) FILTER (WHERE ca.status IN ('PRESENT','LATE'))::float / count(*)) ASC
      LIMIT 50
    `);
    return rows.map((r) => {
      const attended = Number(r.attended);
      const total = Number(r.total);
      return {
        studentId: r.student_id,
        name: `${r.first_name} ${r.last_name ?? ""}`.trim(),
        batchName: null,
        attendancePercent: pct(attended, total),
        classesAttended: attended,
        classesMissed: Math.max(0, total - attended),
        learningHours: 0,
        lastActiveAt: r.last_active ? new Date(r.last_active).toISOString() : null,
        lastAttendedAt: null
      };
    });
  }

  private async topStudents(range: {
    start: Date;
    end: Date;
  }): Promise<StudentRankRow[]> {
    const rows = await this.prisma.$queryRaw<
      {
        student_id: string;
        first_name: string;
        last_name: string | null;
        last_active: Date | null;
        attended: bigint;
        total: bigint;
        seconds: number | null;
      }[]
    >(Prisma.sql`
      SELECT u.id AS student_id, u."firstName" AS first_name, u."lastName" AS last_name,
             u."lastActiveAt" AS last_active,
             count(*) FILTER (WHERE ca.status IN ('PRESENT','LATE'))::bigint AS attended,
             count(*)::bigint AS total,
             coalesce(sum(ca."totalDuration"), 0)::float AS seconds
      FROM "class_attendance" ca
      JOIN "classes" c ON c.id = ca."classId"
      JOIN "users" u ON u.id = ca."studentId"
      WHERE c.status = 'COMPLETED' AND u."isDeleted" = false
        AND c."startsAt" >= ${range.start} AND c."startsAt" < ${range.end}
      GROUP BY 1, 2, 3, 4
      ORDER BY attended DESC, seconds DESC
      LIMIT 20
    `);
    return rows.map((r) => {
      const attended = Number(r.attended);
      const total = Number(r.total);
      return {
        studentId: r.student_id,
        name: `${r.first_name} ${r.last_name ?? ""}`.trim(),
        batchName: null,
        attendancePercent: pct(attended, total),
        classesAttended: attended,
        classesMissed: Math.max(0, total - attended),
        learningHours: roundTo((r.seconds ?? 0) / 3600, 1),
        lastActiveAt: r.last_active ? new Date(r.last_active).toISOString() : null,
        lastAttendedAt: null
      };
    });
  }
}

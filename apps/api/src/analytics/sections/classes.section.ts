import { Injectable } from "@nestjs/common";
import type {
  AttendanceAnalyticsResponse,
  ClassAnalyticsResponse,
  ClassSegmentStats
} from "@nexa-chess/types";
import { Prisma } from "@prisma/client";
import { getApiEnv } from "@nexa-chess/config/api";
import { PrismaService } from "../../prisma/prisma.service";
import { densifySeries, roundTo, toCategoryCounts } from "../analytics-math";
import {
  bucketedCounts,
  buildMeta,
  classDurationSeconds,
  pct,
  type AnalyticsContext
} from "../analytics-support";

type CompletedClassRow = {
  id: string;
  isDemo: boolean;
  startsAt: Date;
  endsAt: Date;
  coachId: string;
  batchId: string | null;
  liveSession: { startedAt: Date | null; endedAt: Date | null } | null;
};

@Injectable()
export class ClassesAnalyticsSection {
  private readonly env = getApiEnv();

  constructor(private readonly prisma: PrismaService) {}

  /** CoachClass `where` from the shared analytics filters (coach / batch / type). */
  private appliedFilters(ctx: AnalyticsContext): Prisma.CoachClassWhereInput {
    const f: Prisma.CoachClassWhereInput = {};
    const { coachId, batchId, classType } = ctx.filters;
    if (coachId) f.coachId = coachId;
    if (batchId) f.batchId = batchId;
    if (classType === "demo") f.isDemo = true;
    if (classType === "batch") f.isDemo = false;
    return f;
  }

  /** Same filters as `appliedFilters`, as a SQL fragment against a `classes c` alias. */
  private classSqlFilter(ctx: AnalyticsContext): Prisma.Sql {
    const { coachId, batchId, classType } = ctx.filters;
    const parts: Prisma.Sql[] = [];
    if (coachId) parts.push(Prisma.sql`AND c."coachId" = ${coachId}`);
    if (batchId) parts.push(Prisma.sql`AND c."batchId" = ${batchId}`);
    if (classType === "demo") parts.push(Prisma.sql`AND c."isDemo" = true`);
    if (classType === "batch") parts.push(Prisma.sql`AND c."isDemo" = false`);
    return parts.length ? Prisma.join(parts, " ") : Prisma.empty;
  }

  // ── /analytics/classes ──

  async classes(ctx: AnalyticsContext): Promise<ClassAnalyticsResponse> {
    const { range } = ctx;
    const base = this.appliedFilters(ctx);
    const inRange = { startsAt: { gte: range.start, lt: range.end } };

    const [statusGroups, completedRows, trendCounts, attendanceAgg, demoConversion] =
      await Promise.all([
        this.prisma.coachClass.groupBy({
          by: ["status", "isDemo"],
          where: { ...base, ...inRange },
          _count: { _all: true }
        }),
        this.prisma.coachClass.findMany({
          where: { ...base, ...inRange, status: "COMPLETED" },
          select: {
            id: true,
            isDemo: true,
            startsAt: true,
            endsAt: true,
            coachId: true,
            batchId: true,
            liveSession: { select: { startedAt: true, endedAt: true } }
          }
        }),
        bucketedCounts(
          this.prisma,
          "classes",
          "startsAt",
          range,
          Prisma.sql`"classes"."status" = 'COMPLETED'`
        ),
        this.attendanceTallyForClasses(ctx),
        this.demoConversionPercent(ctx)
      ]);

    const demo = this.segment(statusGroups, completedRows, true);
    const batch = this.segment(statusGroups, completedRows, false);

    const totalCompleted = completedRows.length;
    const overallHours = roundTo(
      completedRows.reduce(
        (s, r) =>
          s +
          classDurationSeconds({
            liveStartedAt: r.liveSession?.startedAt ?? null,
            liveEndedAt: r.liveSession?.endedAt ?? null,
            startsAt: r.startsAt,
            endsAt: r.endsAt
          }),
        0
      ) / 3600,
      1
    );

    const statusDistribution = toCategoryCounts(
      Object.entries(
        statusGroups.reduce<Record<string, number>>((acc, g) => {
          acc[g.status] = (acc[g.status] ?? 0) + g._count._all;
          return acc;
        }, {})
      ).map(([key, count]) => ({ key, label: this.statusLabel(key), count }))
    );

    return {
      meta: buildMeta(range, false),
      demo,
      batch,
      overall: {
        totalClasses: statusGroups.reduce((s, g) => s + g._count._all, 0),
        completedClasses: totalCompleted,
        totalHours: overallHours,
        avgDurationMinutes:
          totalCompleted > 0 ? roundTo((overallHours * 60) / totalCompleted, 1) : null,
        avgStudentsPerClass:
          attendanceAgg.classesWithAttendance > 0
            ? roundTo(attendanceAgg.expected / attendanceAgg.classesWithAttendance, 1)
            : null,
        attendanceRate: pct(attendanceAgg.attended, attendanceAgg.expected)
      },
      statusDistribution,
      trend: {
        granularity: range.granularity,
        points: densifySeries(trendCounts, range.start, range.end, range.granularity)
      },
      demoConversionPercent: demoConversion
    };
  }

  private segment(
    statusGroups: { status: string; isDemo: boolean; _count: { _all: number } }[],
    completedRows: CompletedClassRow[],
    isDemo: boolean
  ): ClassSegmentStats {
    const g = (status: string) =>
      statusGroups
        .filter((x) => x.isDemo === isDemo && x.status === status)
        .reduce((s, x) => s + x._count._all, 0);

    const rows = completedRows.filter((r) => r.isDemo === isDemo);
    const totalSeconds = rows.reduce(
      (s, r) =>
        s +
        classDurationSeconds({
          liveStartedAt: r.liveSession?.startedAt ?? null,
          liveEndedAt: r.liveSession?.endedAt ?? null,
          startsAt: r.startsAt,
          endsAt: r.endsAt
        }),
      0
    );

    return {
      scheduled: g("SCHEDULED") + g("LIVE") + g("IN_PROGRESS"),
      completed: g("COMPLETED"),
      cancelled: g("CANCELLED"),
      // "No-show" isn't a status in this schema — treat a class left SCHEDULED
      // past its end time as one (coach never started it).
      noShow: 0,
      totalHours: roundTo(totalSeconds / 3600, 1),
      avgDurationMinutes:
        rows.length > 0 ? roundTo(totalSeconds / 60 / rows.length, 1) : null,
      attendanceRate: null
    };
  }

  private statusLabel(status: string): string {
    return (
      {
        SCHEDULED: "Scheduled",
        LIVE: "Live",
        IN_PROGRESS: "In progress",
        COMPLETED: "Completed",
        CANCELLED: "Cancelled"
      }[status] ?? status
    );
  }

  private async attendanceTallyForClasses(ctx: AnalyticsContext): Promise<{
    attended: number;
    expected: number;
    classesWithAttendance: number;
  }> {
    const { range } = ctx;
    const filter = this.classSqlFilter(ctx);
    const rows = await this.prisma.$queryRaw<
      { attended: bigint; expected: bigint; classes: bigint }[]
    >(Prisma.sql`
      SELECT
        count(*) FILTER (WHERE ca.status IN ('PRESENT','LATE'))::bigint AS attended,
        count(*)::bigint AS expected,
        count(DISTINCT ca."classId")::bigint AS classes
      FROM "class_attendance" ca
      JOIN "classes" c ON c.id = ca."classId"
      WHERE c.status = 'COMPLETED'
        AND c."startsAt" >= ${range.start} AND c."startsAt" < ${range.end}
        ${filter}
    `);
    return {
      attended: Number(rows[0]?.attended ?? 0),
      expected: Number(rows[0]?.expected ?? 0),
      classesWithAttendance: Number(rows[0]?.classes ?? 0)
    };
  }

  private async demoConversionPercent(
    ctx: AnalyticsContext
  ): Promise<number | null> {
    // Heuristic: of students who completed a demo in the range, how many are now
    // enrolled in at least one (non-deleted) batch. Approximate — labelled as such.
    const { range } = ctx;
    const rows = await this.prisma.$queryRaw<
      { demo_students: bigint; converted: bigint }[]
    >(Prisma.sql`
      WITH demo_students AS (
        SELECT DISTINCT ca."studentId" AS student_id
        FROM "class_attendance" ca
        JOIN "classes" c ON c.id = ca."classId"
        WHERE c."isDemo" = true AND c.status = 'COMPLETED'
          AND ca.status IN ('PRESENT','LATE')
          AND c."startsAt" >= ${range.start} AND c."startsAt" < ${range.end}
      )
      SELECT
        (SELECT count(*)::bigint FROM demo_students) AS demo_students,
        (SELECT count(DISTINCT bs."studentId")::bigint
           FROM "batch_students" bs
           WHERE bs."isDeleted" = false
             AND bs."studentId" IN (SELECT student_id FROM demo_students)) AS converted
    `);
    const demo = Number(rows[0]?.demo_students ?? 0);
    const converted = Number(rows[0]?.converted ?? 0);
    return demo > 0 ? roundTo((converted / demo) * 100, 1) : null;
  }

  // ── /analytics/attendance ──

  async attendance(ctx: AnalyticsContext): Promise<AttendanceAnalyticsResponse> {
    const { range } = ctx;
    const lowThreshold =
      ctx.filters.threshold && ctx.filters.threshold > 0
        ? ctx.filters.threshold
        : this.env.ANALYTICS_LOW_ATTENDANCE_PERCENT;

    const [overall, coachCompletion, trendRows, byBatchRows, byCoachRows, lowStudents, durationAgg] =
      await Promise.all([
        this.attendanceTallyForClasses(ctx),
        this.coachCompletionRate(range),
        this.attendanceTrend(range),
        this.attendanceByGroup(range, "batch"),
        this.attendanceByGroup(range, "coach"),
        this.lowAttendanceStudents(range, lowThreshold),
        this.prisma.classAttendance.aggregate({
          where: {
            status: { in: ["PRESENT", "LATE"] },
            class: { status: "COMPLETED", startsAt: { gte: range.start, lt: range.end } }
          },
          _avg: { totalDuration: true }
        })
      ]);

    return {
      meta: buildMeta(range, false),
      kpis: {
        overallRate: pct(overall.attended, overall.expected),
        studentRate: pct(overall.attended, overall.expected),
        coachCompletionRate: coachCompletion,
        classesAttended: overall.attended,
        classesMissed: Math.max(0, overall.expected - overall.attended),
        avgAttendanceDurationMinutes: durationAgg._avg.totalDuration
          ? roundTo(durationAgg._avg.totalDuration / 60, 1)
          : null
      },
      trend: {
        granularity: range.granularity,
        points: trendRows
      },
      byBatch: byBatchRows,
      byCoach: byCoachRows,
      lowAttendanceThreshold: lowThreshold,
      lowAttendanceStudents: lowStudents
    };
  }

  private async coachCompletionRate(range: {
    start: Date;
    end: Date;
  }): Promise<number | null> {
    const grouped = await this.prisma.coachClass.groupBy({
      by: ["status"],
      where: { startsAt: { gte: range.start, lt: range.end }, isDemo: false },
      _count: { _all: true }
    });
    const total = grouped.reduce((s, g) => s + g._count._all, 0);
    const done = grouped
      .filter((g) => g.status === "COMPLETED")
      .reduce((s, g) => s + g._count._all, 0);
    return pct(done, total);
  }

  private async attendanceTrend(range: {
    start: Date;
    end: Date;
    granularity: "day" | "week" | "month";
    timezone: string;
  }) {
    const rows = await this.prisma.$queryRaw<
      { bucket: string; attended: bigint; total: bigint }[]
    >(Prisma.sql`
      SELECT to_char(date_trunc(${range.granularity}, (c."startsAt" AT TIME ZONE ${range.timezone})), 'YYYY-MM-DD') AS bucket,
             count(*) FILTER (WHERE ca.status IN ('PRESENT','LATE'))::bigint AS attended,
             count(*)::bigint AS total
      FROM "class_attendance" ca
      JOIN "classes" c ON c.id = ca."classId"
      WHERE c.status = 'COMPLETED'
        AND c."startsAt" >= ${range.start} AND c."startsAt" < ${range.end}
      GROUP BY 1 ORDER BY 1
    `);
    const map = new Map<string, number>();
    for (const r of rows) {
      const total = Number(r.total);
      map.set(r.bucket, total > 0 ? roundTo((Number(r.attended) / total) * 100, 1) : 0);
    }
    return densifySeries(map, range.start, range.end, range.granularity);
  }

  private async attendanceByGroup(
    range: { start: Date; end: Date },
    group: "batch" | "coach"
  ) {
    const idCol = group === "batch" ? `c."batchId"` : `c."coachId"`;
    const rows = await this.prisma.$queryRaw<
      { id: string; attended: bigint; total: bigint; classes: bigint }[]
    >(Prisma.sql`
      SELECT ${Prisma.raw(idCol)} AS id,
             count(*) FILTER (WHERE ca.status IN ('PRESENT','LATE'))::bigint AS attended,
             count(*)::bigint AS total,
             count(DISTINCT ca."classId")::bigint AS classes
      FROM "class_attendance" ca
      JOIN "classes" c ON c.id = ca."classId"
      WHERE c.status = 'COMPLETED'
        AND c."startsAt" >= ${range.start} AND c."startsAt" < ${range.end}
        AND ${Prisma.raw(idCol)} IS NOT NULL
      GROUP BY 1
      ORDER BY 2 DESC
      LIMIT 50
    `);

    const ids = rows.map((r) => r.id);
    const labels = new Map<string, { label: string; sublabel: string | null }>();
    if (group === "batch") {
      const batches = await this.prisma.batch.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, status: true }
      });
      for (const b of batches) labels.set(b.id, { label: b.name, sublabel: b.status });
    } else {
      const coaches = await this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, firstName: true, lastName: true, email: true }
      });
      for (const c of coaches)
        labels.set(c.id, {
          label: `${c.firstName} ${c.lastName ?? ""}`.trim(),
          sublabel: c.email
        });
    }

    return rows.map((r) => ({
      id: r.id,
      label: labels.get(r.id)?.label ?? r.id,
      sublabel: labels.get(r.id)?.sublabel ?? null,
      attendancePercent: pct(Number(r.attended), Number(r.total)),
      expected: Number(r.total),
      attended: Number(r.attended),
      classes: Number(r.classes)
    }));
  }

  async lowAttendanceStudents(
    range: { start: Date; end: Date },
    threshold: number
  ) {
    const rows = await this.prisma.$queryRaw<
      {
        student_id: string;
        first_name: string;
        last_name: string | null;
        attended: bigint;
        total: bigint;
        last_attended: Date | null;
      }[]
    >(Prisma.sql`
      SELECT u.id AS student_id, u."firstName" AS first_name, u."lastName" AS last_name,
             count(*) FILTER (WHERE ca.status IN ('PRESENT','LATE'))::bigint AS attended,
             count(*)::bigint AS total,
             max(c."startsAt") FILTER (WHERE ca.status IN ('PRESENT','LATE')) AS last_attended
      FROM "class_attendance" ca
      JOIN "classes" c ON c.id = ca."classId"
      JOIN "users" u ON u.id = ca."studentId"
      WHERE c.status = 'COMPLETED' AND u."isDeleted" = false
        AND c."startsAt" >= ${range.start} AND c."startsAt" < ${range.end}
      GROUP BY 1, 2, 3
      HAVING count(*) >= 3
         AND (count(*) FILTER (WHERE ca.status IN ('PRESENT','LATE'))::float / count(*)) * 100 < ${threshold}
      ORDER BY (count(*) FILTER (WHERE ca.status IN ('PRESENT','LATE'))::float / count(*)) ASC
      LIMIT 50
    `);

    const studentIds = rows.map((r) => r.student_id);
    const batchByStudent = await this.batchNameByStudent(studentIds);
    const lastActive = await this.prisma.user.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, lastActiveAt: true }
    });
    const lastActiveMap = new Map(lastActive.map((u) => [u.id, u.lastActiveAt]));

    return rows.map((r) => {
      const attended = Number(r.attended);
      const total = Number(r.total);
      return {
        studentId: r.student_id,
        name: `${r.first_name} ${r.last_name ?? ""}`.trim(),
        batchName: batchByStudent.get(r.student_id) ?? null,
        attendancePercent: pct(attended, total),
        classesAttended: attended,
        classesMissed: Math.max(0, total - attended),
        learningHours: 0,
        lastActiveAt: lastActiveMap.get(r.student_id)?.toISOString() ?? null,
        lastAttendedAt: r.last_attended ? new Date(r.last_attended).toISOString() : null
      };
    });
  }

  private async batchNameByStudent(
    studentIds: string[]
  ): Promise<Map<string, string>> {
    if (studentIds.length === 0) return new Map();
    const rows = await this.prisma.batchStudent.findMany({
      where: { studentId: { in: studentIds }, isDeleted: false },
      select: { studentId: true, batch: { select: { name: true } } },
      orderBy: { enrolledAt: "desc" }
    });
    const map = new Map<string, string>();
    for (const r of rows) if (!map.has(r.studentId)) map.set(r.studentId, r.batch.name);
    return map;
  }
}

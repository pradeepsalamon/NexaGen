import { Injectable } from "@nestjs/common";
import type {
  CoachAnalyticsResponse,
  CoachDetailAnalyticsResponse,
  CoachLeaderboardRow
} from "@nexa-chess/types";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  zonedDayBounds,
  zonedMonthBounds
} from "../../common/time";
import { densifySeries, roundTo, toCategoryCounts } from "../analytics-math";
import { buildMeta, pct, type AnalyticsContext } from "../analytics-support";

type CoachAggRow = {
  coach_id: string;
  first_name: string;
  last_name: string | null;
  email: string;
  status: string;
  total: bigint;
  completed: bigint;
  cancelled: bigint;
  teaching_seconds: number | null;
  duration_seconds: number | null;
};

@Injectable()
export class CoachesAnalyticsSection {
  constructor(private readonly prisma: PrismaService) {}

  private aggSql(start: Date, end: Date, coachId?: string): Prisma.Sql {
    return Prisma.sql`
      SELECT u.id AS coach_id, u."firstName" AS first_name, u."lastName" AS last_name,
             u.email AS email, u.status::text AS status,
             count(c.id)::bigint AS total,
             count(c.id) FILTER (WHERE c.status = 'COMPLETED')::bigint AS completed,
             count(c.id) FILTER (WHERE c.status = 'CANCELLED')::bigint AS cancelled,
             coalesce(sum(
               coalesce(cca."totalDuration",
                 EXTRACT(EPOCH FROM (
                   coalesce(ls."endedAt", c."endsAt") - coalesce(ls."startedAt", c."startsAt")
                 ))
               )
             ) FILTER (WHERE c.status = 'COMPLETED'), 0)::float AS teaching_seconds,
             coalesce(sum(
               EXTRACT(EPOCH FROM (
                 coalesce(ls."endedAt", c."endsAt") - coalesce(ls."startedAt", c."startsAt")
               ))
             ) FILTER (WHERE c.status = 'COMPLETED'), 0)::float AS duration_seconds
      FROM "users" u
      LEFT JOIN "classes" c
        ON c."coachId" = u.id
       AND c."startsAt" >= ${start} AND c."startsAt" < ${end}
      LEFT JOIN "coach_attendance" cca ON cca."classId" = c.id
      LEFT JOIN "live_sessions" ls ON ls."classId" = c.id
      WHERE u.role = 'COACH' AND u."isDeleted" = false
      ${coachId ? Prisma.sql`AND u.id = ${coachId}` : Prisma.empty}
      GROUP BY 1, 2, 3, 4, 5
    `;
  }

  private async studentCountByCoach(): Promise<Map<string, number>> {
    const rows = await this.prisma.$queryRaw<{ coach_id: string; students: bigint }[]>(Prisma.sql`
      SELECT bc."coachId" AS coach_id, count(DISTINCT bs."studentId")::bigint AS students
      FROM "batch_coaches" bc
      JOIN "batch_students" bs ON bs."batchId" = bc."batchId" AND bs."isDeleted" = false
      WHERE bc."isDeleted" = false
      GROUP BY 1
    `);
    return new Map(rows.map((r) => [r.coach_id, Number(r.students)]));
  }

  private async attendanceByCoach(start: Date, end: Date): Promise<Map<string, number | null>> {
    const rows = await this.prisma.$queryRaw<
      { coach_id: string; attended: bigint; total: bigint }[]
    >(Prisma.sql`
      SELECT c."coachId" AS coach_id,
             count(*) FILTER (WHERE ca.status IN ('PRESENT','LATE'))::bigint AS attended,
             count(*)::bigint AS total
      FROM "class_attendance" ca
      JOIN "classes" c ON c.id = ca."classId"
      WHERE c.status = 'COMPLETED'
        AND c."startsAt" >= ${start} AND c."startsAt" < ${end}
      GROUP BY 1
    `);
    return new Map(
      rows.map((r) => [r.coach_id, pct(Number(r.attended), Number(r.total))])
    );
  }

  private toRow(
    r: CoachAggRow,
    students: Map<string, number>,
    attendance: Map<string, number | null>
  ): CoachLeaderboardRow {
    const completed = Number(r.completed);
    const teachingHours = roundTo((r.teaching_seconds ?? 0) / 3600, 1);
    const durationSeconds = r.duration_seconds ?? 0;
    return {
      coachId: r.coach_id,
      name: `${r.first_name} ${r.last_name ?? ""}`.trim(),
      email: r.email,
      isActive: r.status === "ACTIVE",
      classesConducted: Number(r.total),
      completedClasses: completed,
      cancelledClasses: Number(r.cancelled),
      teachingHours,
      students: students.get(r.coach_id) ?? 0,
      avgAttendancePercent: attendance.get(r.coach_id) ?? null,
      avgClassDurationMinutes:
        completed > 0 ? roundTo(durationSeconds / 60 / completed, 1) : null
    };
  }

  async coaches(ctx: AnalyticsContext): Promise<CoachAnalyticsResponse> {
    const { range } = ctx;
    const now = new Date();
    const month = zonedMonthBounds(range.timezone, now);
    const today = zonedDayBounds(range.timezone, now);
    const weekStart = new Date(today.end.getTime() - 7 * 86_400_000);

    const [aggRows, monthRows, weekRows, students, attendance, hoursTrendCounts, totals] =
      await Promise.all([
        this.prisma.$queryRaw<CoachAggRow[]>(this.aggSql(range.start, range.end)),
        this.prisma.$queryRaw<CoachAggRow[]>(this.aggSql(month.start, month.end)),
        this.prisma.$queryRaw<CoachAggRow[]>(this.aggSql(weekStart, today.end)),
        this.studentCountByCoach(),
        this.attendanceByCoach(range.start, range.end),
        this.teachingSecondsTrend(range),
        this.prisma.user.groupBy({
          by: ["status"],
          where: { role: "COACH", isDeleted: false },
          _count: { _all: true }
        })
      ]);

    const leaderboard = aggRows
      .map((r) => this.toRow(r, students, attendance))
      .sort((a, b) => b.teachingHours - a.teachingHours);

    const totalCoaches = totals.reduce((s, g) => s + g._count._all, 0);
    const activeCoaches = totals
      .filter((g) => g.status === "ACTIVE")
      .reduce((s, g) => s + g._count._all, 0);

    const monthHours = roundTo(
      monthRows.reduce((s, r) => s + (r.teaching_seconds ?? 0), 0) / 3600,
      1
    );
    const weekHours = roundTo(
      weekRows.reduce((s, r) => s + (r.teaching_seconds ?? 0), 0) / 3600,
      1
    );
    const totalHours = roundTo(
      aggRows.reduce((s, r) => s + (r.teaching_seconds ?? 0), 0) / 3600,
      1
    );
    const teachingThisMonth = monthRows.filter(
      (r) => Number(r.completed) > 0
    ).length;
    const totalClasses = leaderboard.reduce((s, r) => s + r.classesConducted, 0);
    const totalCompleted = leaderboard.reduce((s, r) => s + r.completedClasses, 0);
    const totalDurationMin = aggRows.reduce(
      (s, r) => s + (r.duration_seconds ?? 0) / 60,
      0
    );
    const cancelled = leaderboard.reduce((s, r) => s + r.cancelledClasses, 0);
    const attnValues = [...attendance.values()].filter(
      (v): v is number => v !== null
    );

    return {
      meta: buildMeta(range, false),
      kpis: {
        totalCoaches,
        activeCoaches,
        teachingThisMonth,
        totalTeachingHours: totalHours,
        teachingHoursThisMonth: monthHours,
        teachingHoursThisWeek: weekHours,
        totalClassesConducted: totalClasses,
        avgClassDurationMinutes:
          totalCompleted > 0 ? roundTo(totalDurationMin / totalCompleted, 1) : null,
        avgAttendancePercent:
          attnValues.length > 0
            ? roundTo(attnValues.reduce((s, v) => s + v, 0) / attnValues.length, 1)
            : null,
        cancelledClasses: cancelled
      },
      teachingHoursTrend: {
        granularity: range.granularity,
        points: densifySeries(
          hoursTrendCounts,
          range.start,
          range.end,
          range.granularity
        )
      },
      hoursByCoach: toCategoryCounts(
        leaderboard.slice(0, 15).map((r) => ({
          key: r.coachId,
          label: r.name,
          count: Math.round(r.teachingHours)
        }))
      ),
      hoursByClassType: await this.hoursByClassType(range),
      leaderboard
    };
  }

  private async teachingSecondsTrend(range: {
    start: Date;
    end: Date;
    granularity: "day" | "week" | "month";
    timezone: string;
  }): Promise<Map<string, number>> {
    const rows = await this.prisma.$queryRaw<{ bucket: string; hours: number }[]>(Prisma.sql`
      SELECT to_char(date_trunc(${range.granularity}, (c."startsAt" AT TIME ZONE ${range.timezone})), 'YYYY-MM-DD') AS bucket,
             coalesce(sum(
               coalesce(cca."totalDuration",
                 EXTRACT(EPOCH FROM (coalesce(ls."endedAt", c."endsAt") - coalesce(ls."startedAt", c."startsAt")))
               )
             ), 0)::float / 3600 AS hours
      FROM "classes" c
      LEFT JOIN "coach_attendance" cca ON cca."classId" = c.id
      LEFT JOIN "live_sessions" ls ON ls."classId" = c.id
      WHERE c.status = 'COMPLETED'
        AND c."startsAt" >= ${range.start} AND c."startsAt" < ${range.end}
      GROUP BY 1 ORDER BY 1
    `);
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.bucket, roundTo(r.hours, 1));
    return map;
  }

  private async hoursByClassType(range: { start: Date; end: Date }) {
    const rows = await this.prisma.$queryRaw<
      { is_demo: boolean; hours: number }[]
    >(Prisma.sql`
      SELECT c."isDemo" AS is_demo,
             coalesce(sum(
               coalesce(cca."totalDuration",
                 EXTRACT(EPOCH FROM (coalesce(ls."endedAt", c."endsAt") - coalesce(ls."startedAt", c."startsAt")))
               )
             ), 0)::float / 3600 AS hours
      FROM "classes" c
      LEFT JOIN "coach_attendance" cca ON cca."classId" = c.id
      LEFT JOIN "live_sessions" ls ON ls."classId" = c.id
      WHERE c.status = 'COMPLETED'
        AND c."startsAt" >= ${range.start} AND c."startsAt" < ${range.end}
      GROUP BY 1
    `);
    return toCategoryCounts(
      rows.map((r) => ({
        key: r.is_demo ? "demo" : "batch",
        label: r.is_demo ? "Demo classes" : "Batch classes",
        count: Math.round(r.hours)
      }))
    );
  }

  async coachById(
    ctx: AnalyticsContext,
    coachId: string
  ): Promise<CoachDetailAnalyticsResponse> {
    const { range } = ctx;
    const [aggRows, students, attendance, trendCounts, hoursByBatch, recent] =
      await Promise.all([
        this.prisma.$queryRaw<CoachAggRow[]>(
          this.aggSql(range.start, range.end, coachId)
        ),
        this.studentCountByCoach(),
        this.attendanceByCoach(range.start, range.end),
        this.teachingSecondsTrend(range),
        this.hoursByBatchForCoach(range, coachId),
        this.recentClassesForCoach(range, coachId)
      ]);

    const row = aggRows[0];
    const coach = row
      ? this.toRow(row, students, attendance)
      : {
          coachId,
          name: "Unknown",
          email: "",
          isActive: false,
          classesConducted: 0,
          completedClasses: 0,
          cancelledClasses: 0,
          teachingHours: 0,
          students: 0,
          avgAttendancePercent: null,
          avgClassDurationMinutes: null
        };

    return {
      meta: buildMeta(range, false),
      coach,
      teachingHoursTrend: {
        granularity: range.granularity,
        points: densifySeries(trendCounts, range.start, range.end, range.granularity)
      },
      hoursByBatch,
      recentClasses: recent
    };
  }

  private async hoursByBatchForCoach(
    range: { start: Date; end: Date },
    coachId: string
  ) {
    const rows = await this.prisma.$queryRaw<
      { batch_id: string | null; name: string | null; hours: number }[]
    >(Prisma.sql`
      SELECT c."batchId" AS batch_id, b.name AS name,
             coalesce(sum(
               coalesce(cca."totalDuration",
                 EXTRACT(EPOCH FROM (coalesce(ls."endedAt", c."endsAt") - coalesce(ls."startedAt", c."startsAt")))
               )
             ), 0)::float / 3600 AS hours
      FROM "classes" c
      LEFT JOIN "batches" b ON b.id = c."batchId"
      LEFT JOIN "coach_attendance" cca ON cca."classId" = c.id
      LEFT JOIN "live_sessions" ls ON ls."classId" = c.id
      WHERE c.status = 'COMPLETED' AND c."coachId" = ${coachId}
        AND c."startsAt" >= ${range.start} AND c."startsAt" < ${range.end}
      GROUP BY 1, 2
    `);
    return toCategoryCounts(
      rows.map((r) => ({
        key: r.batch_id ?? "demo",
        label: r.name ?? "Demo / no batch",
        count: Math.round(r.hours)
      }))
    );
  }

  private async recentClassesForCoach(
    range: { start: Date; end: Date },
    coachId: string
  ) {
    const rows = await this.prisma.coachClass.findMany({
      where: {
        coachId,
        startsAt: { gte: range.start, lt: range.end }
      },
      orderBy: { startsAt: "desc" },
      take: 20,
      select: {
        id: true,
        topic: true,
        title: true,
        startsAt: true,
        endsAt: true,
        status: true,
        batch: { select: { name: true } },
        liveSession: { select: { startedAt: true, endedAt: true } },
        _count: { select: { attendances: true } },
        attendances: { select: { status: true } }
      }
    });

    return rows.map((c) => {
      const actualMs =
        c.liveSession?.startedAt && c.liveSession?.endedAt
          ? c.liveSession.endedAt.getTime() - c.liveSession.startedAt.getTime()
          : c.endsAt.getTime() - c.startsAt.getTime();
      const attended = c.attendances.filter(
        (a) => a.status === "PRESENT" || a.status === "LATE"
      ).length;
      return {
        classId: c.id,
        topic: c.topic ?? c.title ?? "Class",
        batchName: c.batch?.name ?? null,
        date: c.startsAt.toISOString(),
        durationMinutes: roundTo(Math.max(0, actualMs) / 60000, 0),
        attendancePercent: pct(attended, c.attendances.length),
        status: c.status
      };
    });
  }
}

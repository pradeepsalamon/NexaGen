import { Injectable } from "@nestjs/common";
import type {
  AcquisitionAnalyticsResponse,
  EngagementAnalyticsResponse,
  UserAnalyticsResponse
} from "@nexa-chess/types";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  zonedDayBounds,
  zonedMonthBounds,
  zonedYearBounds
} from "../../common/time";
import { densifySeries, roundTo, toCategoryCounts } from "../analytics-math";
import {
  bucketedCounts,
  buildMeta,
  pct,
  type AnalyticsContext
} from "../analytics-support";

const ACQUISITION_LABELS: Record<string, string> = {
  WEBSITE: "NexaChess website",
  GOOGLE: "Google / Search",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  YOUTUBE: "YouTube",
  WHATSAPP: "WhatsApp",
  REFERRAL: "Friend / family referral",
  SCHOOL: "School / Institution",
  COACH_REFERRAL: "Coach referral",
  ADVERTISEMENT: "Advertisement",
  OTHER: "Other",
  UNKNOWN: "Unknown"
};

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  COACH: "Coach",
  STUDENT: "Student"
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active",
  PENDING: "Pending",
  ARCHIVED: "Archived",
  DELETED: "Deleted"
};

@Injectable()
export class UsersAnalyticsSection {
  constructor(private readonly prisma: PrismaService) {}

  // ── shared count helpers (also used by the overview section) ──

  /** Users active (lastActiveAt or an analytics event) within [start, end). */
  async activeUserCount(start: Date, end: Date): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT count(DISTINCT u.id)::bigint AS count
      FROM "users" u
      WHERE u."isDeleted" = false
        AND (
          (u."lastActiveAt" >= ${start} AND u."lastActiveAt" < ${end})
          OR EXISTS (
            SELECT 1 FROM "analytics_events" e
            WHERE e."userId" = u.id
              AND e."occurredAt" >= ${start} AND e."occurredAt" < ${end}
          )
        )
    `);
    return Number(rows[0]?.count ?? 0);
  }

  async newUserCount(start: Date, end: Date): Promise<number> {
    return this.prisma.user.count({
      where: { isDeleted: false, createdAt: { gte: start, lt: end } }
    });
  }

  async roleCounts(): Promise<Record<string, number>> {
    const grouped = await this.prisma.user.groupBy({
      by: ["role"],
      where: { isDeleted: false },
      _count: { _all: true }
    });
    return Object.fromEntries(grouped.map((g) => [g.role, g._count._all]));
  }

  // ── /analytics/users ──

  async users(ctx: AnalyticsContext): Promise<UserAnalyticsResponse> {
    const { range } = ctx;
    const now = new Date();
    const today = zonedDayBounds(range.timezone, now);
    const week = { start: new Date(today.end.getTime() - 7 * 86_400_000), end: today.end };
    const month = zonedMonthBounds(range.timezone, now);
    const prevMonth = zonedMonthBounds(
      range.timezone,
      new Date(month.start.getTime() - 1)
    );
    const year = zonedYearBounds(range.timezone, now);

    const [
      growthCounts,
      priorTotal,
      byRole,
      byStatus,
      totalUsers,
      today_,
      thisWeek,
      thisMonth,
      prevMonthCount,
      thisYear
    ] = await Promise.all([
      bucketedCounts(this.prisma, "users", "createdAt", range, Prisma.sql`"users"."isDeleted" = false`),
      this.prisma.user.count({
        where: { isDeleted: false, createdAt: { lt: range.start } }
      }),
      this.prisma.user.groupBy({
        by: ["role"],
        where: { isDeleted: false },
        _count: { _all: true }
      }),
      this.prisma.user.groupBy({
        by: ["status"],
        where: { isDeleted: false },
        _count: { _all: true }
      }),
      this.prisma.user.count({ where: { isDeleted: false } }),
      this.prisma.user.count({
        where: { isDeleted: false, createdAt: { gte: today.start, lt: today.end } }
      }),
      this.prisma.user.count({
        where: { isDeleted: false, createdAt: { gte: week.start, lt: week.end } }
      }),
      this.prisma.user.count({
        where: { isDeleted: false, createdAt: { gte: month.start, lt: month.end } }
      }),
      this.prisma.user.count({
        where: {
          isDeleted: false,
          createdAt: { gte: prevMonth.start, lt: prevMonth.end }
        }
      }),
      this.prisma.user.count({
        where: { isDeleted: false, createdAt: { gte: year.start, lt: year.end } }
      })
    ]);

    const growth = densifySeries(growthCounts, range.start, range.end, range.granularity, {
      cumulative: true,
      cumulativeBase: priorTotal
    });

    return {
      meta: buildMeta(range, false),
      growth: { granularity: range.granularity, points: growth },
      registrations: {
        today: today_,
        thisWeek,
        thisMonth,
        prevMonth: prevMonthCount,
        thisYear,
        growthPercent:
          prevMonthCount > 0
            ? roundTo(((thisMonth - prevMonthCount) / prevMonthCount) * 100, 1)
            : null
      },
      byRole: toCategoryCounts(
        byRole.map((g) => ({
          key: g.role,
          label: ROLE_LABELS[g.role] ?? g.role,
          count: g._count._all
        }))
      ),
      byStatus: toCategoryCounts(
        byStatus.map((g) => ({
          key: g.status,
          label: STATUS_LABELS[g.status] ?? g.status,
          count: g._count._all
        }))
      ),
      totalUsers
    };
  }

  // ── /analytics/acquisition ──

  async acquisition(ctx: AnalyticsContext): Promise<AcquisitionAnalyticsResponse> {
    const { range } = ctx;

    const [current, previous, campaigns, monthlyRows] = await Promise.all([
      this.prisma.user.groupBy({
        by: ["acquisitionSource"],
        where: {
          isDeleted: false,
          createdAt: { gte: range.start, lt: range.end }
        },
        _count: { _all: true }
      }),
      range.compareStart && range.compareEnd
        ? this.prisma.user.groupBy({
            by: ["acquisitionSource"],
            where: {
              isDeleted: false,
              createdAt: { gte: range.compareStart, lt: range.compareEnd }
            },
            _count: { _all: true }
          })
        : Promise.resolve([]),
      this.prisma.user.groupBy({
        by: ["utmCampaign"],
        where: {
          isDeleted: false,
          utmCampaign: { not: null },
          createdAt: { gte: range.start, lt: range.end }
        },
        _count: { _all: true }
      }),
      this.prisma.$queryRaw<{ month: string; source: string; count: bigint }[]>(Prisma.sql`
        SELECT to_char(date_trunc('month', ("createdAt" AT TIME ZONE ${range.timezone})), 'YYYY-MM') AS month,
               "acquisitionSource"::text AS source,
               count(*)::bigint AS count
        FROM "users"
        WHERE "isDeleted" = false
          AND "createdAt" >= (now() - interval '6 months')
        GROUP BY 1, 2
        ORDER BY 1
      `)
    ]);

    const prevMap = new Map(
      previous.map((p) => [p.acquisitionSource, p._count._all])
    );
    const total = current.reduce((s, c) => s + c._count._all, 0);

    const sources = current
      .map((c) => {
        const prev = prevMap.get(c.acquisitionSource) ?? 0;
        return {
          key: c.acquisitionSource,
          label: ACQUISITION_LABELS[c.acquisitionSource] ?? c.acquisitionSource,
          users: c._count._all,
          percent: pct(c._count._all, total) ?? 0,
          deltaPct:
            prev > 0
              ? roundTo(((c._count._all - prev) / prev) * 100, 1)
              : null
        };
      })
      .sort((a, b) => b.users - a.users);

    const knownCount = sources
      .filter((s) => s.key !== "UNKNOWN")
      .reduce((s, r) => s + r.users, 0);
    const unknownCount = sources.find((s) => s.key === "UNKNOWN")?.users ?? 0;

    const monthMap = new Map<string, { key: string; count: number }[]>();
    for (const row of monthlyRows) {
      const arr = monthMap.get(row.month) ?? [];
      arr.push({ key: row.source, count: Number(row.count) });
      monthMap.set(row.month, arr);
    }

    return {
      meta: buildMeta(range, false),
      sources,
      knownCount,
      unknownCount,
      monthlyTrend: [...monthMap.entries()].map(([month, bySource]) => ({
        month,
        bySource
      })),
      utmCampaigns: toCategoryCounts(
        campaigns
          .filter((c) => c.utmCampaign)
          .map((c) => ({
            key: c.utmCampaign as string,
            label: c.utmCampaign as string,
            count: c._count._all
          }))
      )
    };
  }

  // ── /analytics/engagement ──

  async engagement(ctx: AnalyticsContext): Promise<EngagementAnalyticsResponse> {
    const { range } = ctx;
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 86_400_000);
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    const monthAgo = new Date(now.getTime() - 30 * 86_400_000);

    const totalEvents = await this.prisma.analyticsEvent.count();
    const available = totalEvents > 0;

    const [dau, wau, mau, trendCounts, byType, activeInRange, totalUsers] =
      await Promise.all([
        this.distinctActive(dayAgo, now),
        this.distinctActive(weekAgo, now),
        this.distinctActive(monthAgo, now),
        bucketedCounts(this.prisma, "analytics_events", "occurredAt", {
          ...range,
          granularity: "day"
        }),
        this.prisma.analyticsEvent.groupBy({
          by: ["type"],
          where: { occurredAt: { gte: range.start, lt: range.end } },
          _count: { _all: true }
        }),
        this.activeUserCount(range.start, range.end),
        this.prisma.user.count({ where: { isDeleted: false } })
      ]);

    // new-vs-returning: of users active in range, how many registered in range
    const newActive = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT count(DISTINCT e."userId")::bigint AS count
      FROM "analytics_events" e
      JOIN "users" u ON u.id = e."userId"
      WHERE e."occurredAt" >= ${range.start} AND e."occurredAt" < ${range.end}
        AND u."createdAt" >= ${range.start} AND u."createdAt" < ${range.end}
    `);
    const newActiveCount = Math.min(Number(newActive[0]?.count ?? 0), activeInRange);

    const recentlyActive = await this.prisma.user.findMany({
      where: { isDeleted: false, lastActiveAt: { not: null } },
      orderBy: { lastActiveAt: "desc" },
      take: 15,
      select: { id: true, firstName: true, lastName: true, role: true, lastActiveAt: true }
    });

    const trend = densifySeries(trendCounts, range.start, range.end, "day");

    return {
      meta: buildMeta(range, false),
      available,
      dau,
      wau,
      mau,
      stickiness: mau > 0 ? roundTo((dau / mau) * 100, 1) : null,
      activeUsers: activeInRange,
      inactiveUsers: Math.max(0, totalUsers - activeInRange),
      newVsReturning: {
        new: newActiveCount,
        returning: Math.max(0, activeInRange - newActiveCount)
      },
      trend: { granularity: "day", points: trend },
      byEventType: toCategoryCounts(
        byType.map((g) => ({ key: g.type, label: g.type, count: g._count._all }))
      ),
      recentlyActive: recentlyActive.map((u) => ({
        userId: u.id,
        name: `${u.firstName} ${u.lastName ?? ""}`.trim(),
        role: u.role,
        lastActiveAt: u.lastActiveAt?.toISOString() ?? null
      }))
    };
  }

  private async distinctActive(start: Date, end: Date): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
      SELECT count(DISTINCT "userId")::bigint AS count
      FROM "analytics_events"
      WHERE "occurredAt" >= ${start} AND "occurredAt" < ${end}
    `);
    return Number(rows[0]?.count ?? 0);
  }
}

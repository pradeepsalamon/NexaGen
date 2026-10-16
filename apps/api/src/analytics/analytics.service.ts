import {
  ForbiddenException,
  Injectable
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type {
  AcquisitionAnalyticsResponse,
  AlertsResponse,
  AnalyticsOverviewResponse,
  AnalyticsRangeQuery,
  AttendanceAnalyticsResponse,
  BatchAnalyticsResponse,
  BatchDetailAnalyticsResponse,
  ClassAnalyticsResponse,
  CoachAnalyticsResponse,
  CoachDetailAnalyticsResponse,
  EngagementAnalyticsResponse,
  OperationsResponse,
  RecordingAnalyticsResponse,
  StorageAnalyticsResponse,
  StudentAnalyticsResponse,
  TodayResponse,
  UserAnalyticsResponse
} from "@nexa-chess/types";
import { analyticsRangeQuerySchema } from "@nexa-chess/types";
import { Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { zonedMonthBounds } from "../common/time";
import { AnalyticsCache } from "./analytics-cache";
import { makeKpi, roundTo } from "./analytics-math";
import { resolveAnalyticsRange, type ResolvedRange } from "./analytics-range.util";
import {
  BYTES_PER_GB,
  buildMeta,
  pct,
  type AnalyticsContext,
  type AnalyticsFilters
} from "./analytics-support";
import { BatchesAnalyticsSection } from "./sections/batches.section";
import { ClassesAnalyticsSection } from "./sections/classes.section";
import { CoachesAnalyticsSection } from "./sections/coaches.section";
import { OperationsAnalyticsSection } from "./sections/operations.section";
import { RecordingsAnalyticsSection } from "./sections/recordings.section";
import { UsersAnalyticsSection } from "./sections/users.section";
import { authenticateUser } from "../auth/authenticate";
import { parseOrBadRequest } from "../common/zod-body.pipe";

@Injectable()
export class AnalyticsService {

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly cache: AnalyticsCache,
    private readonly usersSection: UsersAnalyticsSection,
    private readonly classesSection: ClassesAnalyticsSection,
    private readonly coachesSection: CoachesAnalyticsSection,
    private readonly batchesSection: BatchesAnalyticsSection,
    private readonly recordingsSection: RecordingsAnalyticsSection,
    private readonly operationsSection: OperationsAnalyticsSection
  ) {}

  // ── auth (mirrors batch.service.ts) ──

  private getAuthenticatedUser(accessToken: string | undefined) {
    return authenticateUser(this.jwtService, this.prisma, accessToken);
  }

  private assertCanViewAnalytics(user: { role: UserRole }) {
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Analytics access is restricted to admins.");
    }
  }

  async resolveContext(
    accessToken: string | undefined,
    query: AnalyticsRangeQuery | undefined
  ): Promise<{ ctx: AnalyticsContext; fresh: boolean; cacheKey: string }> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertCanViewAnalytics(user);
    // Validated after auth, so an anonymous caller still gets 401. A repeated
    // key (an array) or a bad enum used to reach Prisma / raw SQL as a 500.
    query = parseOrBadRequest(analyticsRangeQuerySchema, query ?? {}, "query");

    const range = resolveAnalyticsRange(query, user.timezone);
    const filters: AnalyticsFilters = {
      role: query?.role,
      batchId: query?.batchId,
      coachId: query?.coachId,
      classType: query?.classType,
      acquisitionSource: query?.acquisitionSource,
      status: query?.status,
      threshold: query?.threshold
    };
    const ctx: AnalyticsContext = {
      range,
      user: { id: user.id, role: user.role, timezone: user.timezone },
      filters
    };
    const cacheKey = JSON.stringify({
      tz: range.timezone,
      preset: range.preset,
      start: range.start.getTime(),
      end: range.end.getTime(),
      compare: range.compare,
      granularity: range.granularity,
      filters
    });
    return { ctx, fresh: Boolean(query?.fresh), cacheKey };
  }

  private compareRange(range: ResolvedRange): ResolvedRange | null {
    if (!range.compareStart || !range.compareEnd) return null;
    return { ...range, start: range.compareStart, end: range.compareEnd };
  }

  // ── /analytics/overview ──

  async overview(
    accessToken: string | undefined,
    query: AnalyticsRangeQuery | undefined
  ): Promise<AnalyticsOverviewResponse> {
    const { ctx, fresh, cacheKey } = await this.resolveContext(accessToken, query);
    const { value, cached } = await this.cache.wrap(
      `overview:${cacheKey}`,
      fresh,
      () => this.computeOverview(ctx)
    );
    return { ...value, meta: buildMeta(ctx.range, cached) };
  }

  private async computeOverview(
    ctx: AnalyticsContext
  ): Promise<AnalyticsOverviewResponse> {
    const { range } = ctx;
    const prev = this.compareRange(range);
    const now = new Date();
    const month = zonedMonthBounds(range.timezone, now);
    const prevMonth = zonedMonthBounds(
      range.timezone,
      new Date(month.start.getTime() - 1)
    );

    const countUsers = (where: Prisma.UserWhereInput) =>
      this.prisma.user.count({ where });

    const [
      totalUsers,
      newUsersThisMonth,
      newUsersPrevMonth,
      studentsTotal,
      coachesTotal,
      activeCoaches,
      activeBatches,
      classesThisMonth,
      classesPrevMonth,
      recordingsTotal,
      storageUsage
    ] = await Promise.all([
      countUsers({ isDeleted: false }),
      countUsers({
        isDeleted: false,
        createdAt: { gte: month.start, lt: month.end }
      }),
      countUsers({
        isDeleted: false,
        createdAt: { gte: prevMonth.start, lt: prevMonth.end }
      }),
      countUsers({ isDeleted: false, role: "STUDENT" }),
      countUsers({ isDeleted: false, role: "COACH" }),
      countUsers({ isDeleted: false, role: "COACH", status: "ACTIVE" }),
      this.prisma.batch.count({ where: { isDeleted: false, status: "ACTIVE" } }),
      this.prisma.coachClass.count({
        where: { startsAt: { gte: month.start, lt: month.end } }
      }),
      this.prisma.coachClass.count({
        where: { startsAt: { gte: prevMonth.start, lt: prevMonth.end } }
      }),
      this.prisma.liveSession.count({ where: { recordingUrl: { not: null } } }),
      this.recordingsSection.storageUsageOrNull()
    ]);

    // Range-scoped metrics with previous-period comparison.
    const [
      activeUsersCur,
      activeUsersPrev,
      completedLiveCur,
      completedLivePrev,
      demoCompletedCur,
      demoCompletedPrev,
      batchCompletedCur,
      batchCompletedPrev,
      hoursCur,
      hoursPrev,
      attendanceCur,
      attendancePrev
    ] = await Promise.all([
      this.usersSection.activeUserCount(range.start, range.end),
      prev ? this.usersSection.activeUserCount(prev.start, prev.end) : Promise.resolve(null),
      this.completedClassCount(range.start, range.end),
      prev ? this.completedClassCount(prev.start, prev.end) : Promise.resolve(null),
      this.completedClassCount(range.start, range.end, true),
      prev ? this.completedClassCount(prev.start, prev.end, true) : Promise.resolve(null),
      this.completedClassCount(range.start, range.end, false),
      prev ? this.completedClassCount(prev.start, prev.end, false) : Promise.resolve(null),
      this.liveClassHours(range.start, range.end),
      prev ? this.liveClassHours(prev.start, prev.end) : Promise.resolve(null),
      this.attendanceRate(range.start, range.end),
      prev ? this.attendanceRate(prev.start, prev.end) : Promise.resolve(null)
    ]);

    const usedGb = storageUsage ? roundTo(storageUsage.usedBytes / BYTES_PER_GB, 2) : null;
    const remainingGb = storageUsage
      ? roundTo(Math.max(0, storageUsage.limitBytes - storageUsage.usedBytes) / BYTES_PER_GB, 2)
      : null;

    return {
      meta: buildMeta(range, false),
      kpis: {
        totalUsers: makeKpi(totalUsers, null, "count"),
        activeUsers: makeKpi(activeUsersCur, activeUsersPrev, "count"),
        newUsersThisMonth: makeKpi(newUsersThisMonth, newUsersPrevMonth, "count"),
        totalStudents: makeKpi(studentsTotal, null, "count"),
        totalCoaches: makeKpi(coachesTotal, null, "count"),
        activeCoaches: makeKpi(activeCoaches, null, "count"),
        activeBatches: makeKpi(activeBatches, null, "count"),
        completedLiveClasses: makeKpi(completedLiveCur, completedLivePrev, "count"),
        totalLiveClassHours: makeKpi(hoursCur, hoursPrev, "hours"),
        demoClassesCompleted: makeKpi(demoCompletedCur, demoCompletedPrev, "count"),
        batchClassesCompleted: makeKpi(batchCompletedCur, batchCompletedPrev, "count"),
        totalRecordings: makeKpi(recordingsTotal, null, "count"),
        recordingStorageUsedGb: makeKpi(usedGb, null, "count"),
        recordingStorageRemainingGb: makeKpi(remainingGb, null, "count"),
        attendanceRate: makeKpi(attendanceCur, attendancePrev, "percent"),
        classesThisMonth: makeKpi(classesThisMonth, classesPrevMonth, "count")
      }
    };
  }

  private async completedClassCount(
    start: Date,
    end: Date,
    isDemo?: boolean
  ): Promise<number> {
    return this.prisma.coachClass.count({
      where: {
        status: "COMPLETED",
        startsAt: { gte: start, lt: end },
        ...(isDemo === undefined ? {} : { isDemo })
      }
    });
  }

  private async liveClassHours(start: Date, end: Date): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ hours: number }[]>`
      SELECT coalesce(sum(
        EXTRACT(EPOCH FROM (
          coalesce(ls."endedAt", c."endsAt") - coalesce(ls."startedAt", c."startsAt")
        ))
      ), 0)::float / 3600 AS hours
      FROM "classes" c
      LEFT JOIN "live_sessions" ls ON ls."classId" = c.id
      WHERE c.status = 'COMPLETED'
        AND c."startsAt" >= ${start} AND c."startsAt" < ${end}
    `;
    return roundTo(rows[0]?.hours ?? 0, 1);
  }

  private async attendanceRate(start: Date, end: Date): Promise<number | null> {
    const rows = await this.prisma.$queryRaw<
      { attended: bigint; total: bigint }[]
    >`
      SELECT count(*) FILTER (WHERE ca.status IN ('PRESENT','LATE'))::bigint AS attended,
             count(*)::bigint AS total
      FROM "class_attendance" ca
      JOIN "classes" c ON c.id = ca."classId"
      WHERE c.status = 'COMPLETED'
        AND c."startsAt" >= ${start} AND c."startsAt" < ${end}
    `;
    return pct(Number(rows[0]?.attended ?? 0), Number(rows[0]?.total ?? 0));
  }

  // ── delegating section endpoints ──

  private async section<T>(
    accessToken: string | undefined,
    query: AnalyticsRangeQuery | undefined,
    name: string,
    run: (ctx: AnalyticsContext) => Promise<T>,
    cacheable = true
  ): Promise<T> {
    const { ctx, fresh, cacheKey } = await this.resolveContext(accessToken, query);
    if (!cacheable) return run(ctx);
    const { value } = await this.cache.wrap(`${name}:${cacheKey}`, fresh, () =>
      run(ctx)
    );
    return value;
  }

  users(t: string | undefined, q?: AnalyticsRangeQuery): Promise<UserAnalyticsResponse> {
    return this.section(t, q, "users", (ctx) => this.usersSection.users(ctx));
  }
  acquisition(t: string | undefined, q?: AnalyticsRangeQuery): Promise<AcquisitionAnalyticsResponse> {
    return this.section(t, q, "acquisition", (ctx) => this.usersSection.acquisition(ctx));
  }
  engagement(t: string | undefined, q?: AnalyticsRangeQuery): Promise<EngagementAnalyticsResponse> {
    return this.section(t, q, "engagement", (ctx) => this.usersSection.engagement(ctx));
  }
  students(t: string | undefined, q?: AnalyticsRangeQuery): Promise<StudentAnalyticsResponse> {
    return this.section(t, q, "students", (ctx) => this.batchesSection.students(ctx));
  }
  classes(t: string | undefined, q?: AnalyticsRangeQuery): Promise<ClassAnalyticsResponse> {
    return this.section(t, q, "classes", (ctx) => this.classesSection.classes(ctx));
  }
  attendance(t: string | undefined, q?: AnalyticsRangeQuery): Promise<AttendanceAnalyticsResponse> {
    return this.section(t, q, "attendance", (ctx) => this.classesSection.attendance(ctx));
  }
  coaches(t: string | undefined, q?: AnalyticsRangeQuery): Promise<CoachAnalyticsResponse> {
    return this.section(t, q, "coaches", (ctx) => this.coachesSection.coaches(ctx));
  }
  coachById(t: string | undefined, id: string, q?: AnalyticsRangeQuery): Promise<CoachDetailAnalyticsResponse> {
    return this.section(t, q, `coach:${id}`, (ctx) => this.coachesSection.coachById(ctx, id));
  }
  batches(t: string | undefined, q?: AnalyticsRangeQuery): Promise<BatchAnalyticsResponse> {
    return this.section(t, q, "batches", (ctx) => this.batchesSection.batches(ctx));
  }
  batchById(t: string | undefined, id: string, q?: AnalyticsRangeQuery): Promise<BatchDetailAnalyticsResponse> {
    return this.section(t, q, `batch:${id}`, (ctx) => this.batchesSection.batchById(ctx, id));
  }
  recordings(t: string | undefined, q?: AnalyticsRangeQuery): Promise<RecordingAnalyticsResponse> {
    return this.section(t, q, "recordings", (ctx) => this.recordingsSection.recordings(ctx));
  }
  storage(t: string | undefined, q?: AnalyticsRangeQuery): Promise<StorageAnalyticsResponse> {
    return this.section(t, q, "storage", (ctx) =>
      this.recordingsSection.storageAnalytics(ctx)
    );
  }
  operations(t: string | undefined, q?: AnalyticsRangeQuery): Promise<OperationsResponse> {
    return this.section(t, q, "operations", (ctx) => this.operationsSection.operations(ctx), false);
  }
  today(t: string | undefined, q?: AnalyticsRangeQuery): Promise<TodayResponse> {
    return this.section(t, q, "today", (ctx) => this.operationsSection.today(ctx), false);
  }
  alerts(t: string | undefined, q?: AnalyticsRangeQuery): Promise<AlertsResponse> {
    return this.section(t, q, "alerts", (ctx) => this.operationsSection.alerts(ctx));
  }
}

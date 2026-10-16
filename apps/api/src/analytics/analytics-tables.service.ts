import { BadRequestException, Injectable } from "@nestjs/common";
import type {
  AnalyticsBatchesTableResponse,
  AnalyticsClassesTableResponse,
  AnalyticsCoachesTableResponse,
  AnalyticsExportReport,
  AnalyticsRecordingsTableResponse,
  AnalyticsUsersTableResponse,
  AnalyticsRangeQuery,
  PaginatedQuery
} from "@nexa-chess/types";
import { analyticsExportReportSchema } from "@nexa-chess/types";
import { AcquisitionSource, ClassStatus, Prisma, UserRole, UserStatus } from "@prisma/client";
import { queryEnum } from "../common/query-params";
import {
  paginationMeta,
  resolveOrderBy,
  resolvePagination
} from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";
import { AnalyticsService } from "./analytics.service";
import { classDurationSeconds } from "./analytics-support";
import { rowsToCsv } from "./analytics-csv";
import { BatchesAnalyticsSection } from "./sections/batches.section";
import { CoachesAnalyticsSection } from "./sections/coaches.section";

type TableQuery = PaginatedQuery & AnalyticsRangeQuery;

@Injectable()
export class AnalyticsTablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
    private readonly coachesSection: CoachesAnalyticsSection,
    private readonly batchesSection: BatchesAnalyticsSection
  ) {}

  // ── users ──

  async usersTable(
    token: string | undefined,
    query: TableQuery
  ): Promise<AnalyticsUsersTableResponse> {
    const { ctx } = await this.analytics.resolveContext(token, query);
    const { page, pageSize, skip, take, search } = resolvePagination(query);

    const where: Prisma.UserWhereInput = { isDeleted: false };
    const role = queryEnum(query.role, UserRole, "role");
    const status = queryEnum(query.status, UserStatus, "status");
    const acquisitionSource = queryEnum(query.acquisitionSource, AcquisitionSource, "acquisitionSource");
    if (role) where.role = role;
    if (status) where.status = status;
    if (acquisitionSource) where.acquisitionSource = acquisitionSource;
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } }
      ];
    }
    // date filter uses the resolved analytics range
    where.createdAt = { gte: ctx.range.start, lt: ctx.range.end };
    if (query.preset === undefined && !query.from && !query.to) {
      delete where.createdAt;
    }

    const orderBy = resolveOrderBy(
      query,
      ["createdAt", "lastActiveAt", "firstName", "email", "role"],
      { createdAt: "asc" }
    );

    const [total, rows] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          status: true,
          acquisitionSource: true,
          createdAt: true,
          lastActiveAt: true,
          studentBatches: {
            where: { isDeleted: false },
            select: { batch: { select: { name: true } } }
          },
          coachedBatches: {
            where: { isDeleted: false },
            select: { batch: { select: { name: true } } }
          }
        }
      })
    ]);

    return {
      rows: rows.map((u) => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName ?? ""}`.trim(),
        email: u.email,
        role: u.role,
        status: u.status,
        acquisitionSource: u.acquisitionSource,
        createdAt: u.createdAt.toISOString(),
        lastActiveAt: u.lastActiveAt?.toISOString() ?? null,
        batchNames: [
          ...u.studentBatches.map((b) => b.batch.name),
          ...u.coachedBatches.map((b) => b.batch.name)
        ]
      })),
      pagination: paginationMeta(total, page, pageSize)
    };
  }

  // ── classes ──

  async classesTable(
    token: string | undefined,
    query: TableQuery
  ): Promise<AnalyticsClassesTableResponse> {
    const { ctx } = await this.analytics.resolveContext(token, query);
    const { page, pageSize, skip, take, search } = resolvePagination(query);

    const where: Prisma.CoachClassWhereInput = {
      startsAt: { gte: ctx.range.start, lt: ctx.range.end }
    };
    if (query.coachId) where.coachId = query.coachId;
    if (query.batchId) where.batchId = query.batchId;
    if (query.classType === "demo") where.isDemo = true;
    if (query.classType === "batch") where.isDemo = false;
    const classStatus = queryEnum(query.status, ClassStatus, "status");
    if (classStatus) where.status = classStatus;
    if (search) {
      where.OR = [
        { topic: { contains: search, mode: "insensitive" } },
        { title: { contains: search, mode: "insensitive" } }
      ];
    }

    const orderBy = resolveOrderBy(query, ["startsAt", "status"], {
      startsAt: "asc"
    });

    const [total, rows] = await Promise.all([
      this.prisma.coachClass.count({ where }),
      this.prisma.coachClass.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          id: true,
          startsAt: true,
          endsAt: true,
          topic: true,
          title: true,
          isDemo: true,
          status: true,
          coach: { select: { firstName: true, lastName: true } },
          batch: { select: { name: true } },
          liveSession: {
            select: { startedAt: true, endedAt: true, recordingUrl: true }
          },
          _count: { select: { attendances: true } },
          attendances: { select: { status: true } }
        }
      })
    ]);

    return {
      rows: rows.map((c) => {
        const durationSeconds = classDurationSeconds({
          liveStartedAt: c.liveSession?.startedAt ?? null,
          liveEndedAt: c.liveSession?.endedAt ?? null,
          startsAt: c.startsAt,
          endsAt: c.endsAt
        });
        const attended = c.attendances.filter(
          (a) => a.status === "PRESENT" || a.status === "LATE"
        ).length;
        return {
          id: c.id,
          date: c.startsAt.toISOString(),
          time: c.startsAt.toISOString(),
          type: c.isDemo ? ("demo" as const) : ("batch" as const),
          topic: c.topic ?? c.title ?? "Class",
          coachName: `${c.coach.firstName} ${c.coach.lastName ?? ""}`.trim(),
          batchName: c.batch?.name ?? null,
          students: c._count.attendances,
          durationMinutes: Math.round(durationSeconds / 60),
          status: c.status,
          hasRecording: Boolean(c.liveSession?.recordingUrl),
          attendancePercent:
            c.attendances.length > 0
              ? Math.round((attended / c.attendances.length) * 1000) / 10
              : null
        };
      }),
      pagination: paginationMeta(total, page, pageSize)
    };
  }

  // ── recordings ──

  async recordingsTable(
    token: string | undefined,
    query: TableQuery
  ): Promise<AnalyticsRecordingsTableResponse> {
    const { ctx } = await this.analytics.resolveContext(token, query);
    const { page, pageSize, skip, take, search } = resolvePagination(query);

    const where: Prisma.LiveSessionWhereInput = {
      recordingUrl: { not: null }
    };
    if (query.from || query.to || query.preset) {
      where.recordingCompletedAt = { gte: ctx.range.start, lt: ctx.range.end };
    }
    if (query.coachId) where.coachId = query.coachId;
    if (query.batchId) where.batchId = query.batchId;
    if (search) {
      where.class = {
        OR: [
          { topic: { contains: search, mode: "insensitive" } },
          { title: { contains: search, mode: "insensitive" } }
        ]
      };
    }

    const orderBy = resolveOrderBy(
      query,
      ["recordingCompletedAt", "recordingBytes", "recordingDurationSeconds"],
      { recordingCompletedAt: "asc" }
    );

    const [total, rows] = await Promise.all([
      this.prisma.liveSession.count({ where }),
      this.prisma.liveSession.findMany({
        where,
        orderBy,
        skip,
        take,
        select: {
          classId: true,
          recordingBytes: true,
          recordingDurationSeconds: true,
          recordingCompletedAt: true,
          recordingStatus: true,
          createdAt: true,
          class: {
            select: {
              topic: true,
              title: true,
              coach: { select: { firstName: true, lastName: true } },
              batch: { select: { name: true } }
            }
          }
        }
      })
    ]);

    return {
      rows: rows.map((r) => ({
        classId: r.classId,
        topic: r.class?.topic ?? r.class?.title ?? "Class",
        coachName: `${r.class?.coach.firstName ?? ""} ${
          r.class?.coach.lastName ?? ""
        }`.trim(),
        batchName: r.class?.batch?.name ?? null,
        durationSeconds: r.recordingDurationSeconds,
        sizeBytes: r.recordingBytes ? Number(r.recordingBytes) : null,
        createdAt: (r.recordingCompletedAt ?? r.createdAt).toISOString(),
        status: r.recordingStatus ?? "COMPLETED"
      })),
      pagination: paginationMeta(total, page, pageSize)
    };
  }

  // ── coaches / batches (reuse section rows, paginate in memory) ──

  async coachesTable(
    token: string | undefined,
    query: TableQuery
  ): Promise<AnalyticsCoachesTableResponse> {
    const { ctx } = await this.analytics.resolveContext(token, query);
    const { page, pageSize } = resolvePagination(query);
    const full = await this.coachesSection.coaches(ctx);
    const sorted = this.sortRows(full.leaderboard, query.sort, query.order);
    const start = (page - 1) * pageSize;
    return {
      rows: sorted.slice(start, start + pageSize),
      pagination: paginationMeta(sorted.length, page, pageSize)
    };
  }

  async batchesTable(
    token: string | undefined,
    query: TableQuery
  ): Promise<AnalyticsBatchesTableResponse> {
    const { ctx } = await this.analytics.resolveContext(token, query);
    const { page, pageSize } = resolvePagination(query);
    const full = await this.batchesSection.batches(ctx);
    const sorted = this.sortRows(full.batches, query.sort, query.order);
    const start = (page - 1) * pageSize;
    return {
      rows: sorted.slice(start, start + pageSize),
      pagination: paginationMeta(sorted.length, page, pageSize)
    };
  }

  private sortRows<T extends Record<string, unknown>>(
    rows: T[],
    sort: string | undefined,
    order: string | undefined
  ): T[] {
    if (!sort || !(sort in (rows[0] ?? {}))) return rows;
    const dir = order === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[sort];
      const bv = b[sort];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
    });
  }

  // ── CSV export ──

  async exportCsv(
    token: string | undefined,
    reportRaw: string,
    query: AnalyticsRangeQuery
  ): Promise<{ filename: string; csv: string }> {
    const parsed = analyticsExportReportSchema.safeParse(reportRaw);
    if (!parsed.success) {
      throw new BadRequestException(`Unknown analytics report "${reportRaw}".`);
    }
    const report: AnalyticsExportReport = parsed.data;
    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `analytics-${report}-${stamp}.csv`;

    const bigQuery = { ...query, page: 1, pageSize: 10000 } as TableQuery;

    switch (report) {
      case "users": {
        const { rows } = await this.usersTable(token, bigQuery);
        return {
          filename,
          csv: rowsToCsv(
            ["Name", "Email", "Role", "Status", "Acquisition", "Registered", "Last active", "Batches"],
            rows.map((r) => [
              r.name,
              r.email,
              r.role,
              r.status,
              r.acquisitionSource,
              r.createdAt,
              r.lastActiveAt ?? "",
              r.batchNames.join("; ")
            ])
          )
        };
      }
      case "classes": {
        const { rows } = await this.classesTable(token, bigQuery);
        return {
          filename,
          csv: rowsToCsv(
            ["Date", "Type", "Topic", "Coach", "Batch", "Students", "Duration (min)", "Status", "Recording", "Attendance %"],
            rows.map((r) => [
              r.date,
              r.type,
              r.topic,
              r.coachName,
              r.batchName ?? "",
              r.students,
              r.durationMinutes,
              r.status,
              r.hasRecording ? "yes" : "no",
              r.attendancePercent ?? ""
            ])
          )
        };
      }
      case "recordings": {
        const { rows } = await this.recordingsTable(token, bigQuery);
        return {
          filename,
          csv: rowsToCsv(
            ["Class", "Coach", "Batch", "Duration (s)", "Size (bytes)", "Created", "Status"],
            rows.map((r) => [
              r.topic,
              r.coachName,
              r.batchName ?? "",
              r.durationSeconds ?? "",
              r.sizeBytes ?? "",
              r.createdAt,
              r.status
            ])
          )
        };
      }
      case "coaches": {
        const { rows } = await this.coachesTable(token, bigQuery);
        return {
          filename,
          csv: rowsToCsv(
            ["Coach", "Email", "Active", "Classes", "Completed", "Cancelled", "Teaching hours", "Students", "Avg attendance %", "Avg duration (min)"],
            rows.map((r) => [
              r.name,
              r.email,
              r.isActive ? "yes" : "no",
              r.classesConducted,
              r.completedClasses,
              r.cancelledClasses,
              r.teachingHours,
              r.students,
              r.avgAttendancePercent ?? "",
              r.avgClassDurationMinutes ?? ""
            ])
          )
        };
      }
      case "batches": {
        const { rows } = await this.batchesTable(token, bigQuery);
        return {
          filename,
          csv: rowsToCsv(
            ["Batch", "Status", "Coaches", "Students", "Classes", "Completed", "Attendance %", "Teaching hours"],
            rows.map((r) => [
              r.name,
              r.status,
              r.coachNames.join("; "),
              r.students,
              r.classes,
              r.completedClasses,
              r.attendancePercent ?? "",
              r.teachingHours
            ])
          )
        };
      }
      case "attendance": {
        const attendance = await this.analytics.attendance(token, query);
        return {
          filename,
          csv: rowsToCsv(
            ["Group", "Name", "Detail", "Attendance %", "Attended", "Expected", "Classes"],
            [
              ...attendance.byBatch.map((r) => [
                "batch",
                r.label,
                r.sublabel ?? "",
                r.attendancePercent ?? "",
                r.attended,
                r.expected,
                r.classes
              ]),
              ...attendance.byCoach.map((r) => [
                "coach",
                r.label,
                r.sublabel ?? "",
                r.attendancePercent ?? "",
                r.attended,
                r.expected,
                r.classes
              ])
            ]
          )
        };
      }
      case "acquisition": {
        const acq = await this.analytics.acquisition(token, query);
        return {
          filename,
          csv: rowsToCsv(
            ["Source", "Users", "Percent", "Change %"],
            acq.sources.map((s) => [s.label, s.users, s.percent, s.deltaPct ?? ""])
          )
        };
      }
      case "storage": {
        const storage = await this.analytics.storage(token, query);
        return {
          filename,
          csv: rowsToCsv(
            ["Date", "Recording bytes"],
            storage.growth.points.map((p) => [p.date, p.value])
          )
        };
      }
      default:
        throw new BadRequestException(`Unknown analytics report "${reportRaw}".`);
    }
  }
}

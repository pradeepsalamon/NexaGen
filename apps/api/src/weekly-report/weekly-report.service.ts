import { ForbiddenException, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  addDays,
  mondayOf,
  renderWeeklyReportText,
  weeklyReportListQuerySchema,
  type WeeklyFacts,
  type WeeklyReportListResponse,
  type WeeklyReportPreviewResponse,
  type WeeklyReportView
} from "@nexa-chess/types";
import { Prisma, UserRole, UserStatus, type WeeklyReport } from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { CREATED_AT_DESC_ORDER, createdAtCursorWhere, toCursorPage } from "../common/cursor-pagination";
import { DEFAULT_TIME_ZONE, zonedYmd } from "../common/time";
import { parseOrBadRequest } from "../common/zod-body.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { assertCanViewStudent } from "../progress/student-access";
import { requireTenantId } from "../tenancy/tenant-sql";
import { loadWeeklyFacts } from "./weekly-report.facts";

const ymd = ({ day, month, year }: { year: number; month: number; day: number }) =>
  `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/** The academy's calendar today (YYYY-MM-DD). */
export function academyToday(timeZone: string, now: Date): string {
  return ymd(zonedYmd(timeZone, now));
}

/**
 * Weekly progress reports (docs/WEEKLY_REPORTS.md). Phase A: each finished
 * academy week becomes a frozen report in the student's own account (the job
 * builds it); staff of the student read the same list and a preview of the
 * week so far. Nothing is sent anywhere, and nothing reaches a parent contact.
 */
@Injectable()
export class WeeklyReportService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async listMine(accessToken: string | undefined, query: unknown): Promise<WeeklyReportListResponse> {
    const viewer = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (viewer.role !== UserRole.STUDENT) throw new ForbiddenException("Only students have their own weekly reports.");
    return this.list(viewer.id, query);
  }

  async listFor(accessToken: string | undefined, studentId: string, query: unknown): Promise<WeeklyReportListResponse> {
    const viewer = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (viewer.role === UserRole.STUDENT) throw new ForbiddenException("This view is for coaches and admins.");
    await assertCanViewStudent(this.prisma, viewer, studentId);
    return this.list(studentId, query);
  }

  /** Staff: the week so far, built now and not stored. */
  async preview(accessToken: string | undefined, studentId: string, now: Date = new Date()): Promise<WeeklyReportPreviewResponse> {
    const viewer = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (viewer.role === UserRole.STUDENT) throw new ForbiddenException("This view is for coaches and admins.");
    await assertCanViewStudent(this.prisma, viewer, studentId);
    const timeZone = await this.academyTimeZone();
    const weekStart = mondayOf(academyToday(timeZone, now));
    const { facts, text } = await this.compose(studentId, weekStart, timeZone, now);
    return { builtAt: now.toISOString(), facts, text, weekEnd: facts.weekEnd, weekStart };
  }

  /**
   * Freeze one finished week for one student. Idempotent: an existing report
   * for that week is left as it is. Returns whether a report was written.
   */
  async buildWeek(studentId: string, weekStart: string, timeZone: string, now: Date): Promise<boolean> {
    const tenantId = requireTenantId("weeklyReport");
    const day = new Date(`${weekStart}T00:00:00Z`);
    const existing = await this.prisma.weeklyReport.findFirst({ select: { id: true }, where: { studentId, weekStart: day } });
    if (existing) return false;
    const { facts, text } = await this.compose(studentId, weekStart, timeZone, now);
    try {
      await this.prisma.weeklyReport.create({
        data: {
          factsJson: facts as unknown as Prisma.InputJsonValue,
          finalText: text,
          studentId,
          templateText: text,
          tenantId,
          weekStart: day
        }
      });
      return true;
    } catch (error) {
      // Another run wrote it first.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
      throw error;
    }
  }

  /** Active students of a live batch with no report for `weekStart` yet (at most `limit`). */
  async studentsWithoutReport(weekStart: string, limit: number): Promise<string[]> {
    const rows = await this.prisma.user.findMany({
      orderBy: { id: "asc" },
      select: { id: true },
      take: limit,
      where: {
        studentBatches: { some: { batch: { isDeleted: false }, isDeleted: false } },
        role: UserRole.STUDENT,
        status: UserStatus.ACTIVE,
        weeklyReports: { none: { weekStart: new Date(`${weekStart}T00:00:00Z`) } }
      }
    });
    return rows.map((r) => r.id);
  }

  async academyTimeZone(): Promise<string> {
    const tenant = await this.prisma.tenant.findUnique({ select: { timezone: true }, where: { id: requireTenantId("tenant") } });
    return tenant?.timezone || DEFAULT_TIME_ZONE;
  }

  // ── internals ──

  private async compose(studentId: string, weekStart: string, timeZone: string, now: Date) {
    const [facts, student] = await Promise.all([
      loadWeeklyFacts(this.prisma, { now, studentId, timeZone, weekStart }),
      this.prisma.user.findUnique({ select: { firstName: true }, where: { id: studentId } })
    ]);
    return { facts, text: renderWeeklyReportText(facts, student?.firstName ?? "") };
  }

  private async list(studentId: string, rawQuery: unknown): Promise<WeeklyReportListResponse> {
    const { cursor, limit } = parseOrBadRequest(weeklyReportListQuerySchema, rawQuery ?? {}, "query");
    const rows = await this.prisma.weeklyReport.findMany({
      orderBy: [...CREATED_AT_DESC_ORDER],
      take: limit + 1,
      where: { AND: [{ studentId }, createdAtCursorWhere(cursor)] }
    });
    const page = toCursorPage(rows, limit);
    return { items: page.items.map(toView), nextCursor: page.nextCursor };
  }
}

function toView(row: WeeklyReport): WeeklyReportView {
  const weekStart = row.weekStart.toISOString().slice(0, 10);
  return {
    createdAt: row.createdAt.toISOString(),
    facts: row.factsJson as unknown as WeeklyFacts,
    id: row.id,
    status: row.status,
    text: row.finalText,
    weekEnd: addDays(weekStart, 6),
    weekStart
  };
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-chess/config/api";
import type {
  BatchScheduleDetail,
  BatchScheduleListResponse,
  BatchScheduleResponse,
  BatchScheduleSummary,
  CreateBatchScheduleRequest,
  PreviewBatchScheduleRequest,
  PreviewBatchScheduleResponse,
  ScheduleCalendarClass,
  ScheduleCalendarResponse,
  ScheduleConflict,
  ScheduleOccurrenceActionRequest,
  ScheduleOccurrencePreview,
  ScheduleWeeklySlot,
  UpdateBatchScheduleRequest
} from "@nexa-chess/types";
import {
  BatchScheduleStatus,
  ClassStatus,
  Prisma,
  UserRole,
  UserStatus
} from "@prisma/client";
import type { AccessTokenPayload } from "../auth/types";
import { PrismaService } from "../prisma/prisma.service";
import {
  generateOccurrences,
  instantsOverlap,
  RecurrenceValidationError,
  timeToMinutes,
  type Occurrence,
  type RecurrenceRuleInput
} from "./recurrence.util";

type AuthUser = { id: string; role: UserRole; status: UserStatus };

/** The client handed to a `prisma.$transaction(async (tx) => …)` callback. */
type PrismaTx = Parameters<Parameters<PrismaService["$transaction"]>[0]>[0];

const ACTIVE_CLASS_STATUSES: ClassStatus[] = [
  ClassStatus.SCHEDULED,
  ClassStatus.LIVE,
  ClassStatus.IN_PROGRESS
];

function localDateToUtc(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

function utcDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class BatchScheduleService {
  private readonly env = getApiEnv();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  // ── Auth ────────────────────────────────────────────────────────────────

  private async getAuthenticatedUser(accessToken: string | undefined): Promise<AuthUser> {
    if (!accessToken) {
      throw new UnauthorizedException("Access token is missing.");
    }
    const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(accessToken, {
      secret: this.env.JWT_ACCESS_SECRET
    });
    if (payload.type !== "access") {
      throw new UnauthorizedException("Invalid token type.");
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("Invalid session.");
    }
    return { id: user.id, role: user.role, status: user.status };
  }

  private assertCanManage(user: AuthUser) {
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("You cannot manage batch schedules.");
    }
  }

  // ── Preview ─────────────────────────────────────────────────────────────

  async preview(
    accessToken: string | undefined,
    body: PreviewBatchScheduleRequest
  ): Promise<PreviewBatchScheduleResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertCanManage(user);
    const { occurrences, conflicts, coachNames } = await this.computePlan(body);
    return this.toPreviewResponse(body, occurrences, conflicts, coachNames);
  }

  /**
   * Shared engine: validates inputs, expands occurrences and detects coach /
   * batch conflicts against existing classes. Used by preview and create.
   */
  private async computePlan(
    body: PreviewBatchScheduleRequest,
    opts: { excludeScheduleId?: string } = {}
  ): Promise<{
    occurrences: Occurrence[];
    conflicts: ScheduleConflict[];
    coachNames: Map<string, string>;
  }> {
    const batch = await this.prisma.batch.findFirst({
      where: { id: body.batchId, isDeleted: false }
    });
    if (!batch) {
      throw new NotFoundException("Batch not found.");
    }

    if (body.courseId) {
      const course = await this.prisma.course.findUnique({ where: { id: body.courseId } });
      if (!course) {
        throw new BadRequestException("Course not found.");
      }
    }

    const coachIds = [...new Set(body.rules.map((r) => r.coachId))];
    const coaches = await this.prisma.user.findMany({
      where: { id: { in: coachIds }, role: UserRole.COACH, status: UserStatus.ACTIVE }
    });
    if (coaches.length !== coachIds.length) {
      throw new BadRequestException("One or more selected coaches are invalid or inactive.");
    }
    const coachNames = new Map(
      coaches.map((c) => [c.id, `${c.firstName} ${c.lastName ?? ""}`.trim()])
    );

    const rules: RecurrenceRuleInput[] = body.rules.map((rule, index) => ({
      id: String(index),
      dayOfWeek: rule.dayOfWeek,
      startTime: rule.startTime,
      endTime: rule.endTime,
      coachId: rule.coachId,
      isEnabled: rule.isEnabled
    }));

    let occurrences: Occurrence[];
    try {
      occurrences = generateOccurrences({
        startDate: body.startDate,
        endDate: body.endDate,
        timezone: body.timezone,
        rules,
        exceptions: body.exceptions
      });
    } catch (error) {
      if (error instanceof RecurrenceValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const conflicts = await this.detectConflicts(
      body.batchId,
      occurrences,
      coachNames,
      opts.excludeScheduleId
    );

    return { occurrences, conflicts, coachNames };
  }

  private async detectConflicts(
    batchId: string,
    occurrences: Occurrence[],
    coachNames: Map<string, string>,
    excludeScheduleId?: string
  ): Promise<ScheduleConflict[]> {
    if (occurrences.length === 0) return [];

    const rangeStart = occurrences[0].startsAt;
    const rangeEnd = occurrences.reduce(
      (max, o) => (o.endsAt > max ? o.endsAt : max),
      occurrences[0].endsAt
    );
    const coachIds = [...new Set(occurrences.map((o) => o.coachId))];

    const existing = await this.prisma.coachClass.findMany({
      where: {
        status: { in: ACTIVE_CLASS_STATUSES },
        startsAt: { lt: rangeEnd },
        endsAt: { gt: rangeStart },
        ...(excludeScheduleId ? { scheduleId: { not: excludeScheduleId } } : {}),
        OR: [{ coachId: { in: coachIds } }, { batchId }]
      },
      select: {
        id: true,
        title: true,
        topic: true,
        coachId: true,
        batchId: true,
        startsAt: true,
        endsAt: true
      }
    });

    const conflicts: ScheduleConflict[] = [];
    for (const occ of occurrences) {
      for (const cls of existing) {
        if (!instantsOverlap(occ.startsAt, occ.endsAt, cls.startsAt, cls.endsAt)) {
          continue;
        }
        const title = cls.title || cls.topic || "Untitled class";
        if (cls.coachId === occ.coachId) {
          conflicts.push({
            type: "COACH",
            date: occ.date,
            startsAt: occ.startsAt.toISOString(),
            endsAt: occ.endsAt.toISOString(),
            coachId: occ.coachId,
            coachName: coachNames.get(occ.coachId) ?? "Coach",
            conflictingClassId: cls.id,
            conflictingClassTitle: title
          });
        } else if (cls.batchId === batchId) {
          conflicts.push({
            type: "BATCH",
            date: occ.date,
            startsAt: occ.startsAt.toISOString(),
            endsAt: occ.endsAt.toISOString(),
            coachId: occ.coachId,
            coachName: coachNames.get(occ.coachId) ?? "Coach",
            conflictingClassId: cls.id,
            conflictingClassTitle: title
          });
        }
      }
    }
    return conflicts;
  }

  private toPreviewResponse(
    body: PreviewBatchScheduleRequest,
    occurrences: Occurrence[],
    conflicts: ScheduleConflict[],
    coachNames: Map<string, string>
  ): PreviewBatchScheduleResponse {
    const now = Date.now();
    const conflictKeys = new Set(
      conflicts.map((c) => `${c.date}|${c.startsAt}|${c.coachId}`)
    );

    const previews: ScheduleOccurrencePreview[] = occurrences.map((o) => ({
      ruleId: o.ruleId,
      date: o.date,
      dayOfWeek: o.dayOfWeek,
      startsAt: o.startsAt.toISOString(),
      endsAt: o.endsAt.toISOString(),
      coachId: o.coachId,
      coachName: coachNames.get(o.coachId) ?? "Coach",
      isPast: o.startsAt.getTime() <= now,
      hasConflict: conflictKeys.has(
        `${o.date}|${o.startsAt.toISOString()}|${o.coachId}`
      )
    }));

    const futureCount = previews.filter((p) => !p.isPast).length;

    const weeklySummary: ScheduleWeeklySlot[] = [...body.rules]
      .filter((r) => r.isEnabled !== false)
      .map((r) => ({
        dayOfWeek: r.dayOfWeek,
        startTime: r.startTime,
        endTime: r.endTime,
        coachId: r.coachId,
        coachName: coachNames.get(r.coachId) ?? "Coach"
      }))
      .sort(
        (a, b) =>
          a.dayOfWeek - b.dayOfWeek ||
          timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
      );

    return {
      timezone: body.timezone,
      totalCount: previews.length,
      futureCount,
      pastCount: previews.length - futureCount,
      firstClassAt: previews[0]?.startsAt ?? null,
      lastClassAt: previews[previews.length - 1]?.startsAt ?? null,
      weeklySummary,
      occurrences: previews,
      conflicts
    };
  }

  // ── Create + generate ───────────────────────────────────────────────────

  async create(
    accessToken: string | undefined,
    body: CreateBatchScheduleRequest
  ): Promise<BatchScheduleResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertCanManage(user);

    const { occurrences, conflicts } = await this.computePlan(body);

    if (conflicts.length > 0 && !body.force) {
      throw new ConflictException({
        message: `${conflicts.length} scheduling conflict(s) detected. Resolve them or confirm to continue.`,
        conflicts
      });
    }

    const now = Date.now();
    const futureOccurrences = occurrences.filter(
      (o) => o.startsAt.getTime() > now
    );

    const scheduleId = await this.prisma.$transaction(async (tx) => {
      const schedule = await tx.batchClassSchedule.create({
        data: {
          batchId: body.batchId,
          courseId: body.courseId ?? null,
          title: body.title?.trim() || "Weekly classes",
          timezone: body.timezone,
          startDate: localDateToUtc(body.startDate),
          endDate: localDateToUtc(body.endDate),
          createdById: user.id,
          exceptions: {
            create: (body.exceptions ?? []).map((date) => ({
              date: localDateToUtc(date)
            }))
          }
        }
      });

      // Create rules one-by-one so the preview's synthetic index maps cleanly
      // to the persisted rule id (nested createMany returns no ids).
      const ruleIdByIndex = new Map<string, string>();
      for (let index = 0; index < body.rules.length; index += 1) {
        const rule = body.rules[index];
        const created = await tx.batchClassScheduleRule.create({
          data: {
            scheduleId: schedule.id,
            dayOfWeek: rule.dayOfWeek,
            startTime: rule.startTime,
            endTime: rule.endTime,
            coachId: rule.coachId,
            isEnabled: rule.isEnabled ?? true
          }
        });
        ruleIdByIndex.set(String(index), created.id);
      }

      if (futureOccurrences.length > 0) {
        await tx.coachClass.createMany({
          data: futureOccurrences.map((occ, index) => ({
            batchId: body.batchId,
            coachId: occ.coachId,
            scheduleId: schedule.id,
            scheduleRuleId: ruleIdByIndex.get(occ.ruleId) ?? null,
            occurrenceDate: localDateToUtc(occ.date),
            sessionNumber: index + 1,
            title: `${schedule.title} — Class ${index + 1}`,
            status: ClassStatus.SCHEDULED,
            startsAt: occ.startsAt,
            endsAt: occ.endsAt
          }))
        });
      }

      return schedule.id;
    });

    const detail = await this.loadDetail(scheduleId);
    return { schedule: detail, generatedCount: futureOccurrences.length };
  }

  // ── Read ────────────────────────────────────────────────────────────────

  async list(
    accessToken: string | undefined,
    batchId?: string
  ): Promise<BatchScheduleListResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertCanManage(user);

    const schedules = await this.prisma.batchClassSchedule.findMany({
      where: { ...(batchId ? { batchId } : {}), batch: { isDeleted: false } },
      include: {
        batch: { select: { name: true } },
        course: { select: { title: true } },
        _count: { select: { rules: true } }
      },
      orderBy: { createdAt: "desc" }
    });

    const summaries = await Promise.all(
      schedules.map((s) => this.toSummary(s))
    );
    return { schedules: summaries };
  }

  async get(
    accessToken: string | undefined,
    id: string
  ): Promise<BatchScheduleResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertCanManage(user);
    return { schedule: await this.loadDetail(id) };
  }

  private async loadDetail(id: string): Promise<BatchScheduleDetail> {
    const schedule = await this.prisma.batchClassSchedule.findUnique({
      where: { id },
      include: {
        batch: { select: { name: true } },
        course: { select: { title: true } },
        rules: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] },
        exceptions: { orderBy: { date: "asc" } },
        _count: { select: { rules: true } }
      }
    });
    if (!schedule) {
      throw new NotFoundException("Schedule not found.");
    }

    const coachIds = [...new Set(schedule.rules.map((r) => r.coachId))];
    const coaches = await this.prisma.user.findMany({
      where: { id: { in: coachIds } },
      select: { id: true, firstName: true, lastName: true }
    });
    const coachNames = new Map(
      coaches.map((c) => [c.id, `${c.firstName} ${c.lastName ?? ""}`.trim()])
    );

    const summary = await this.toSummary(schedule);
    return {
      ...summary,
      rules: schedule.rules.map((r) => ({
        id: r.id,
        dayOfWeek: r.dayOfWeek,
        startTime: r.startTime,
        endTime: r.endTime,
        coachId: r.coachId,
        coachName: coachNames.get(r.coachId) ?? "Coach",
        isEnabled: r.isEnabled
      })),
      exceptions: schedule.exceptions.map((e) => ({
        id: e.id,
        date: utcDateOnly(e.date),
        reason: e.reason
      }))
    };
  }

  private async toSummary(schedule: {
    id: string;
    batchId: string;
    title: string;
    timezone: string;
    startDate: Date;
    endDate: Date;
    status: BatchScheduleStatus;
    courseId: string | null;
    createdAt: Date;
    batch?: { name: string } | null;
    course?: { title: string } | null;
    _count?: { rules: number };
  }): Promise<BatchScheduleSummary> {
    const grouped = await this.prisma.coachClass.groupBy({
      by: ["status"],
      where: { scheduleId: schedule.id },
      _count: { _all: true }
    });
    const countByStatus = new Map(
      grouped.map((g) => [g.status, g._count._all])
    );
    const total = grouped.reduce((sum, g) => sum + g._count._all, 0);

    return {
      id: schedule.id,
      batchId: schedule.batchId,
      batchName: schedule.batch?.name ?? "Unknown",
      courseId: schedule.courseId,
      courseTitle: schedule.course?.title ?? null,
      title: schedule.title,
      timezone: schedule.timezone,
      startDate: utcDateOnly(schedule.startDate),
      endDate: utcDateOnly(schedule.endDate),
      status: schedule.status as BatchScheduleSummary["status"],
      ruleCount: schedule._count?.rules ?? 0,
      totalClasses: total,
      upcomingClasses:
        (countByStatus.get(ClassStatus.SCHEDULED) ?? 0) +
        (countByStatus.get(ClassStatus.LIVE) ?? 0),
      completedClasses: countByStatus.get(ClassStatus.COMPLETED) ?? 0,
      cancelledClasses: countByStatus.get(ClassStatus.CANCELLED) ?? 0,
      createdAt: schedule.createdAt.toISOString()
    };
  }

  // ── Update / regenerate ─────────────────────────────────────────────────

  async update(
    accessToken: string | undefined,
    id: string,
    body: UpdateBatchScheduleRequest
  ): Promise<BatchScheduleResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertCanManage(user);

    const schedule = await this.prisma.batchClassSchedule.findUnique({
      where: { id },
      include: { rules: true }
    });
    if (!schedule) {
      throw new NotFoundException("Schedule not found.");
    }

    const nextEndDate = body.endDate
      ? localDateToUtc(body.endDate)
      : schedule.endDate;

    let generatedCount = 0;
    let cancelledCount = 0;

    await this.prisma.$transaction(async (tx) => {
      await tx.batchClassSchedule.update({
        where: { id },
        data: {
          title: body.title?.trim() ?? undefined,
          courseId:
            body.courseId === undefined ? undefined : body.courseId ?? null,
          endDate: body.endDate ? nextEndDate : undefined,
          status: (body.status as BatchScheduleStatus | undefined) ?? undefined
        }
      });

      if (body.exceptions) {
        await tx.batchScheduleException.deleteMany({ where: { scheduleId: id } });
        if (body.exceptions.length > 0) {
          await tx.batchScheduleException.createMany({
            data: body.exceptions.map((date) => ({
              scheduleId: id,
              date: localDateToUtc(date)
            }))
          });
        }
      }

      if (body.rules) {
        await tx.batchClassScheduleRule.deleteMany({ where: { scheduleId: id } });
        await tx.batchClassScheduleRule.createMany({
          data: body.rules.map((rule) => ({
            scheduleId: id,
            dayOfWeek: rule.dayOfWeek,
            startTime: rule.startTime,
            endTime: rule.endTime,
            coachId: rule.coachId,
            isEnabled: rule.isEnabled ?? true
          }))
        });
      }

      if (body.regenerate) {
        // Wipe only future, not-yet-started generated sessions. Past / LIVE /
        // COMPLETED / CANCELLED classes are immutable history.
        const wiped = await tx.coachClass.deleteMany({
          where: {
            scheduleId: id,
            status: ClassStatus.SCHEDULED,
            startsAt: { gt: new Date() }
          }
        });
        cancelledCount = wiped.count;

        generatedCount = await this.regenerateWithin(tx, id);
      } else if (body.endDate && nextEndDate > schedule.endDate) {
        generatedCount = await this.regenerateWithin(tx, id);
      }
    });

    const detail = await this.loadDetail(id);
    return { schedule: detail, generatedCount, cancelledCount };
  }

  async regenerate(
    accessToken: string | undefined,
    id: string
  ): Promise<BatchScheduleResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertCanManage(user);

    const schedule = await this.prisma.batchClassSchedule.findUnique({ where: { id } });
    if (!schedule) {
      throw new NotFoundException("Schedule not found.");
    }

    const generatedCount = await this.prisma.$transaction((tx) =>
      this.regenerateWithin(tx, id)
    );

    const detail = await this.loadDetail(id);
    return { schedule: detail, generatedCount };
  }

  /**
   * Idempotent top-up: creates any future occurrence that doesn't already have
   * a `CoachClass` row. Existing rows (and their session numbers) are left
   * untouched, so numbering stays stable.
   */
  private async regenerateWithin(
    tx: PrismaTx,
    scheduleId: string
  ): Promise<number> {
    const schedule = await tx.batchClassSchedule.findUniqueOrThrow({
      where: { id: scheduleId },
      include: { rules: true, exceptions: true }
    });

    if (schedule.status === BatchScheduleStatus.ENDED) {
      return 0;
    }

    const rules: RecurrenceRuleInput[] = schedule.rules.map((r) => ({
      id: r.id,
      dayOfWeek: r.dayOfWeek,
      startTime: r.startTime,
      endTime: r.endTime,
      coachId: r.coachId,
      isEnabled: r.isEnabled
    }));

    let occurrences: Occurrence[];
    try {
      occurrences = generateOccurrences({
        startDate: utcDateOnly(schedule.startDate),
        endDate: utcDateOnly(schedule.endDate),
        timezone: schedule.timezone,
        rules,
        exceptions: schedule.exceptions.map((e) => utcDateOnly(e.date))
      });
    } catch (error) {
      if (error instanceof RecurrenceValidationError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const now = Date.now();
    const future = occurrences.filter((o) => o.startsAt.getTime() > now);

    const existing = await tx.coachClass.findMany({
      where: { scheduleId },
      select: {
        occurrenceDate: true,
        scheduleRuleId: true,
        sessionNumber: true
      }
    });
    const existingKeys = new Set(
      existing.map(
        (e) =>
          `${e.occurrenceDate ? utcDateOnly(e.occurrenceDate) : ""}|${e.scheduleRuleId ?? ""}`
      )
    );
    let maxSession = existing.reduce(
      (max, e) => Math.max(max, e.sessionNumber ?? 0),
      0
    );

    let created = 0;
    for (const occ of future) {
      const key = `${occ.date}|${occ.ruleId}`;
      if (existingKeys.has(key)) continue;
      maxSession += 1;
      await tx.coachClass.create({
        data: {
          batchId: schedule.batchId,
          coachId: occ.coachId,
          scheduleId,
          scheduleRuleId: occ.ruleId,
          occurrenceDate: localDateToUtc(occ.date),
          sessionNumber: maxSession,
          title: `${schedule.title} — Class ${maxSession}`,
          status: ClassStatus.SCHEDULED,
          startsAt: occ.startsAt,
          endsAt: occ.endsAt
        }
      });
      existingKeys.add(key);
      created += 1;
    }
    return created;
  }

  // ── Deactivate ──────────────────────────────────────────────────────────

  async deactivate(
    accessToken: string | undefined,
    id: string
  ): Promise<BatchScheduleResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertCanManage(user);

    const schedule = await this.prisma.batchClassSchedule.findUnique({ where: { id } });
    if (!schedule) {
      throw new NotFoundException("Schedule not found.");
    }

    const cancelledCount = await this.prisma.$transaction(async (tx) => {
      await tx.batchClassSchedule.update({
        where: { id },
        data: { status: BatchScheduleStatus.ENDED }
      });
      const cancelled = await tx.coachClass.updateMany({
        where: {
          scheduleId: id,
          status: ClassStatus.SCHEDULED,
          startsAt: { gt: new Date() }
        },
        data: { status: ClassStatus.CANCELLED, cancelledAt: new Date() }
      });
      return cancelled.count;
    });

    const detail = await this.loadDetail(id);
    return { schedule: detail, cancelledCount };
  }

  // ── Single occurrence ───────────────────────────────────────────────────

  async occurrenceAction(
    accessToken: string | undefined,
    classId: string,
    body: ScheduleOccurrenceActionRequest
  ): Promise<{ class: ScheduleCalendarClass }> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertCanManage(user);

    const cls = await this.prisma.coachClass.findUnique({
      where: { id: classId }
    });
    if (!cls || !cls.scheduleId) {
      throw new NotFoundException("Scheduled class not found.");
    }

    if (body.action === "CANCEL") {
      if (
        cls.status === ClassStatus.COMPLETED ||
        cls.status === ClassStatus.LIVE ||
        cls.status === ClassStatus.IN_PROGRESS
      ) {
        throw new ConflictException(
          `Cannot cancel a class that is ${cls.status.toLowerCase()}.`
        );
      }
      await this.prisma.coachClass.update({
        where: { id: classId },
        data: { status: ClassStatus.CANCELLED, cancelledAt: new Date() }
      });
    } else if (body.action === "RESTORE") {
      if (cls.status !== ClassStatus.CANCELLED) {
        throw new ConflictException("Only a cancelled class can be restored.");
      }
      await this.assertNoConflict(cls.coachId, cls.batchId, cls.startsAt, cls.endsAt, classId);
      await this.prisma.coachClass.update({
        where: { id: classId },
        data: { status: ClassStatus.SCHEDULED, cancelledAt: null }
      });
    } else {
      // RESCHEDULE
      if (cls.status !== ClassStatus.SCHEDULED) {
        throw new ConflictException(
          `Cannot reschedule a class that is ${cls.status.toLowerCase()}.`
        );
      }
      const startsAt = new Date(body.startsAt!);
      const endsAt = new Date(body.endsAt!);
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
        throw new BadRequestException("Invalid start or end time.");
      }
      if (endsAt <= startsAt) {
        throw new BadRequestException("End time must be after start time.");
      }
      if (startsAt.getTime() < Date.now()) {
        throw new BadRequestException("New start time must be in the future.");
      }

      let coachId = cls.coachId;
      if (body.coachId && body.coachId !== cls.coachId) {
        const coach = await this.prisma.user.findFirst({
          where: {
            id: body.coachId,
            role: UserRole.COACH,
            status: UserStatus.ACTIVE
          }
        });
        if (!coach) {
          throw new BadRequestException("Selected coach is invalid or inactive.");
        }
        coachId = body.coachId;
      }

      await this.assertNoConflict(coachId, cls.batchId, startsAt, endsAt, classId);

      await this.prisma.coachClass.update({
        where: { id: classId },
        data: { coachId, startsAt, endsAt }
      });
    }

    const updated = await this.prisma.coachClass.findUniqueOrThrow({
      where: { id: classId },
      include: {
        batch: { select: { name: true } },
        coach: { select: { firstName: true, lastName: true } },
        liveSession: { select: { recordingUrl: true } }
      }
    });
    return { class: this.toCalendarClass(updated) };
  }

  private async assertNoConflict(
    coachId: string,
    batchId: string | null,
    startsAt: Date,
    endsAt: Date,
    excludeClassId: string
  ) {
    const conflict = await this.prisma.coachClass.findFirst({
      where: {
        id: { not: excludeClassId },
        status: { in: ACTIVE_CLASS_STATUSES },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
        OR: [{ coachId }, ...(batchId ? [{ batchId }] : [])]
      },
      select: { title: true, topic: true, startsAt: true }
    });
    if (conflict) {
      throw new ConflictException(
        `Overlaps "${conflict.title || conflict.topic || "another class"}" on ${conflict.startsAt.toISOString()}.`
      );
    }
  }

  // ── Calendar ────────────────────────────────────────────────────────────

  async calendar(
    accessToken: string | undefined,
    query: { from?: string; to?: string; batchId?: string }
  ): Promise<ScheduleCalendarResponse> {
    const user = await this.getAuthenticatedUser(accessToken);

    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException("`from` and `to` query params are required.");
    }
    if (to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException("Calendar range cannot exceed one year.");
    }

    const where: Prisma.CoachClassWhereInput = {
      startsAt: { lt: to },
      endsAt: { gt: from },
      isDemo: false,
      ...this.calendarVisibilityWhere(user)
    };
    if (query.batchId) {
      where.batchId = query.batchId;
    }

    const classes = await this.prisma.coachClass.findMany({
      where,
      include: {
        batch: { select: { name: true } },
        coach: { select: { firstName: true, lastName: true } },
        liveSession: { select: { recordingUrl: true } }
      },
      orderBy: { startsAt: "asc" },
      take: 2000
    });

    return { classes: classes.map((c) => this.toCalendarClass(c)) };
  }

  private calendarVisibilityWhere(user: AuthUser): Prisma.CoachClassWhereInput {
    if (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) {
      return {};
    }
    if (user.role === UserRole.COACH) {
      return { coachId: user.id };
    }
    return {
      batch: {
        isDeleted: false,
        students: { some: { studentId: user.id, isDeleted: false } }
      }
    };
  }

  private toCalendarClass(cls: {
    id: string;
    batchId: string | null;
    title: string | null;
    topic: string | null;
    coachId: string;
    status: ClassStatus;
    startsAt: Date;
    endsAt: Date;
    scheduleId: string | null;
    sessionNumber: number | null;
    batch?: { name: string } | null;
    coach?: { firstName: string; lastName: string | null } | null;
    liveSession?: { recordingUrl: string | null } | null;
  }): ScheduleCalendarClass {
    return {
      id: cls.id,
      batchId: cls.batchId ?? "",
      batchName: cls.batch?.name ?? "—",
      title: cls.title || cls.topic || "Class",
      coachId: cls.coachId,
      coachName: cls.coach
        ? `${cls.coach.firstName} ${cls.coach.lastName ?? ""}`.trim()
        : "Coach",
      startsAt: cls.startsAt.toISOString(),
      endsAt: cls.endsAt.toISOString(),
      status: cls.status as ScheduleCalendarClass["status"],
      scheduleId: cls.scheduleId,
      sessionNumber: cls.sessionNumber,
      hasRecording: Boolean(cls.liveSession?.recordingUrl)
    };
  }
}

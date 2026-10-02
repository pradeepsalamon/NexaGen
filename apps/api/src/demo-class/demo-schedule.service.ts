import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Cron, CronExpression } from "@nestjs/schedule";
import { getApiEnv } from "@nexa-chess/config/api";
import {
  DEMO_SCHEDULE_HORIZON_DAYS,
  demoScheduleSlotSchema,
  type CreateDemoScheduleRequest,
  type DemoScheduleDto,
  type DemoScheduleSlot,
  type UpdateDemoScheduleRequest
} from "@nexa-chess/types";
import {
  ClassStatus,
  Prisma,
  UserRole,
  UserStatus,
  type DemoSchedule,
  type User
} from "@prisma/client";
import { z } from "zod";
import type { AccessTokenPayload } from "../auth/types";
import { toLocalDateParts, zonedWallTimeToUtc } from "../batch-schedule/recurrence.util";
import { assertNoSchedulingConflict } from "../coach/class-scheduling.util";
import { PrismaService } from "../prisma/prisma.service";

const DAY_MS = 24 * 60 * 60 * 1000;
const slotsSchema = z.array(demoScheduleSlotSchema);

type ScheduleWithCoach = DemoSchedule & { coach: Pick<User, "firstName" | "lastName"> };

/** Today's calendar date ("YYYY-MM-DD") in `timeZone`. */
function localToday(timeZone: string, now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

/**
 * Every future occurrence of `slots` over the next `horizonDays` local days.
 * Pure, so the generator and the "does this occurrence still match?" check
 * after an edit agree exactly.
 */
export function expandDemoSlots(input: {
  slots: DemoScheduleSlot[];
  timezone: string;
  durationMinutes: number;
  now: Date;
  horizonDays?: number;
}): Array<{ startsAt: Date; endsAt: Date }> {
  const horizon = input.horizonDays ?? DEMO_SCHEDULE_HORIZON_DAYS;
  const start = toLocalDateParts(localToday(input.timezone, input.now));
  const startCursor = Date.UTC(start.year, start.month - 1, start.day);
  const out: Array<{ startsAt: Date; endsAt: Date }> = [];

  for (let i = 0; i <= horizon; i += 1) {
    const day = new Date(startCursor + i * DAY_MS);
    const dow = day.getUTCDay();
    for (const slot of input.slots) {
      if (slot.dayOfWeek !== dow) continue;
      const [hour, minute] = slot.startTime.split(":").map(Number);
      const startsAt = zonedWallTimeToUtc(
        day.getUTCFullYear(),
        day.getUTCMonth() + 1,
        day.getUTCDate(),
        hour,
        minute,
        input.timezone
      );
      if (startsAt.getTime() <= input.now.getTime()) continue;
      out.push({ startsAt, endsAt: new Date(startsAt.getTime() + input.durationMinutes * 60_000) });
    }
  }

  const unique = new Map(out.map((o) => [o.startsAt.getTime(), o]));
  return [...unique.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Static demo slots: one permanent `/demo/<slug>` link backed by demo
 * `CoachClass` occurrences generated `DEMO_SCHEDULE_HORIZON_DAYS` ahead (on
 * save and hourly). An occurrence someone is booked into is never moved or
 * deleted by an edit — only unbooked future ones are re-generated.
 */
@Injectable()
export class DemoScheduleService {
  static readonly GENERATE_LOCK_ID = 73002080;

  private readonly env = getApiEnv();
  private readonly logger = new Logger(DemoScheduleService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async list(accessToken: string | undefined) {
    await this.getSuperAdmin(accessToken);
    const schedules = await this.prisma.demoSchedule.findMany({
      include: { coach: { select: { firstName: true, lastName: true } } },
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }]
    });
    const next = await this.nextSessions(schedules.map((s) => s.id));
    return { schedules: schedules.map((s) => this.toDto(s, next.get(s.id) ?? null)) };
  }

  async create(accessToken: string | undefined, body: CreateDemoScheduleRequest) {
    const user = await this.getSuperAdmin(accessToken);
    const timezone = body.timezone ?? "Asia/Kolkata";
    this.assertTimeZone(timezone);
    await this.assertCoach(body.coachId);

    let schedule: DemoSchedule;
    try {
      schedule = await this.prisma.demoSchedule.create({
        data: {
          slug: body.slug,
          topic: body.topic,
          description: body.description || null,
          coachId: body.coachId,
          timezone,
          slots: body.slots,
          durationMinutes: body.durationMinutes ?? 60,
          accessMode: body.accessMode ?? "PUBLIC",
          passcode: body.accessMode === "PASSCODE" ? body.passcode ?? null : null,
          isActive: body.isActive ?? true,
          createdById: user.id
        }
      });
    } catch (error) {
      throw this.mapSlugConflict(error);
    }

    if (schedule.isActive) await this.ensureOccurrences(schedule.id);
    return { schedule: await this.getDto(schedule.id) };
  }

  async update(accessToken: string | undefined, id: string, body: UpdateDemoScheduleRequest) {
    await this.getSuperAdmin(accessToken);
    const existing = await this.prisma.demoSchedule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Demo schedule not found.");
    if (body.timezone) this.assertTimeZone(body.timezone);
    if (body.coachId) await this.assertCoach(body.coachId);

    const accessMode = body.accessMode ?? existing.accessMode;
    const passcode = accessMode === "PASSCODE" ? body.passcode ?? existing.passcode : null;
    if (accessMode === "PASSCODE" && !passcode) {
      throw new ConflictException("A passcode is required for this access mode.");
    }

    try {
      await this.prisma.demoSchedule.update({
        where: { id },
        data: {
          slug: body.slug,
          topic: body.topic,
          description: body.description === undefined ? undefined : body.description || null,
          coachId: body.coachId,
          timezone: body.timezone,
          slots: body.slots,
          durationMinutes: body.durationMinutes,
          accessMode,
          passcode,
          isActive: body.isActive
        }
      });
    } catch (error) {
      throw this.mapSlugConflict(error);
    }

    await this.reconcileFutureOccurrences(id);
    return { schedule: await this.getDto(id) };
  }

  async remove(accessToken: string | undefined, id: string) {
    await this.getSuperAdmin(accessToken);
    const existing = await this.prisma.demoSchedule.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Demo schedule not found.");

    await this.prisma.demoSchedule.update({ where: { id }, data: { isActive: false } });
    await this.reconcileFutureOccurrences(id);
    // Booked or past occurrences survive as ordinary one-off demo classes.
    await this.prisma.demoSchedule.delete({ where: { id } });
    return { ok: true };
  }

  @Cron(CronExpression.EVERY_HOUR)
  async topUpOccurrences() {
    try {
      const [lock] = await this.prisma.$queryRaw<[{ locked: boolean }]>`
        SELECT pg_try_advisory_lock(${DemoScheduleService.GENERATE_LOCK_ID}) AS locked
      `;
      if (!lock?.locked) return;
      try {
        const active = await this.prisma.demoSchedule.findMany({
          where: { isActive: true },
          select: { id: true }
        });
        for (const { id } of active) {
          await this.ensureOccurrences(id).catch((error) =>
            this.logger.error(`Demo schedule ${id} generation failed`, error as Error)
          );
        }
      } finally {
        await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${DemoScheduleService.GENERATE_LOCK_ID})`;
      }
    } catch (error) {
      this.logger.error("Error in demo schedule top-up cron", error as Error);
    }
  }

  /**
   * Creates any missing occurrence within the horizon. Idempotent on the
   * unique `(demoScheduleId, startsAt)`; an occurrence the admin cancelled
   * keeps its row, so it is never re-created. A slot that collides with the
   * coach's other classes is skipped (and logged), not double-booked.
   */
  async ensureOccurrences(scheduleId: string, now = new Date()): Promise<number> {
    const schedule = await this.prisma.demoSchedule.findUnique({ where: { id: scheduleId } });
    if (!schedule?.isActive) return 0;

    const wanted = expandDemoSlots({
      slots: slotsSchema.parse(schedule.slots),
      timezone: schedule.timezone,
      durationMinutes: schedule.durationMinutes,
      now
    });
    if (wanted.length === 0) return 0;

    const existing = await this.prisma.coachClass.findMany({
      where: { demoScheduleId: scheduleId, startsAt: { gte: wanted[0].startsAt } },
      select: { startsAt: true }
    });
    const have = new Set(existing.map((c) => c.startsAt.getTime()));

    let created = 0;
    for (const occurrence of wanted) {
      if (have.has(occurrence.startsAt.getTime())) continue;
      try {
        await assertNoSchedulingConflict(this.prisma, {
          coachId: schedule.coachId,
          startsAt: occurrence.startsAt,
          endsAt: occurrence.endsAt
        });
      } catch {
        this.logger.warn(
          `Demo schedule ${schedule.slug}: coach busy at ${occurrence.startsAt.toISOString()}, slot skipped`
        );
        continue;
      }
      try {
        await this.prisma.coachClass.create({
          data: {
            coachId: schedule.coachId,
            topic: schedule.topic,
            description: schedule.description,
            startsAt: occurrence.startsAt,
            endsAt: occurrence.endsAt,
            isDemo: true,
            status: ClassStatus.SCHEDULED,
            demoAccessMode: schedule.accessMode,
            demoPasscode: schedule.passcode,
            demoScheduleId: schedule.id
          }
        });
        created += 1;
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
          throw error;
        }
      }
    }
    return created;
  }

  /**
   * After an edit: future SCHEDULED occurrences that no longer match the slots
   * (or the whole schedule, once inactive) are deleted unless someone is booked
   * into them; the rest pick up the new topic/access settings, and the coach
   * where that coach is free. Then the horizon is topped up.
   */
  private async reconcileFutureOccurrences(scheduleId: string, now = new Date()) {
    const schedule = await this.prisma.demoSchedule.findUniqueOrThrow({ where: { id: scheduleId } });
    const wanted = schedule.isActive
      ? expandDemoSlots({
          slots: slotsSchema.parse(schedule.slots),
          timezone: schedule.timezone,
          durationMinutes: schedule.durationMinutes,
          now
        })
      : [];
    const wantedKeys = new Set(wanted.map((w) => `${w.startsAt.getTime()}-${w.endsAt.getTime()}`));

    const future = await this.prisma.coachClass.findMany({
      where: { demoScheduleId: scheduleId, status: ClassStatus.SCHEDULED, startsAt: { gt: now } },
      include: { _count: { select: { demoRegistrations: true } } }
    });

    for (const occurrence of future) {
      const matches = wantedKeys.has(`${occurrence.startsAt.getTime()}-${occurrence.endsAt.getTime()}`);
      if (!matches && occurrence._count.demoRegistrations === 0) {
        await this.prisma.coachClass.delete({ where: { id: occurrence.id } });
        continue;
      }

      let coachId = occurrence.coachId;
      if (coachId !== schedule.coachId) {
        try {
          await assertNoSchedulingConflict(this.prisma, {
            coachId: schedule.coachId,
            startsAt: occurrence.startsAt,
            endsAt: occurrence.endsAt,
            excludeClassId: occurrence.id
          });
          coachId = schedule.coachId;
        } catch {
          this.logger.warn(`Demo occurrence ${occurrence.id} kept its coach: new coach is busy`);
        }
      }
      await this.prisma.coachClass.update({
        where: { id: occurrence.id },
        data: {
          coachId,
          topic: schedule.topic,
          description: schedule.description,
          demoAccessMode: schedule.accessMode,
          demoPasscode: schedule.passcode
        }
      });
    }

    if (schedule.isActive) await this.ensureOccurrences(scheduleId, now);
  }

  private async nextSessions(scheduleIds: string[]) {
    const map = new Map<string, DemoScheduleDto["nextSession"]>();
    if (scheduleIds.length === 0) return map;
    const sessions = await this.prisma.coachClass.findMany({
      where: {
        demoScheduleId: { in: scheduleIds },
        status: { in: [ClassStatus.SCHEDULED, ClassStatus.LIVE] },
        endsAt: { gt: new Date() }
      },
      orderBy: { startsAt: "asc" },
      select: { id: true, demoScheduleId: true, startsAt: true, status: true }
    });
    for (const s of sessions) {
      if (!s.demoScheduleId) continue;
      const current = map.get(s.demoScheduleId);
      // A LIVE occurrence wins over an earlier-starting scheduled one.
      if (!current || (s.status === ClassStatus.LIVE && current.status !== "LIVE")) {
        map.set(s.demoScheduleId, {
          classId: s.id,
          startsAt: s.startsAt.toISOString(),
          status: s.status === ClassStatus.LIVE ? "LIVE" : "SCHEDULED"
        });
      }
    }
    return map;
  }

  private async getDto(id: string): Promise<DemoScheduleDto> {
    const schedule = await this.prisma.demoSchedule.findUniqueOrThrow({
      where: { id },
      include: { coach: { select: { firstName: true, lastName: true } } }
    });
    const next = await this.nextSessions([id]);
    return this.toDto(schedule, next.get(id) ?? null);
  }

  private toDto(schedule: ScheduleWithCoach, nextSession: DemoScheduleDto["nextSession"]): DemoScheduleDto {
    return {
      id: schedule.id,
      slug: schedule.slug,
      topic: schedule.topic,
      description: schedule.description,
      coachId: schedule.coachId,
      coachName: `${schedule.coach.firstName} ${schedule.coach.lastName || ""}`.trim(),
      timezone: schedule.timezone,
      slots: slotsSchema.catch([]).parse(schedule.slots),
      durationMinutes: schedule.durationMinutes,
      accessMode: schedule.accessMode,
      passcode: schedule.passcode,
      isActive: schedule.isActive,
      nextSession,
      createdAt: schedule.createdAt.toISOString()
    };
  }

  private assertTimeZone(timeZone: string) {
    if (!isValidTimeZone(timeZone)) {
      throw new ConflictException(`Unknown timezone "${timeZone}".`);
    }
  }

  private async assertCoach(coachId: string) {
    const coach = await this.prisma.user.findUnique({ where: { id: coachId } });
    if (!coach || coach.role !== UserRole.COACH || coach.status !== UserStatus.ACTIVE) {
      throw new NotFoundException("Coach not found");
    }
  }

  private mapSlugConflict(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return new ConflictException("That link name is already used by another demo schedule.");
    }
    return error;
  }

  private async getSuperAdmin(accessToken: string | undefined) {
    if (!accessToken) {
      throw new UnauthorizedException("Access token is missing.");
    }
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(accessToken, {
        secret: this.env.JWT_ACCESS_SECRET
      });
    } catch {
      throw new UnauthorizedException("Invalid session.");
    }
    if (payload.type !== "access") {
      throw new UnauthorizedException("Invalid token type.");
    }
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("Invalid session.");
    }
    if (user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only Super Admins can manage demo schedules.");
    }
    return user;
  }
}


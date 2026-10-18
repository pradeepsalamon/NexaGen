import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type {
  CoachDashboardResponse,
  CoachBatchesResponse,
  CoachClassListResponse,
  CoachClassResponse,
  CoachStudentsResponse,
  UpdateClassRequest,
  CoachClass,
  CoachClassStudent
} from "@nexa-chess/types";
import { resolveBatchType } from "@nexa-chess/types";
import { ClassStatus, Prisma, UserRole } from "@prisma/client";
import { zonedDayBounds } from "../common/time";
import { PrismaService } from "../prisma/prisma.service";
import { MessagingDispatchService } from "../messaging/messaging-dispatch.service";
import { authenticateUser } from "../auth/authenticate";

// Every coach class read loads the same relations, so `toCoachClass` can show
// the roster (avatar, name, rating, level) and resolve the batch type.
const COACH_CLASS_INCLUDE = {
  batch: {
    include: {
      students: {
        where: { isDeleted: false },
        orderBy: { enrolledAt: "asc" },
        include: {
          student: {
            select: {
              avatarUrl: true,
              firstName: true,
              id: true,
              isDeleted: true,
              lastName: true,
              studentProfile: { select: { chessRating: true, experienceLevel: true } }
            }
          }
        }
      }
    }
  },
  liveSession: true
} satisfies Prisma.CoachClassInclude;

type CoachClassWithRelations = Prisma.CoachClassGetPayload<{ include: typeof COACH_CLASS_INCLUDE }>;

/** Upper bound for `?limit=` on the upcoming list (the dashboard asks for 3). */
const MAX_UPCOMING_LIMIT = 50;

/** Widest `from`–`to` the schedule calendar may ask for: a month grid plus padding weeks. */
const MAX_CALENDAR_RANGE_MS = 93 * 24 * 60 * 60 * 1000;
/** Row cap for one calendar range — far above any real coach's month. */
const MAX_CALENDAR_CLASSES = 1000;

@Injectable()
export class CoachService {

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingDispatchService
  ) {}

  async getDashboard(accessToken: string | undefined): Promise<CoachDashboardResponse> {
    const coach = await this.getAuthenticatedCoach(accessToken);
    const coachId = coach.id;
    // Real calendar day in the coach's timezone, not a rolling window (M7).
    const { start: startOfDay, end: endOfDay } = zonedDayBounds(coach.timezone);

    const [batchCount, distinctStudents, todayClasses, upcomingClasses, completedClasses] = await Promise.all([
      this.prisma.batchCoach.count({
        where: { coachId, isDeleted: false, batch: { isDeleted: false } }
      }),
      // Distinct student count only — group by id instead of materialising every
      // BatchStudent row to `.length` it (AUDIT L9).
      this.prisma.batchStudent.groupBy({
        by: ["studentId"],
        where: { isDeleted: false, batch: { coaches: { some: { coachId, isDeleted: false } }, isDeleted: false } }
      }),
      this.prisma.coachClass.count({
        where: {
          coachId,
          status: { in: [ClassStatus.SCHEDULED, ClassStatus.LIVE] },
          startsAt: { gte: startOfDay, lt: endOfDay }
        }
      }),
      this.prisma.coachClass.count({
        where: {
          coachId,
          status: { in: [ClassStatus.SCHEDULED, ClassStatus.LIVE] },
          startsAt: { gte: endOfDay }
        }
      }),
      this.prisma.coachClass.count({
        where: { coachId, status: ClassStatus.COMPLETED }
      })
    ]);

    return {
      batchCount,
      studentCount: distinctStudents.length,
      todayClasses,
      upcomingClasses,
      completedClasses
    };
  }

  async getBatches(accessToken: string | undefined): Promise<CoachBatchesResponse> {
    const coachId = await this.getAuthenticatedCoachId(accessToken);
    const batches = await this.prisma.batch.findMany({
      where: { coaches: { some: { coachId, isDeleted: false } }, isDeleted: false },
      include: {
        students: { where: { isDeleted: false } },
        classes: {
          where: { 
            status: { in: [ClassStatus.SCHEDULED, ClassStatus.LIVE] },
            endsAt: { gte: new Date() }
          },
          orderBy: { startsAt: "asc" },
          take: 1
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return {
      batches: batches.map(b => ({
        id: b.id,
        name: b.name,
        status: b.status,
        scheduleNotes: b.scheduleNotes,
        studentCount: b.students.length,
        nextClass: b.classes[0]?.startsAt.toISOString() ?? null
      }))
    };
  }

  async getTodayClasses(accessToken: string | undefined): Promise<CoachClassListResponse> {
    const coach = await this.getAuthenticatedCoach(accessToken);
    const coachId = coach.id;
    // Real calendar day in the coach's timezone, not a rolling window (M7).
    const { start: startOfDay, end: endOfDay } = zonedDayBounds(coach.timezone);

    const classes = await this.prisma.coachClass.findMany({
      where: { coachId, startsAt: { gte: startOfDay, lt: endOfDay } },
      include: COACH_CLASS_INCLUDE,
      orderBy: { startsAt: "asc" }
    });

    return { classes: classes.map(c => this.toCoachClass(c)) };
  }

  /**
   * Classes not yet over, soonest first. `limit` caps the list (the dashboard's
   * "Latest upcoming classes" asks for 3); omitted returns every one.
   */
  async getUpcomingClasses(
    accessToken: string | undefined,
    limit?: number
  ): Promise<CoachClassListResponse> {
    const coachId = await this.getAuthenticatedCoachId(accessToken);
    const now = new Date();
    const take =
      limit !== undefined && Number.isInteger(limit) && limit > 0
        ? Math.min(limit, MAX_UPCOMING_LIMIT)
        : undefined;

    const classes = await this.prisma.coachClass.findMany({
      where: { 
        coachId, 
        status: { in: [ClassStatus.SCHEDULED, ClassStatus.LIVE] }, 
        endsAt: { gte: now } 
      },
      include: COACH_CLASS_INCLUDE,
      // id breaks ties so two classes at the same minute keep a stable order.
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      take
    });

    return { classes: classes.map(c => this.toCoachClass(c)) };
  }

  /**
   * Every class of the caller that overlaps `[from, to)` — any status, so the
   * week / month calendar can show cancelled and "Not held" sessions too. The
   * client picks the range in the coach's own timezone and sends UTC instants.
   */
  async getCalendarClasses(
    accessToken: string | undefined,
    query: { from?: string; to?: string }
  ): Promise<CoachClassListResponse> {
    const coachId = await this.getAuthenticatedCoachId(accessToken);

    const from = query.from ? new Date(query.from) : null;
    const to = query.to ? new Date(query.to) : null;
    if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException("`from` and `to` must be ISO-8601 dates.");
    }
    if (to.getTime() <= from.getTime()) {
      throw new BadRequestException("`to` must be after `from`.");
    }
    if (to.getTime() - from.getTime() > MAX_CALENDAR_RANGE_MS) {
      throw new BadRequestException("Calendar range cannot exceed 93 days.");
    }

    const classes = await this.prisma.coachClass.findMany({
      where: { coachId, startsAt: { lt: to }, endsAt: { gt: from } },
      include: COACH_CLASS_INCLUDE,
      orderBy: [{ startsAt: "asc" }, { id: "asc" }],
      take: MAX_CALENDAR_CLASSES
    });

    return { classes: classes.map(c => this.toCoachClass(c)) };
  }

  async getClassHistory(accessToken: string | undefined): Promise<CoachClassListResponse> {
    const coachId = await this.getAuthenticatedCoachId(accessToken);

    const now = new Date();
    // Same "past" rule as the student side (`isPastClass` in @nexa-chess/types):
    // held, cancelled once its date arrived, or never started before its window
    // ended (shown as "Not held"). A cancelled class still ahead is not history.
    const classes = await this.prisma.coachClass.findMany({
      where: {
        coachId,
        OR: [
          { status: ClassStatus.COMPLETED },
          { status: ClassStatus.CANCELLED, startsAt: { lte: now } },
          { status: ClassStatus.SCHEDULED, endsAt: { lte: now } }
        ]
      },
      include: COACH_CLASS_INCLUDE,
      orderBy: { startsAt: "desc" },
      take: 50
    });

    return { classes: classes.map(c => this.toCoachClass(c)) };
  }

  /**
   * The owning coach's view of one class. Admins may read any class too — the
   * analytics pages link to `/classes/:id` — but every write stays coach-only.
   */
  async getClassById(accessToken: string | undefined, classId: string): Promise<CoachClassResponse> {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    const isAdmin = user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
    // 403, not 401: a signed-in student here is the wrong role, not a dead
    // session, and a 401 sends the web client into refresh-and-retry.
    if (user.role !== UserRole.COACH && !isAdmin) throw new ForbiddenException("Not your class.");

    const cls = await this.prisma.coachClass.findUnique({
      where: { id: classId },
      include: COACH_CLASS_INCLUDE
    });

    if (!cls || (!isAdmin && cls.coachId !== user.id)) {
      throw new NotFoundException("Class not found.");
    }

    return { class: this.toCoachClass(cls) };
  }

  async getClassDetails(accessToken: string | undefined, classId: string) {
    const coachId = await this.getAuthenticatedCoachId(accessToken);

    const existingClass = await this.prisma.coachClass.findUnique({
      where: { id: classId },
      include: {
        ...COACH_CLASS_INCLUDE,
        attendances: {
          include: {
            student: true
          }
        }
      }
    });

    if (!existingClass || existingClass.coachId !== coachId) {
      throw new NotFoundException("Class not found");
    }

    const participants = existingClass.attendances.map(a => ({
      name: `${a.student.firstName} ${a.student.lastName || ''}`.trim(),
      // No attendance join recorded yet — null, not the class's creation time (AUDIT L8).
      joinedAt: a.joinedAt ? a.joinedAt.toISOString() : null
    }));

    const coachClass = this.toCoachClass(existingClass);

    return {
      class: {
        ...coachClass,
        actualStartsAt: existingClass.liveSession?.startedAt ? existingClass.liveSession.startedAt.toISOString() : null,
        actualEndsAt: existingClass.liveSession?.endedAt ? existingClass.liveSession.endedAt.toISOString() : null,
        participants
      }
    };
  }

  async updateClass(
    accessToken: string | undefined,
    classId: string,
    payload: UpdateClassRequest
  ): Promise<CoachClassResponse> {
    const coachId = await this.getAuthenticatedCoachId(accessToken);
    const existing = await this.prisma.coachClass.findUnique({ where: { id: classId } });

    if (!existing || existing.coachId !== coachId) {
      throw new NotFoundException("Class not found.");
    }

    // Only the class's notes change here, so a finished class stays editable
    // (post-class notes/homework) — its time, batch and attendance never move.
    if (existing.status === ClassStatus.CANCELLED) {
      throw new ConflictException("Cannot edit a cancelled class.");
    }

    const text = (value: string | undefined) =>
      value === undefined ? undefined : this.toNullableString(value);

    const cls = await this.prisma.coachClass.update({
      where: { id: classId },
      data: {
        title: text(payload.title),
        topic: text(payload.topic),
        description: text(payload.description),
        objectives: text(payload.objectives),
        homework: text(payload.homework),
        notes: text(payload.notes),
        // This class only — the batch default and sibling classes are untouched.
        // null clears the override (inherit); undefined leaves it alone.
        batchType: payload.batchType
      },
      include: COACH_CLASS_INCLUDE
    });

    return { class: this.toCoachClass(cls) };
  }

  async cancelClass(accessToken: string | undefined, classId: string): Promise<CoachClassResponse> {
    const coachId = await this.getAuthenticatedCoachId(accessToken);
    const existing = await this.prisma.coachClass.findUnique({ where: { id: classId } });

    if (!existing || existing.coachId !== coachId) {
      throw new NotFoundException("Class not found.");
    }

    // AUDIT H18: a class that already ran (or is running) cannot be cancelled
    // after the fact; an already-cancelled class is a no-op, not an error worth
    // re-triggering `cancelledAt`.
    if (
      existing.status === ClassStatus.COMPLETED ||
      existing.status === ClassStatus.LIVE ||
      existing.status === ClassStatus.IN_PROGRESS
    ) {
      throw new ConflictException(
        `Cannot cancel a class that is ${existing.status.toLowerCase()}.`
      );
    }
    if (existing.status === ClassStatus.CANCELLED) {
      throw new ConflictException("Class is already cancelled.");
    }

    const cls = await this.prisma.coachClass.update({
      where: { id: classId },
      data: {
        status: ClassStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledById: coachId
      },
      include: COACH_CLASS_INCLUDE
    });

    this.messaging.dispatchInBackground({
      event: "CLASS_CANCELLED",
      classId: cls.id
    });

    return { class: this.toCoachClass(cls) };
  }

  async getStudents(accessToken: string | undefined): Promise<CoachStudentsResponse> {
    const coachId = await this.getAuthenticatedCoachId(accessToken);
    const batches = await this.prisma.batch.findMany({
      where: { coaches: { some: { coachId, isDeleted: false } }, isDeleted: false },
      include: {
        students: {
          where: { isDeleted: false },
          include: {
            student: { include: { studentProfile: true } }
          }
        }
      }
    });

    const studentsMap = new Map<string, any>();
    for (const batch of batches) {
      for (const bs of batch.students) {
        if (!bs.student || bs.student.isDeleted) continue;
        const student = bs.student;
        if (!studentsMap.has(student.id)) {
          studentsMap.set(student.id, {
            id: student.id,
            firstName: student.firstName,
            lastName: student.lastName,
            email: student.email,
            status: student.status,
            chessRating: student.studentProfile?.chessRating ?? null,
            batches: []
          });
        }
        studentsMap.get(student.id).batches.push({ id: batch.id, name: batch.name });
      }
    }

    return { students: Array.from(studentsMap.values()) };
  }

  private async getAuthenticatedCoach(accessToken: string | undefined) {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken);
    if (user.role !== UserRole.COACH) throw new ForbiddenException("Coach access required.");
    return user;
  }

  private async getAuthenticatedCoachId(accessToken: string | undefined) {
    return (await this.getAuthenticatedCoach(accessToken)).id;
  }

  private toCoachClass(c: CoachClassWithRelations): CoachClass {
    const students: CoachClassStudent[] = (c.batch?.students ?? [])
      .filter((bs) => bs.student && !bs.student.isDeleted)
      .map(({ student }) => ({
        avatarUrl: student.avatarUrl,
        chessRating: student.studentProfile?.chessRating ?? null,
        experienceLevel: student.studentProfile?.experienceLevel ?? null,
        firstName: student.firstName,
        id: student.id,
        lastName: student.lastName
      }));
    const inherited = resolveBatchType({
      batchDefault: c.batch?.batchType,
      studentCount: students.length
    });
    const batchType = c.batchType ? { source: "CLASS" as const, type: c.batchType } : inherited;

    return {
      id: c.id,
      batchId: c.batchId || "",
      batchName: c.batch?.name || "Demo Class",
      coachId: c.coachId,
      title: c.title,
      topic: c.topic,
      description: c.description,
      objectives: c.objectives,
      homework: c.homework,
      notes: c.notes,
      status: c.status as any,
      startsAt: c.startsAt.toISOString(),
      endsAt: c.endsAt.toISOString(),
      meetingRoomId: c.meetingRoomId,
      createdAt: c.createdAt.toISOString(),
      studentCount: students.length,
      hasRecording: !!c.liveSession?.recordingUrl,
      batchType: batchType.type,
      batchTypeSource: batchType.source,
      batchTypeInherited: inherited.type,
      batchTypeOverride: c.batchType,
      level: this.rosterLevel(students),
      students
    };
  }

  /** The roster's shared experience level, "MIXED" when it differs, null when empty. */
  private rosterLevel(students: CoachClassStudent[]): CoachClass["level"] {
    const levels = new Set(students.map((s) => s.experienceLevel).filter((l) => l !== null));
    if (levels.size === 0) return null;
    return levels.size === 1 ? [...levels][0] : "MIXED";
  }

  private toNullableString(value: string | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }
}

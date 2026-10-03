import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type {
  CoachDashboardResponse,
  CoachBatchesResponse,
  CoachClassListResponse,
  CoachClassResponse,
  CoachStudentsResponse,
  UpdateClassRequest,
  CoachClass
} from "@nexa-chess/types";
import { ClassStatus, Prisma, UserRole } from "@prisma/client";
import { zonedDayBounds } from "../common/time";
import { PrismaService } from "../prisma/prisma.service";
import { MessagingDispatchService } from "../messaging/messaging-dispatch.service";
import { authenticateUser } from "../auth/authenticate";

type CoachClassWithRelations = Prisma.CoachClassGetPayload<{
  include: {
    batch: {
      include: {
        students: {
          where: { isDeleted: false }
        }
      }
    },
    liveSession: true
  }
}>;

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
      include: { 
        batch: { include: { students: { where: { isDeleted: false } } } },
        liveSession: true 
      },
      orderBy: { startsAt: "asc" }
    });

    return { classes: classes.map(c => this.toCoachClass(c)) };
  }

  async getUpcomingClasses(accessToken: string | undefined): Promise<CoachClassListResponse> {
    const coachId = await this.getAuthenticatedCoachId(accessToken);
    const now = new Date();

    const classes = await this.prisma.coachClass.findMany({
      where: { 
        coachId, 
        status: { in: [ClassStatus.SCHEDULED, ClassStatus.LIVE] }, 
        endsAt: { gte: now } 
      },
      include: { 
        batch: { include: { students: { where: { isDeleted: false } } } },
        liveSession: true
      },
      orderBy: { startsAt: "asc" }
    });

    return { classes: classes.map(c => this.toCoachClass(c)) };
  }

  async getClassHistory(accessToken: string | undefined): Promise<CoachClassListResponse> {
    const coachId = await this.getAuthenticatedCoachId(accessToken);

    const classes = await this.prisma.coachClass.findMany({
      where: { coachId, status: { in: [ClassStatus.COMPLETED, ClassStatus.CANCELLED] } },
      include: { 
        batch: { include: { students: { where: { isDeleted: false } } } },
        liveSession: true 
      },
      orderBy: { startsAt: "desc" },
      take: 50
    });

    return { classes: classes.map(c => this.toCoachClass(c)) };
  }

  async getClassById(accessToken: string | undefined, classId: string): Promise<CoachClassResponse> {
    const coachId = await this.getAuthenticatedCoachId(accessToken);

    const cls = await this.prisma.coachClass.findUnique({
      where: { id: classId },
      include: { 
        batch: { include: { students: { where: { isDeleted: false } } } },
        liveSession: true 
      }
    });

    if (!cls || cls.coachId !== coachId) {
      throw new NotFoundException("Class not found.");
    }

    return { class: this.toCoachClass(cls) };
  }

  async getClassDetails(accessToken: string | undefined, classId: string) {
    const coachId = await this.getAuthenticatedCoachId(accessToken);

    const existingClass = await this.prisma.coachClass.findUnique({
      where: { id: classId },
      include: {
        batch: {
          include: { students: true }
        },
        liveSession: true,
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
        notes: text(payload.notes)
      },
      include: {
        batch: { include: { students: { where: { isDeleted: false } } } },
        liveSession: true
      }
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
    if (existing.status === ClassStatus.COMPLETED || existing.status === ClassStatus.LIVE) {
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
      include: {
        batch: { include: { students: { where: { isDeleted: false } } } },
        liveSession: true
      }
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
    if (user.role !== UserRole.COACH) throw new UnauthorizedException("Unauthorized.");
    return user;
  }

  private async getAuthenticatedCoachId(accessToken: string | undefined) {
    return (await this.getAuthenticatedCoach(accessToken)).id;
  }

  private toCoachClass(c: CoachClassWithRelations): CoachClass {
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
      studentCount: c.batch?.students?.length || 0,
      hasRecording: !!c.liveSession?.recordingUrl,
    };
  }

  private toNullableString(value: string | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }
}

import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-chess/config/api";
import type {
  CoachDashboardResponse,
  CoachBatchesResponse,
  CoachClassListResponse,
  CoachClassResponse,
  CoachStudentsResponse,
  CreateClassRequest,
  UpdateClassRequest,
  CoachClass
} from "@nexa-chess/types";
import { ClassStatus, Prisma, UserRole, UserStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AccessTokenPayload } from "../auth/types";

type CoachClassWithRelations = Prisma.CoachClassGetPayload<{
  include: {
    batch: {
      include: {
        students: {
          where: { isDeleted: false }
        }
      }
    }
  }
}>;

@Injectable()
export class CoachService {
  private readonly env = getApiEnv();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  async getDashboard(accessToken: string | undefined): Promise<CoachDashboardResponse> {
    const coachId = await this.getAuthenticatedCoachId(accessToken);
    const now = new Date();
    // Use a rolling window rather than server-local midnight to prevent timezone drift
    const startOfDay = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    const endOfDay = new Date(now.getTime() + 20 * 60 * 60 * 1000);

    const [batchCount, students, todayClasses, upcomingClasses, completedClasses] = await Promise.all([
      this.prisma.batchCoach.count({
        where: { coachId, isDeleted: false, batch: { isDeleted: false } }
      }),
      this.prisma.batchStudent.findMany({
        where: { isDeleted: false, batch: { coaches: { some: { coachId, isDeleted: false } }, isDeleted: false } },
        distinct: ["studentId"]
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
      studentCount: students.length,
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
    const coachId = await this.getAuthenticatedCoachId(accessToken);
    const now = new Date();
    const startOfDay = new Date(now.getTime() - 4 * 60 * 60 * 1000);
    const endOfDay = new Date(now.getTime() + 20 * 60 * 60 * 1000);

    const classes = await this.prisma.coachClass.findMany({
      where: { coachId, startsAt: { gte: startOfDay, lt: endOfDay } },
      include: { batch: { include: { students: { where: { isDeleted: false } } } } },
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
      include: { batch: { include: { students: { where: { isDeleted: false } } } } },
      orderBy: { startsAt: "asc" }
    });

    return { classes: classes.map(c => this.toCoachClass(c)) };
  }

  async getClassHistory(accessToken: string | undefined): Promise<CoachClassListResponse> {
    const coachId = await this.getAuthenticatedCoachId(accessToken);

    const classes = await this.prisma.coachClass.findMany({
      where: { coachId, status: { in: [ClassStatus.COMPLETED, ClassStatus.CANCELLED] } },
      include: { batch: { include: { students: { where: { isDeleted: false } } } } },
      orderBy: { startsAt: "desc" },
      take: 50
    });

    return { classes: classes.map(c => this.toCoachClass(c)) };
  }

  async createClass(
    accessToken: string | undefined,
    payload: CreateClassRequest
  ): Promise<CoachClassResponse> {
    const coachId = await this.getAuthenticatedCoachId(accessToken);
    await this.assertCoachInBatch(coachId, payload.batchId);

    const cls = await this.prisma.coachClass.create({
      data: {
        batchId: payload.batchId,
        coachId,
        title: this.toNullableString(payload.title),
        topic: this.toNullableString(payload.topic),
        description: this.toNullableString(payload.description),
        objectives: this.toNullableString(payload.objectives),
        homework: this.toNullableString(payload.homework),
        notes: this.toNullableString(payload.notes),
        startsAt: new Date(payload.startsAt),
        endsAt: new Date(payload.endsAt)
      },
      include: { batch: { include: { students: { where: { isDeleted: false } } } } }
    });

    return { class: this.toCoachClass(cls) };
  }

  async getClassById(accessToken: string | undefined, classId: string): Promise<CoachClassResponse> {
    const coachId = await this.getAuthenticatedCoachId(accessToken);

    const cls = await this.prisma.coachClass.findUnique({
      where: { id: classId },
      include: { batch: { include: { students: { where: { isDeleted: false } } } } }
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
      joinedAt: a.joinedAt ? a.joinedAt.toISOString() : existingClass.createdAt.toISOString()
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

    if (payload.batchId) {
      await this.assertCoachInBatch(coachId, payload.batchId);
    }

    const cls = await this.prisma.coachClass.update({
      where: { id: classId },
      data: {
        batchId: payload.batchId,
        title: payload.title === undefined ? undefined : this.toNullableString(payload.title),
        topic: payload.topic === undefined ? undefined : this.toNullableString(payload.topic),
        description: payload.description === undefined ? undefined : this.toNullableString(payload.description),
        objectives: payload.objectives === undefined ? undefined : this.toNullableString(payload.objectives),
        homework: payload.homework === undefined ? undefined : this.toNullableString(payload.homework),
        notes: payload.notes === undefined ? undefined : this.toNullableString(payload.notes),
        startsAt: payload.startsAt ? new Date(payload.startsAt) : undefined,
        endsAt: payload.endsAt ? new Date(payload.endsAt) : undefined
      },
      include: { batch: { include: { students: { where: { isDeleted: false } } } } }
    });

    return { class: this.toCoachClass(cls) };
  }

  async cancelClass(accessToken: string | undefined, classId: string): Promise<CoachClassResponse> {
    const coachId = await this.getAuthenticatedCoachId(accessToken);
    const existing = await this.prisma.coachClass.findUnique({ where: { id: classId } });

    if (!existing || existing.coachId !== coachId) {
      throw new NotFoundException("Class not found.");
    }

    const cls = await this.prisma.coachClass.update({
      where: { id: classId },
      data: {
        status: ClassStatus.CANCELLED,
        cancelledAt: new Date()
      },
      include: { batch: { include: { students: { where: { isDeleted: false } } } } }
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

  private async assertCoachInBatch(coachId: string, batchId: string) {
    const batch = await this.prisma.batch.findUnique({
      where: { id: batchId },
      include: { coaches: { where: { isDeleted: false } } }
    });

    if (!batch || batch.isDeleted) {
      throw new NotFoundException("Batch not found.");
    }

    if (!batch.coaches.some(c => c.coachId === coachId)) {
      throw new ForbiddenException("You are not assigned to this batch.");
    }
  }

  private async getAuthenticatedCoachId(accessToken: string | undefined) {
    if (!accessToken) throw new UnauthorizedException("Access token is missing.");

    const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(accessToken, {
      secret: this.env.JWT_ACCESS_SECRET
    });

    if (payload.type !== "access") throw new UnauthorizedException("Invalid token type.");

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== UserStatus.ACTIVE || user.role !== UserRole.COACH) {
      throw new UnauthorizedException("Unauthorized.");
    }

    return user.id;
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
      studentCount: c.batch?.students?.length || 0
    };
  }

  private toNullableString(value: string | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }
}

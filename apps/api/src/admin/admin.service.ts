import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MessagingDispatchService } from '../messaging/messaging-dispatch.service';
import { assertNoSchedulingConflict, assertNotInPast } from '../coach/class-scheduling.util';
import { paginationMeta, resolveOrderBy, resolvePagination } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { TrashRepository } from '../trash/trash.repository';
import type { AddDemoInviteesRequest, DemoClass, DemoClassDetailsResponse, PaginatedQuery, PendingCoachesResponse, PendingStudentsResponse, UpdateCoachStatusRequest, UpdateStudentStatusRequest, CreateDemoClassRequest, UpdateDemoClassRequest } from '@nexa-chess/types';
import { ClassStatus, Prisma, UserStatus, type CoachClass, type DemoSchedule, type User } from '@prisma/client';
import { DemoInviteService, demoInvitePath } from '../demo-class/demo-invite.service';
import { queryEnum } from '../common/query-params';

type DemoClassRow = CoachClass & {
  coach: Pick<User, 'firstName' | 'lastName'>;
  demoSchedule: Pick<DemoSchedule, 'id' | 'slug'> | null;
  _count: { demoRegistrations: number };
};

const DEMO_CLASS_INCLUDE = {
  coach: { select: { firstName: true, lastName: true } },
  demoSchedule: { select: { id: true, slug: true } },
  _count: { select: { demoRegistrations: true } }
} satisfies Prisma.CoachClassInclude;

@Injectable()
export class AdminService {
  constructor(
    private readonly demoInvites: DemoInviteService,
    private readonly messaging: MessagingDispatchService,
    private readonly prisma: PrismaService,
    private readonly trashRepository: TrashRepository
  ) {}

  async getPendingCoaches(): Promise<PendingCoachesResponse> {
    const users = await this.prisma.user.findMany({
      where: {
        role: 'COACH',
        coachProfile: {
          approvalStatus: 'PENDING'
        },
        isDeleted: false
      },
      include: {
        coachProfile: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    return {
      coaches: users.map(user => ({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        createdAt: user.createdAt.toISOString(),
        coachProfile: {
          bio: user.coachProfile!.bio,
          fideId: user.coachProfile!.fideId,
          fideRating: user.coachProfile!.fideRating,
          hourlyRate: user.coachProfile!.hourlyRate ? user.coachProfile!.hourlyRate.toString() : null,
          qualification: user.coachProfile!.qualification,
          specialization: user.coachProfile!.specialization,
          title: user.coachProfile!.title,
          yearsOfExperience: user.coachProfile!.yearsOfExperience
        }
      }))
    };
  }

  async updateCoachStatus(adminId: string, coachId: string, data: UpdateCoachStatusRequest): Promise<{ ok: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { id: coachId },
      include: { coachProfile: true }
    });

    if (!user || user.role !== 'COACH' || !user.coachProfile) {
      throw new NotFoundException('Coach not found.');
    }

    await this.prisma.$transaction(async (tx) => {
      // Update the coach profile specifically
      await tx.coachProfile.update({
        where: { userId: coachId },
        data: {
          approvalStatus: data.status,
          approvedById: adminId,
          approvedAt: new Date()
        }
      });

      if (data.status === 'DELETED') {
        // Route a delete through the trash pipeline so the row is actually
        // soft-deleted (isDeleted + audit log), not just a "DELETED" status
        // zombie that still shows in user lists but can't log in (AUDIT M15).
        // Cascades to the coach profile so it doesn't linger active (AUDIT M14).
        await this.trashRepository.cascadeSoftDelete(tx, 'User', coachId, adminId);
        return;
      }

      await tx.user.update({
        where: { id: coachId },
        data: { status: data.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE' }
      });
    });

    return { ok: true };
  }

  async getPendingStudents(): Promise<PendingStudentsResponse> {
    const users = await this.prisma.user.findMany({
      where: { role: 'STUDENT', status: UserStatus.PENDING },
      include: { studentProfile: true },
      orderBy: { createdAt: 'asc' }
    });

    return {
      students: users.map(user => ({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        parentName: user.studentProfile?.parentName ?? null,
        createdAt: user.createdAt.toISOString()
      }))
    };
  }

  async updateStudentStatus(studentId: string, data: UpdateStudentStatusRequest): Promise<{ ok: boolean }> {
    if (data.status !== 'ACTIVE' && data.status !== 'ARCHIVED') {
      throw new ConflictException('Unsupported status.');
    }

    // Status-filtered so a double click or a second admin can't review twice.
    const { count } = await this.prisma.user.updateMany({
      where: { id: studentId, role: 'STUDENT', status: UserStatus.PENDING },
      data: { status: data.status === 'ACTIVE' ? UserStatus.ACTIVE : UserStatus.ARCHIVED }
    });

    if (count === 0) {
      throw new NotFoundException('Pending student not found or already reviewed.');
    }

    if (data.status === 'ACTIVE') {
      this.messaging.dispatchInBackground({ event: 'ACCOUNT_APPROVED', userId: studentId });
    }

    return { ok: true };
  }

  async createDemoClass(adminId: string, data: CreateDemoClassRequest) {
    const coach = await this.prisma.user.findUnique({
      where: { id: data.coachId }
    });

    // An unapproved coach must not be schedulable (AUDIT H9).
    if (!coach || coach.role !== 'COACH' || coach.status !== UserStatus.ACTIVE) {
      throw new NotFoundException("Coach not found");
    }

    const startsAt = new Date(data.startsAt);
    const endsAt = new Date(data.endsAt);

    assertNotInPast(startsAt);
    await assertNoSchedulingConflict(this.prisma, {
      coachId: data.coachId,
      startsAt,
      endsAt,
      timeZone: coach.timezone
    });

    const demoClass = await this.prisma.coachClass.create({
      data: {
        coachId: data.coachId,
        topic: data.topic,
        description: data.description,
        startsAt,
        endsAt,
        isDemo: true,
        status: 'SCHEDULED',
        demoAccessMode: data.accessMode ?? 'PUBLIC',
        demoPasscode: data.accessMode === 'PASSCODE' ? data.passcode ?? null : null
      }
    });

    if (data.leadIds?.length || data.invitees?.length) {
      await this.demoInvites.addInvitees(demoClass.id, adminId, {
        leadIds: data.leadIds,
        invitees: data.invitees,
        notify: data.notifyInvitees ?? true
      });
    }

    return { class: await this.getDemoClassDto(demoClass.id) };
  }

  async updateDemoClass(_adminId: string, classId: string, data: UpdateDemoClassRequest) {
    const existingClass = await this.prisma.coachClass.findUnique({
      where: { id: classId, isDemo: true }
    });

    if (!existingClass) {
      throw new NotFoundException("Demo class not found");
    }

    if (data.coachId) {
      const coach = await this.prisma.user.findUnique({
        where: { id: data.coachId }
      });
      if (!coach || coach.role !== 'COACH' || coach.status !== UserStatus.ACTIVE) {
        throw new NotFoundException("Coach not found");
      }
    }

    const startsAt = data.startsAt ? new Date(data.startsAt) : existingClass.startsAt;
    const endsAt = data.endsAt ? new Date(data.endsAt) : existingClass.endsAt;
    const coachId = data.coachId || existingClass.coachId;
    const accessMode = data.accessMode ?? existingClass.demoAccessMode;
    const passcode = accessMode === 'PASSCODE' ? data.passcode ?? existingClass.demoPasscode : null;
    if (accessMode === 'PASSCODE' && !passcode) {
      throw new ConflictException('A passcode is required for this access mode.');
    }
    const timeMoved =
      startsAt.getTime() !== existingClass.startsAt.getTime() ||
      endsAt.getTime() !== existingClass.endsAt.getTime();

    if (data.startsAt || data.endsAt || data.coachId) {
      if (data.startsAt) {
        assertNotInPast(startsAt);
      }
      await assertNoSchedulingConflict(this.prisma, {
        coachId,
        startsAt,
        endsAt,
        excludeClassId: classId
      });
    }

    const updatedClass = await this.prisma.coachClass.update({
      where: { id: classId },
      data: {
        coachId: data.coachId,
        topic: data.topic,
        description: data.description === undefined ? undefined : (data.description || null),
        startsAt: data.startsAt ? new Date(data.startsAt) : undefined,
        endsAt: data.endsAt ? new Date(data.endsAt) : undefined,
        demoAccessMode: accessMode,
        demoPasscode: passcode,
        // A rescheduled occurrence leaves its static schedule, which then
        // re-creates the regular slot rather than counting this one as it.
        ...(timeMoved && existingClass.demoScheduleId ? { demoScheduleId: null } : {})
      }
    });

    return { class: await this.getDemoClassDto(updatedClass.id) };
  }

  async cancelDemoClass(adminId: string, classId: string) {
    const existingClass = await this.prisma.coachClass.findUnique({
      where: { id: classId, isDemo: true }
    });

    if (!existingClass) {
      throw new NotFoundException("Demo class not found");
    }

    // A live or finished class has already happened; cancelling it rewrites history.
    if (existingClass.status !== 'SCHEDULED') {
      throw new ConflictException("Only scheduled demo classes can be cancelled");
    }

    await this.prisma.coachClass.update({
      where: { id: classId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledById: adminId
      }
    });

    return { class: await this.getDemoClassDto(classId) };
  }

  async restoreDemoClass(_adminId: string, classId: string) {
    const existingClass = await this.prisma.coachClass.findUnique({
      where: { id: classId, isDemo: true }
    });

    if (!existingClass) {
      throw new NotFoundException("Demo class not found");
    }

    if (existingClass.status !== 'CANCELLED') {
      throw new ConflictException("Only cancelled demo classes can be restored");
    }
    // A restored class must still be ahead of us, like a newly scheduled one.
    assertNotInPast(existingClass.startsAt);

    // Check if restoring would cause a schedule conflict for the coach
    await assertNoSchedulingConflict(this.prisma, {
      coachId: existingClass.coachId,
      startsAt: existingClass.startsAt,
      endsAt: existingClass.endsAt,
      excludeClassId: classId
    });

    await this.prisma.coachClass.update({
      where: { id: classId },
      data: {
        status: 'SCHEDULED',
        cancelledAt: null,
        cancelledById: null,
        cancellationReason: null
      }
    });

    return { class: await this.getDemoClassDto(classId) };
  }

  async listDemoClasses(query?: PaginatedQuery & { status?: string }) {
    const { page, pageSize, skip, take, search } = resolvePagination(query);
    const where = this.buildClassListWhere(true, query?.status, search);
    const orderBy = resolveOrderBy(
      query,
      ['startsAt', 'status', 'topic', 'createdAt'] as const,
      { startsAt: 'asc' }
    ) as Prisma.CoachClassOrderByWithRelationInput;

    const [classes, total] = await Promise.all([
      this.prisma.coachClass.findMany({
        where,
        include: DEMO_CLASS_INCLUDE,
        orderBy,
        skip,
        take
      }),
      this.prisma.coachClass.count({ where })
    ]);

    return {
      classes: classes.map((c) => this.toDemoClassDto(c)),
      pagination: paginationMeta(total, page, pageSize)
    };
  }

  private async getDemoClassDto(classId: string): Promise<DemoClass> {
    const row = await this.prisma.coachClass.findUniqueOrThrow({
      where: { id: classId },
      include: DEMO_CLASS_INCLUDE
    });
    return this.toDemoClassDto(row);
  }

  private toDemoClassDto(c: DemoClassRow): DemoClass {
    return {
      id: c.id,
      topic: c.topic ?? 'Demo class',
      description: c.description,
      startsAt: c.startsAt.toISOString(),
      endsAt: c.endsAt.toISOString(),
      status: c.status === 'IN_PROGRESS' ? 'LIVE' : c.status,
      coachId: c.coachId,
      coachName: `${c.coach.firstName} ${c.coach.lastName || ''}`.trim(),
      accessMode: c.demoAccessMode,
      passcode: c.demoPasscode,
      registrationCount: c._count.demoRegistrations,
      schedule: c.demoSchedule ? { id: c.demoSchedule.id, slug: c.demoSchedule.slug } : null
    };
  }

  async addDemoInvitees(adminId: string, classId: string, body: AddDemoInviteesRequest) {
    return this.demoInvites.addInvitees(classId, adminId, body);
  }

  async removeDemoInvitee(adminId: string, classId: string, registrationId: string) {
    return this.demoInvites.removeInvitee(classId, registrationId, adminId);
  }

  /**
   * Shared `where` for the admin demo/batch class lists (AUDIT H26): the
   * `isDemo` discriminator plus optional status filter and a free-text search
   * over the class fields and the assigned coach's name.
   */
  private buildClassListWhere(
    isDemo: boolean,
    status: unknown,
    search: string
  ): Prisma.CoachClassWhereInput {
    const where: Prisma.CoachClassWhereInput = { isDemo };
    const classStatus = queryEnum(status, ClassStatus, 'status');
    if (classStatus) {
      where.status = classStatus;
    }
    if (search) {
      where.OR = [
        { topic: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { coach: { firstName: { contains: search, mode: 'insensitive' } } },
        { coach: { lastName: { contains: search, mode: 'insensitive' } } }
      ];
    }
    return where;
  }

  async getDemoClassDetails(_adminId: string, classId: string): Promise<DemoClassDetailsResponse> {
    const existingClass = await this.prisma.coachClass.findUnique({
      where: { id: classId, isDemo: true },
      include: {
        ...DEMO_CLASS_INCLUDE,
        liveSession: true,
        demoRegistrations: { orderBy: { createdAt: 'desc' } }
      }
    });

    if (!existingClass) {
      throw new NotFoundException("Demo class not found");
    }

    return {
      class: {
        ...this.toDemoClassDto(existingClass),
        actualStartsAt: existingClass.liveSession?.startedAt?.toISOString() || null,
        actualEndsAt: existingClass.liveSession?.endedAt?.toISOString() || null,
        registrations: existingClass.demoRegistrations.map((r) => ({
          id: r.id,
          name: r.name,
          source: r.source,
          approval: r.approval,
          leadId: r.leadId,
          contactMethod: r.contactMethod,
          contact: r.contactMethod === 'EMAIL' ? (r.email ?? r.contactValue) : (r.phoneNumber ?? r.contactValue),
          invitePath: r.inviteToken ? demoInvitePath(existingClass.id, r.inviteToken) : null,
          registeredAt: r.createdAt.toISOString(),
          joined: !!r.joinedAt
        }))
      }
    };
  }

  async listBatchClasses(query?: PaginatedQuery & { status?: string }) {
    const { page, pageSize, skip, take, search } = resolvePagination(query);
    const where = this.buildClassListWhere(false, query?.status, search);
    const orderBy = resolveOrderBy(
      query,
      ['startsAt', 'status', 'topic', 'title', 'createdAt'] as const,
      { startsAt: 'asc' }
    ) as Prisma.CoachClassOrderByWithRelationInput;

    const [classes, total] = await Promise.all([
      this.prisma.coachClass.findMany({
        where,
        include: {
          coach: { select: { firstName: true, lastName: true } },
          batch: {
            select: { name: true, _count: { select: { students: { where: { isDeleted: false } } } } }
          },
          liveSession: true
        },
        orderBy,
        skip,
        take
      }),
      this.prisma.coachClass.count({ where })
    ]);

    return {
      pagination: paginationMeta(total, page, pageSize),
      classes: classes.map(c => ({
        id: c.id,
        batchId: c.batchId!,
        batchName: c.batch?.name || 'Unknown',
        coachId: c.coachId,
        title: c.title,
        topic: c.topic,
        description: c.description,
        objectives: c.objectives,
        homework: c.homework,
        notes: c.notes,
        status: c.status,
        startsAt: c.startsAt.toISOString(),
        endsAt: c.endsAt.toISOString(),
        meetingRoomId: c.meetingRoomId,
        createdAt: c.createdAt.toISOString(),
        studentCount: c.batch?._count.students ?? 0,
        coachName: `${c.coach.firstName} ${c.coach.lastName || ''}`.trim(),
        hasRecording: !!c.liveSession?.recordingUrl,
      }))
    };
  }

  async getBatchClassDetails(_adminId: string, classId: string) {
    const existingClass = await this.prisma.coachClass.findUnique({
      where: { id: classId, isDemo: false },
      include: {
        coach: { select: { firstName: true, lastName: true } },
        batch: {
          select: { name: true, _count: { select: { students: { where: { isDeleted: false } } } } }
        },
        liveSession: true,
        attendances: {
          include: {
            student: true
          }
        }
      }
    });

    if (!existingClass) {
      throw new NotFoundException("Batch class not found");
    }

    const participants = existingClass.attendances.map(a => ({
      name: `${a.student.firstName} ${a.student.lastName || ''}`.trim(),
      // No attendance join recorded yet — null, not the class's creation time (AUDIT L8).
      joinedAt: a.joinedAt ? a.joinedAt.toISOString() : null
    }));

    const classDetails = {
      id: existingClass.id,
      batchId: existingClass.batchId!,
      batchName: existingClass.batch?.name || 'Unknown',
      coachId: existingClass.coachId,
      title: existingClass.title,
      topic: existingClass.topic,
      description: existingClass.description,
      objectives: existingClass.objectives,
      homework: existingClass.homework,
      notes: existingClass.notes,
      status: existingClass.status,
      startsAt: existingClass.startsAt.toISOString(),
      endsAt: existingClass.endsAt.toISOString(),
      meetingRoomId: existingClass.meetingRoomId,
      createdAt: existingClass.createdAt.toISOString(),
      studentCount: existingClass.batch?._count.students ?? 0,
      coachName: `${existingClass.coach.firstName} ${existingClass.coach.lastName || ''}`.trim(),
      actualStartsAt: existingClass.liveSession?.startedAt ? existingClass.liveSession.startedAt.toISOString() : null,
      actualEndsAt: existingClass.liveSession?.endedAt ? existingClass.liveSession.endedAt.toISOString() : null,
      hasRecording: !!existingClass.liveSession?.recordingUrl,
      participants
    };

    return { class: classDetails };
  }
}

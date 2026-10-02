import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MessagingDispatchService } from '../messaging/messaging-dispatch.service';
import { assertNoSchedulingConflict, assertNotInPast } from '../coach/class-scheduling.util';
import { paginationMeta, resolveOrderBy, resolvePagination } from '../common/pagination';
import { PrismaService } from '../prisma/prisma.service';
import { TrashRepository } from '../trash/trash.repository';
import type { PaginatedQuery, PendingCoachesResponse, PendingStudentsResponse, UpdateCoachStatusRequest, UpdateStudentStatusRequest, CreateDemoClassRequest, UpdateDemoClassRequest } from '@nexa-chess/types';
import { Prisma, UserStatus } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(
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

  async createDemoClass(_adminId: string, data: CreateDemoClassRequest) {
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
      }
    });

    return { class: demoClass };
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
      }
    });

    return { class: updatedClass };
  }

  async cancelDemoClass(adminId: string, classId: string) {
    const existingClass = await this.prisma.coachClass.findUnique({
      where: { id: classId, isDemo: true }
    });

    if (!existingClass) {
      throw new NotFoundException("Demo class not found");
    }

    const cancelledClass = await this.prisma.coachClass.update({
      where: { id: classId },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledById: adminId
      }
    });

    return { class: cancelledClass };
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

    // Check if restoring would cause a schedule conflict for the coach
    await assertNoSchedulingConflict(this.prisma, {
      coachId: existingClass.coachId,
      startsAt: existingClass.startsAt,
      endsAt: existingClass.endsAt,
      excludeClassId: classId
    });

    const restoredClass = await this.prisma.coachClass.update({
      where: { id: classId },
      data: {
        status: 'SCHEDULED',
        cancelledAt: null,
        cancelledById: null,
        cancellationReason: null
      }
    });

    return { class: restoredClass };
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
        include: { coach: true },
        orderBy,
        skip,
        take
      }),
      this.prisma.coachClass.count({ where })
    ]);

    return {
      classes: classes.map(c => ({
        id: c.id,
        topic: c.topic,
        description: c.description,
        startsAt: c.startsAt.toISOString(),
        endsAt: c.endsAt.toISOString(),
        status: c.status,
        coachName: `${c.coach.firstName} ${c.coach.lastName || ''}`.trim()
      })),
      pagination: paginationMeta(total, page, pageSize)
    };
  }

  /**
   * Shared `where` for the admin demo/batch class lists (AUDIT H26): the
   * `isDemo` discriminator plus optional status filter and a free-text search
   * over the class fields and the assigned coach's name.
   */
  private buildClassListWhere(
    isDemo: boolean,
    status: string | undefined,
    search: string
  ): Prisma.CoachClassWhereInput {
    const where: Prisma.CoachClassWhereInput = { isDemo };
    if (status && status !== 'ALL') {
      where.status = status as Prisma.CoachClassWhereInput['status'];
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

  async getDemoClassDetails(_adminId: string, classId: string) {
    const existingClass = await this.prisma.coachClass.findUnique({
      where: { id: classId, isDemo: true },
      include: {
        coach: true,
        liveSession: true,
        demoRegistrations: { orderBy: { createdAt: 'desc' } }
      }
    });

    if (!existingClass) {
      throw new NotFoundException("Demo class not found");
    }

    return {
      class: {
        id: existingClass.id,
        topic: existingClass.topic,
        description: existingClass.description,
        startsAt: existingClass.startsAt.toISOString(),
        endsAt: existingClass.endsAt.toISOString(),
        status: existingClass.status,
        coachName: `${existingClass.coach.firstName} ${existingClass.coach.lastName || ''}`.trim(),
        actualStartsAt: existingClass.liveSession?.startedAt?.toISOString() || null,
        actualEndsAt: existingClass.liveSession?.endedAt?.toISOString() || null,
        registrations: existingClass.demoRegistrations.map((r) => ({
          name: r.name,
          contactMethod: r.contactMethod,
          contact: r.contactMethod === 'EMAIL' ? (r.email ?? r.contactValue) : (r.phoneNumber ?? r.contactValue),
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
          coach: true,
          batch: {
            include: { students: true }
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
        studentCount: c.batch?.students?.length || 0,
        coachName: `${c.coach.firstName} ${c.coach.lastName || ''}`.trim(),
        hasRecording: !!c.liveSession?.recordingUrl,
      }))
    };
  }

  async getBatchClassDetails(_adminId: string, classId: string) {
    const existingClass = await this.prisma.coachClass.findUnique({
      where: { id: classId, isDemo: false },
      include: {
        coach: true,
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
      studentCount: existingClass.batch?.students?.length || 0,
      coachName: `${existingClass.coach.firstName} ${existingClass.coach.lastName || ''}`.trim(),
      actualStartsAt: existingClass.liveSession?.startedAt ? existingClass.liveSession.startedAt.toISOString() : null,
      actualEndsAt: existingClass.liveSession?.endedAt ? existingClass.liveSession.endedAt.toISOString() : null,
      hasRecording: !!existingClass.liveSession?.recordingUrl,
      participants
    };

    return { class: classDetails };
  }
}

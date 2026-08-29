import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { PendingCoachesResponse, UpdateCoachStatusRequest, CreateDemoClassRequest, UpdateDemoClassRequest } from '@nexa-chess/types';
import { UserStatus } from '@prisma/client';
import { getDevEnvironmentInfo } from '@nexa-chess/utils';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  getDevStatus() {
    return {
      status: 'ok',
      service: 'api',
      env: getDevEnvironmentInfo()
    };
  }

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
      // Update the user's status globally
      let userStatus: UserStatus = 'ACTIVE';
      if (data.status === 'ARCHIVED') {
        userStatus = 'ARCHIVED';
      } else if (data.status === 'DELETED') {
        userStatus = 'DELETED';
      }

      await tx.user.update({
        where: { id: coachId },
        data: { status: userStatus }
      });

      // Update the coach profile specifically
      await tx.coachProfile.update({
        where: { userId: coachId },
        data: {
          approvalStatus: data.status,
          approvedById: adminId,
          approvedAt: new Date()
        }
      });
    });

    return { ok: true };
  }

  async createDemoClass(_adminId: string, data: CreateDemoClassRequest) {
    const coach = await this.prisma.user.findUnique({
      where: { id: data.coachId }
    });

    if (!coach || coach.role !== 'COACH') {
      throw new NotFoundException("Coach not found");
    }

    const startsAt = new Date(data.startsAt);
    const endsAt = new Date(data.endsAt);

    // Check for overlapping classes for this coach
    const conflicting = await this.prisma.coachClass.findFirst({
      where: {
        coachId: data.coachId,
        status: { in: ['SCHEDULED', 'LIVE'] },
        // Two ranges overlap when: existingStart < newEnd AND existingEnd > newStart
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
      select: { topic: true, startsAt: true, endsAt: true }
    });

    if (conflicting) {
      const fmt = (d: Date) => d.toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      throw new ConflictException(
        `Coach already has a class "${conflicting.topic || 'Untitled'}" scheduled from ${fmt(conflicting.startsAt)} to ${fmt(conflicting.endsAt)}. Please choose a different time.`
      );
    }

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
      if (!coach || coach.role !== 'COACH') {
        throw new NotFoundException("Coach not found");
      }
    }

    const startsAt = data.startsAt ? new Date(data.startsAt) : existingClass.startsAt;
    const endsAt = data.endsAt ? new Date(data.endsAt) : existingClass.endsAt;
    const coachId = data.coachId || existingClass.coachId;

    if (data.startsAt || data.endsAt || data.coachId) {
      // Check for overlapping classes for this coach, excluding the current class
      const conflicting = await this.prisma.coachClass.findFirst({
        where: {
          id: { not: classId },
          coachId: coachId,
          status: { in: ['SCHEDULED', 'LIVE'] },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
        select: { topic: true, startsAt: true, endsAt: true }
      });

      if (conflicting) {
        const fmt = (d: Date) => d.toLocaleString('en-US', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
        throw new ConflictException(
          `Coach already has a class "${conflicting.topic || 'Untitled'}" scheduled from ${fmt(conflicting.startsAt)} to ${fmt(conflicting.endsAt)}. Please choose a different time.`
        );
      }
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

  async cancelDemoClass(_adminId: string, classId: string) {
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
        cancelledAt: new Date()
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
    const conflicting = await this.prisma.coachClass.findFirst({
      where: {
        coachId: existingClass.coachId,
        id: { not: classId },
        status: { in: ['SCHEDULED', 'LIVE'] },
        OR: [
          {
            startsAt: { lt: existingClass.endsAt },
            endsAt: { gt: existingClass.startsAt }
          }
        ]
      }
    });

    if (conflicting) {
      const fmt = (d: Date) => d.toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      throw new ConflictException(
        `Cannot restore: Coach already has a class "${conflicting.topic || 'Untitled'}" scheduled from ${fmt(conflicting.startsAt)} to ${fmt(conflicting.endsAt)}.`
      );
    }

    const restoredClass = await this.prisma.coachClass.update({
      where: { id: classId },
      data: {
        status: 'SCHEDULED',
        cancelledAt: null
      }
    });

    return { class: restoredClass };
  }

  async listDemoClasses() {
    const classes = await this.prisma.coachClass.findMany({
      where: { isDemo: true },
      include: { coach: true },
      orderBy: { startsAt: 'desc' }
    });

    return {
      classes: classes.map(c => ({
        id: c.id,
        topic: c.topic,
        description: c.description,
        startsAt: c.startsAt.toISOString(),
        endsAt: c.endsAt.toISOString(),
        status: c.status,
        coachName: `${c.coach.firstName} ${c.coach.lastName || ''}`.trim()
      }))
    };
  }

  async getDemoClassDetails(_adminId: string, classId: string) {
    const existingClass = await this.prisma.coachClass.findUnique({
      where: { id: classId, isDemo: true },
      include: {
        coach: true,
        liveSession: true
      }
    });

    if (!existingClass) {
      throw new NotFoundException("Demo class not found");
    }

    const metadata = (existingClass.liveSession?.metadata as Record<string, any>) || {};
    const participants = metadata.participants || [];

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
        participants
      }
    };
  }

  async listBatchClasses() {
    const classes = await this.prisma.coachClass.findMany({
      where: { isDemo: false },
      include: { 
        coach: true,
        batch: {
          include: { students: true }
        },
        liveSession: true
      },
      orderBy: { startsAt: 'desc' }
    });

    return {
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
      joinedAt: a.joinedAt ? a.joinedAt.toISOString() : existingClass.createdAt.toISOString()
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
      participants
    };

    return { class: classDetails };
  }
}

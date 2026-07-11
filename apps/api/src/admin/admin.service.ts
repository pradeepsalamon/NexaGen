import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { PendingCoachesResponse, UpdateCoachStatusRequest } from '@nexa-gen/types';
import { UserStatus } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

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
}

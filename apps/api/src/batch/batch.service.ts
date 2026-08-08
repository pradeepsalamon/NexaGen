import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { getApiEnv } from "@nexa-chess/config/api";
import type {
  Batch,
  BatchAssignableUsersResponse,
  BatchListResponse,
  BatchResponse,
  BatchUserSummary,
  CreateBatchRequest,
  UpdateBatchRequest
} from "@nexa-chess/types";
import {
  BatchStatus,
  Prisma,
  User,
  UserRole,
  UserStatus
} from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { AccessTokenPayload } from "../auth/types";
import { TrashRepository } from "../trash/trash.repository";

type AuthenticatedUser = Pick<User, "id" | "email" | "role" | "status">;
type BatchWithAssignments = Prisma.BatchGetPayload<{
  include: typeof batchInclude;
}>;

const batchInclude = {
  coaches: {
    include: {
      coach: true
    },
    where: {
      coach: { isDeleted: false }
    },
    orderBy: {
      assignedAt: "asc"
    }
  },
  students: {
    include: {
      student: true
    },
    where: {
      student: { isDeleted: false }
    },
    orderBy: {
      enrolledAt: "asc"
    }
  }
} satisfies Prisma.BatchInclude;

@Injectable()
export class BatchService {
  private readonly env = getApiEnv();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly trashRepository: TrashRepository
  ) { }

  async list(accessToken: string | undefined): Promise<BatchListResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    const batches = await this.prisma.batch.findMany({
      include: batchInclude,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      where: this.getBatchVisibilityWhere(user)
    });

    return { batches: batches.map((batch) => this.toBatch(batch)) };
  }

  async getAssignableUsers(
    accessToken: string | undefined
  ): Promise<BatchAssignableUsersResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertCanManageBatches(user);

    const [coaches, students] = await Promise.all([
      this.prisma.user.findMany({
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        where: {
          role: UserRole.COACH,
          status: UserStatus.ACTIVE
        }
      }),
      this.prisma.user.findMany({
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
        where: {
          role: UserRole.STUDENT,
          status: UserStatus.ACTIVE
        }
      })
    ]);

    return {
      coaches: coaches.map((coach) => this.toBatchUser(coach)),
      students: students.map((student) => this.toBatchUser(student))
    };
  }

  async getById(
    accessToken: string | undefined,
    batchId: string
  ): Promise<BatchResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    const batch = await this.prisma.batch.findFirst({
      include: batchInclude,
      where: {
        id: batchId,
        ...this.getBatchVisibilityWhere(user)
      }
    });

    if (!batch) {
      throw new NotFoundException("Batch not found.");
    }

    return { batch: this.toBatch(batch) };
  }

  async create(
    accessToken: string | undefined,
    payload: CreateBatchRequest
  ): Promise<BatchResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertCanManageBatches(user);
    this.assertDateRange(payload.startsAt, payload.endsAt);
    await this.assertAssignableUsers(payload.coachIds ?? [], payload.studentIds ?? []);

    const batch = await this.prisma.batch.create({
      data: {
        createdById: user.id,
        description: this.toNullableString(payload.description),
        endsAt: this.toNullableDate(payload.endsAt),
        name: payload.name.trim(),
        scheduleNotes: this.toNullableString(payload.scheduleNotes),
        startsAt: this.toNullableDate(payload.startsAt),
        status: payload.status ?? BatchStatus.ACTIVE,
        coaches: {
          create: (payload.coachIds ?? []).map((coachId) => ({ coachId }))
        },
        students: {
          create: (payload.studentIds ?? []).map((studentId) => ({ studentId }))
        }
      },
      include: batchInclude
    });

    return { batch: this.toBatch(batch) };
  }

  async update(
    accessToken: string | undefined,
    batchId: string,
    payload: UpdateBatchRequest
  ): Promise<BatchResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertCanManageBatches(user);
    this.assertDateRange(payload.startsAt, payload.endsAt);

    const existingBatch = await this.prisma.batch.findUnique({
      where: { id: batchId }
    });

    if (!existingBatch) {
      throw new NotFoundException("Batch not found.");
    }

    await this.assertAssignableUsers(payload.coachIds, payload.studentIds);

    const batch = await this.prisma.$transaction(async (transaction) => {
      await transaction.batch.update({
        data: {
          description:
            payload.description === undefined
              ? undefined
              : this.toNullableString(payload.description),
          endsAt:
            payload.endsAt === undefined
              ? undefined
              : this.toNullableDate(payload.endsAt),
          name: payload.name?.trim(),
          scheduleNotes:
            payload.scheduleNotes === undefined
              ? undefined
              : this.toNullableString(payload.scheduleNotes),
          startsAt:
            payload.startsAt === undefined
              ? undefined
              : this.toNullableDate(payload.startsAt),
          status: payload.status
        },
        where: { id: batchId }
      });

      if (payload.coachIds) {
        await transaction.batchCoach.updateMany({
          data: {
            deletedAt: new Date(),
            deletedById: user.id,
            isDeleted: true
          },
          where: { batchId }
        });
        await Promise.all(
          payload.coachIds.map((coachId) =>
            transaction.batchCoach.upsert({
              create: { batchId, coachId },
              update: {
                deletedAt: null,
                deletedById: null,
                isDeleted: false
              },
              where: { batchId_coachId: { batchId, coachId } }
            })
          )
        );
      }

      if (payload.studentIds) {
        await transaction.batchStudent.updateMany({
          data: {
            deletedAt: new Date(),
            deletedById: user.id,
            isDeleted: true
          },
          where: { batchId }
        });
        await Promise.all(
          payload.studentIds.map((studentId) =>
            transaction.batchStudent.upsert({
              create: { batchId, studentId },
              update: {
                deletedAt: null,
                deletedById: null,
                isDeleted: false
              },
              where: { batchId_studentId: { batchId, studentId } }
            })
          )
        );
      }

      return transaction.batch.findUniqueOrThrow({
        include: batchInclude,
        where: { id: batchId }
      });
    });

    return { batch: this.toBatch(batch) };
  }

  async archive(
    accessToken: string | undefined,
    batchId: string
  ): Promise<BatchResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertCanManageBatches(user);

    const batch = await this.prisma.batch.update({
      data: { status: BatchStatus.ARCHIVED },
      include: batchInclude,
      where: { id: batchId }
    });

    return { batch: this.toBatch(batch) };
  }

  async restore(
    accessToken: string | undefined,
    batchId: string
  ): Promise<BatchResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertCanManageBatches(user);

    const batch = await this.prisma.batch.update({
      data: { status: BatchStatus.ACTIVE },
      include: batchInclude,
      where: { id: batchId }
    });

    return { batch: this.toBatch(batch) };
  }

  async delete(accessToken: string | undefined, batchId: string) {
    const user = await this.getAuthenticatedUser(accessToken);
    this.assertCanManageBatches(user);

    await this.prisma.$transaction((transaction) =>
      this.trashRepository.softDelete(transaction, "Batch", batchId, user.id)
    );

    return { ok: true };
  }

  private async getAuthenticatedUser(accessToken: string | undefined) {
    if (!accessToken) {
      throw new UnauthorizedException("Access token is missing.");
    }

    const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
      accessToken,
      { secret: this.env.JWT_ACCESS_SECRET }
    );

    if (payload.type !== "access") {
      throw new UnauthorizedException("Invalid token type.");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub }
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("Invalid session.");
    }

    return user;
  }

  private assertCanManageBatches(user: AuthenticatedUser) {
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("You cannot manage batches.");
    }
  }

  private getBatchVisibilityWhere(user: AuthenticatedUser): Prisma.BatchWhereInput {
    if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) {
      return {};
    }

    if (user.role === UserRole.COACH) {
      return { coaches: { some: { coachId: user.id, isDeleted: false } } };
    }

    return { students: { some: { isDeleted: false, studentId: user.id } } };
  }

  private async assertAssignableUsers(coachIds?: string[], studentIds?: string[]) {
    const uniqueCoachIds = [...new Set(coachIds ?? [])];
    const uniqueStudentIds = [...new Set(studentIds ?? [])];

    const [coachCount, studentCount] = await Promise.all([
      uniqueCoachIds.length
        ? this.prisma.user.count({
          where: {
            id: { in: uniqueCoachIds },
            role: UserRole.COACH,
            status: UserStatus.ACTIVE
          }
        })
        : 0,
      uniqueStudentIds.length
        ? this.prisma.user.count({
          where: {
            id: { in: uniqueStudentIds },
            role: UserRole.STUDENT,
            status: UserStatus.ACTIVE
          }
        })
        : 0
    ]);

    if (coachCount !== uniqueCoachIds.length) {
      throw new BadRequestException("One or more coach IDs are invalid.");
    }

    if (studentCount !== uniqueStudentIds.length) {
      throw new BadRequestException("One or more student IDs are invalid.");
    }
  }

  private assertDateRange(startsAt?: string, endsAt?: string) {
    if (!startsAt || !endsAt) {
      return;
    }

    const start = new Date(startsAt).getTime();
    const end = new Date(endsAt).getTime();

    if (Number.isNaN(start) || Number.isNaN(end) || start > end) {
      throw new BadRequestException("End date must be after start date.");
    }
  }

  private toBatch(batch: BatchWithAssignments): Batch {
    return {
      coachCount: batch.coaches.length,
      coaches: batch.coaches.map((assignment) =>
        this.toBatchUser(assignment.coach)
      ),
      createdAt: batch.createdAt.toISOString(),
      description: batch.description,
      endsAt: batch.endsAt?.toISOString() ?? null,
      id: batch.id,
      name: batch.name,
      scheduleNotes: batch.scheduleNotes,
      startsAt: batch.startsAt?.toISOString() ?? null,
      status: batch.status,
      studentCount: batch.students.length,
      students: batch.students.map((assignment) =>
        this.toBatchUser(assignment.student)
      ),
      updatedAt: batch.updatedAt.toISOString()
    };
  }

  private toBatchUser(user: User): BatchUserSummary {
    return {
      email: user.email,
      firstName: user.firstName,
      id: user.id,
      lastName: user.lastName,
      role: user.role
    };
  }

  private toNullableString(value: string | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private toNullableDate(value: string | undefined) {
    const trimmed = value?.trim();
    return trimmed ? new Date(trimmed) : null;
  }
}

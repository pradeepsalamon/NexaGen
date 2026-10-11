import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type {
  Batch,
  BatchAssignableUsersResponse,
  BatchListResponse,
  BatchResponse,
  BatchUserSummary,
  CreateBatchRequest,
  PaginatedQuery,
  UpdateBatchRequest
} from "@nexa-chess/types";
import {
  BatchStatus,
  ClassStatus,
  Prisma,
  User,
  UserRole,
  UserStatus
} from "@prisma/client";
import {
  paginationMeta,
  resolveOrderBy,
  resolvePagination
} from "../common/pagination";
import { PrismaService } from "../prisma/prisma.service";
import { TrashRepository } from "../trash/trash.repository";
import { authenticateUser } from "../auth/authenticate";
import { batchClassWindow } from "../common/batch-dates";

type AuthenticatedUser = Pick<User, "id" | "email" | "role" | "status">;
/** The client handed to a `prisma.$transaction(async (tx) => …)` callback. */
type PrismaTx = Parameters<Parameters<PrismaService["$transaction"]>[0]>[0];
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

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly trashRepository: TrashRepository
  ) { }

  async list(
    accessToken: string | undefined,
    query?: PaginatedQuery & { status?: string }
  ): Promise<BatchListResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    const { page, pageSize, skip, take, search } = resolvePagination(query);

    const where: Prisma.BatchWhereInput = { ...this.getBatchVisibilityWhere(user) };
    if (query?.status && query.status !== "ALL") {
      where.status = query.status as BatchStatus;
    }
    if (search) {
      // `AND` so this can't clobber an `OR` the visibility filter might add.
      where.AND = [
        {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } }
          ]
        }
      ];
    }

    const orderBy = resolveOrderBy(
      query,
      ["name", "status", "createdAt", "startsAt"] as const,
      [{ status: "asc" }, { name: "asc" }]
    ) as Prisma.BatchOrderByWithRelationInput | Prisma.BatchOrderByWithRelationInput[];

    const [batches, total] = await Promise.all([
      this.prisma.batch.findMany({ include: batchInclude, orderBy, where, skip, take }),
      this.prisma.batch.count({ where })
    ]);

    return {
      batches: batches.map((batch) => this.toBatch(batch)),
      pagination: paginationMeta(total, page, pageSize)
    };
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
        batchType: payload.batchType ?? null,
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
    // Changing one end alone must still leave a valid range.
    this.assertDateRange(
      payload.startsAt === undefined ? existingBatch.startsAt?.toISOString() : payload.startsAt,
      payload.endsAt === undefined ? existingBatch.endsAt?.toISOString() : payload.endsAt
    );

    await this.assertAssignableUsers(payload.coachIds, payload.studentIds);

    const batch = await this.prisma.$transaction(async (transaction) => {
      await transaction.batch.update({
        data: {
          // null clears the default (derive from roster size); undefined leaves it.
          batchType: payload.batchType,
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

      const updated = await transaction.batch.findUniqueOrThrow({
        include: batchInclude,
        where: { id: batchId }
      });

      if (payload.startsAt !== undefined || payload.endsAt !== undefined) {
        await this.cancelClassesOutsideDates(transaction, updated, user.id);
      }

      return updated;
    });

    return { batch: this.toBatch(batch) };
  }

  /**
   * Narrowing a batch's dates cancels its sessions that have not happened yet
   * and now fall outside them, so the batch's dates and its timetable agree.
   * Only future SCHEDULED classes move — anything held, live or already
   * cancelled is history and stays as it is. Cancelled, not deleted, so the
   * admin can restore one from the schedule if the dates were a mistake.
   */
  private async cancelClassesOutsideDates(
    transaction: PrismaTx,
    batch: { id: string; startsAt: Date | null; endsAt: Date | null },
    userId: string
  ) {
    const { from, until } = batchClassWindow(batch);
    const outside: Prisma.CoachClassWhereInput[] = [
      ...(from ? [{ startsAt: { lt: from } }] : []),
      ...(until ? [{ startsAt: { gte: until } }] : [])
    ];
    if (outside.length === 0) return;

    await transaction.coachClass.updateMany({
      data: {
        cancellationReason: "Outside the batch's dates",
        cancelledAt: new Date(),
        cancelledById: userId,
        status: ClassStatus.CANCELLED
      },
      where: {
        batchId: batch.id,
        OR: outside,
        startsAt: { gt: new Date() },
        status: ClassStatus.SCHEDULED
      }
    });
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

    // Retire the batch together with its coach/student assignments in one group
    // so a later restore brings the roster back too (AUDIT M13).
    await this.prisma.$transaction((transaction) =>
      this.trashRepository.cascadeSoftDelete(transaction, "Batch", batchId, user.id)
    );

    return { ok: true };
  }

  private getAuthenticatedUser(accessToken: string | undefined) {
    return authenticateUser(this.jwtService, this.prisma, accessToken);
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
      batchType: batch.batchType,
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

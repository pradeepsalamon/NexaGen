import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type {
  ClassChangeRequestDto,
  ClassChangeRequestListResponse,
  ClassChangeRequestResponse,
  ClassRequestStatus,
  CreateClassChangeRequest,
  ReviewClassChangeRequest
} from "@nexa-chess/types";
import { ClassStatus, Prisma, UserRole } from "@prisma/client";
import { assertNoSchedulingConflict, assertNotInPast } from "../coach/class-scheduling.util";
import { MessagingDispatchService } from "../messaging/messaging-dispatch.service";
import { PrismaService } from "../prisma/prisma.service";
import { authenticateUser } from "../auth/authenticate";

const requestInclude = {
  batch: { select: { name: true } },
  coach: { select: { firstName: true, lastName: true } },
  reviewedBy: { select: { firstName: true, lastName: true } }
} satisfies Prisma.ClassChangeRequestInclude;

type RequestRow = Prisma.ClassChangeRequestGetPayload<{ include: typeof requestInclude }>;

type AuthenticatedUser = { id: string; role: UserRole; timezone: string | null };

const fullName = (u: { firstName: string; lastName: string | null }) =>
  `${u.firstName} ${u.lastName ?? ""}`.trim();

@Injectable()
export class ClassRequestService {

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingDispatchService
  ) {}

  /** Coaches see their own requests; admins see everyone's. */
  async list(
    accessToken: string | undefined,
    status?: ClassRequestStatus
  ): Promise<ClassChangeRequestListResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    const where: Prisma.ClassChangeRequestWhereInput = {
      ...(this.isAdmin(user) ? {} : { coachId: this.assertCoach(user).id }),
      ...(status ? { status } : {})
    };
    const rows = await this.prisma.classChangeRequest.findMany({
      where,
      include: requestInclude,
      orderBy: [{ createdAt: "desc" }],
      take: 200
    });
    return { requests: rows.map((row) => this.toDto(row)) };
  }

  async create(
    accessToken: string | undefined,
    dto: CreateClassChangeRequest
  ): Promise<ClassChangeRequestResponse> {
    const coach = this.assertCoach(await this.getAuthenticatedUser(accessToken));
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    assertNotInPast(startsAt);

    let batchId: string;
    let classId: string | null = null;
    let original: { startsAt: Date; endsAt: Date } | null = null;

    if (dto.type === "RESCHEDULE") {
      const cls = await this.prisma.coachClass.findUnique({ where: { id: dto.classId! } });
      if (!cls || cls.coachId !== coach.id || !cls.batchId) {
        throw new NotFoundException("Class not found.");
      }
      if (cls.status !== ClassStatus.SCHEDULED) {
        throw new ConflictException("Only a scheduled class can be rescheduled.");
      }
      batchId = cls.batchId;
      classId = cls.id;
      original = { startsAt: cls.startsAt, endsAt: cls.endsAt };
    } else {
      await this.assertCoachInBatch(coach.id, dto.batchId!);
      batchId = dto.batchId!;
    }

    // Surface an obvious clash now; approval checks again against the schedule then.
    await assertNoSchedulingConflict(this.prisma, {
      coachId: coach.id,
      startsAt,
      endsAt,
      excludeClassId: classId ?? undefined,
      timeZone: coach.timezone ?? undefined
    });

    try {
      const row = await this.prisma.classChangeRequest.create({
        data: {
          batchId,
          classId,
          coachId: coach.id,
          endsAt,
          originalEndsAt: original?.endsAt ?? null,
          originalStartsAt: original?.startsAt ?? null,
          reason: dto.reason,
          startsAt,
          topic: dto.topic || null,
          type: dto.type
        },
        include: requestInclude
      });
      return { request: this.toDto(row) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("This class already has a pending reschedule request.");
      }
      throw error;
    }
  }

  async withdraw(accessToken: string | undefined, id: string): Promise<ClassChangeRequestResponse> {
    const coach = this.assertCoach(await this.getAuthenticatedUser(accessToken));
    const existing = await this.prisma.classChangeRequest.findUnique({ where: { id } });
    if (!existing || existing.coachId !== coach.id) throw new NotFoundException("Request not found.");
    await this.transitionFromPending(id, { status: "WITHDRAWN" });
    return { request: await this.load(id) };
  }

  async reject(
    accessToken: string | undefined,
    id: string,
    dto: ReviewClassChangeRequest
  ): Promise<ClassChangeRequestResponse> {
    const admin = this.assertAdmin(await this.getAuthenticatedUser(accessToken));
    await this.transitionFromPending(id, {
      reviewNote: dto.note || null,
      reviewedAt: new Date(),
      reviewedById: admin.id,
      status: "REJECTED"
    });
    return { request: await this.load(id) };
  }

  /**
   * Applies the change and marks the request APPROVED in one transaction. The
   * status-filtered update is the double-approval guard: a second click finds
   * nothing PENDING and gets a 409 instead of a second class.
   */
  async approve(
    accessToken: string | undefined,
    id: string,
    dto: ReviewClassChangeRequest
  ): Promise<ClassChangeRequestResponse> {
    const admin = this.assertAdmin(await this.getAuthenticatedUser(accessToken));
    const request = await this.prisma.classChangeRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundException("Request not found.");
    if (request.status !== "PENDING") {
      throw new ConflictException(`This request was already ${request.status.toLowerCase()}.`);
    }
    assertNotInPast(request.startsAt);

    const createdClassId = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.classChangeRequest.updateMany({
        where: { id, status: "PENDING" },
        data: {
          reviewNote: dto.note || null,
          reviewedAt: new Date(),
          reviewedById: admin.id,
          status: "APPROVED"
        }
      });
      if (claimed.count === 0) throw new ConflictException("This request was already decided.");

      await assertNoSchedulingConflict(tx as unknown as PrismaService, {
        coachId: request.coachId,
        startsAt: request.startsAt,
        endsAt: request.endsAt,
        excludeClassId: request.classId ?? undefined,
        timeZone: admin.timezone ?? undefined
      });

      if (request.type === "RESCHEDULE") {
        const moved = await tx.coachClass.updateMany({
          where: { id: request.classId ?? "", status: ClassStatus.SCHEDULED },
          data: { startsAt: request.startsAt, endsAt: request.endsAt }
        });
        if (moved.count === 0) {
          throw new ConflictException("The class is no longer scheduled, so it can't be moved.");
        }
        return null;
      }

      const cls = await tx.coachClass.create({
        data: {
          batchId: request.batchId,
          coachId: request.coachId,
          endsAt: request.endsAt,
          startsAt: request.startsAt,
          topic: request.topic
        }
      });
      await tx.classChangeRequest.update({ where: { id }, data: { classId: cls.id } });
      return cls.id;
    });

    if (createdClassId) {
      this.messaging.dispatchInBackground({ event: "CLASS_SCHEDULED", classId: createdClassId });
    }

    return { request: await this.load(id) };
  }

  private async transitionFromPending(id: string, data: Prisma.ClassChangeRequestUncheckedUpdateManyInput) {
    const result = await this.prisma.classChangeRequest.updateMany({
      where: { id, status: "PENDING" },
      data
    });
    if (result.count === 0) {
      const exists = await this.prisma.classChangeRequest.findUnique({ where: { id }, select: { id: true } });
      if (!exists) throw new NotFoundException("Request not found.");
      throw new ConflictException("This request was already decided.");
    }
  }

  private async load(id: string): Promise<ClassChangeRequestDto> {
    const row = await this.prisma.classChangeRequest.findUniqueOrThrow({
      where: { id },
      include: requestInclude
    });
    return this.toDto(row);
  }

  private toDto(row: RequestRow): ClassChangeRequestDto {
    return {
      batchId: row.batchId,
      batchName: row.batch.name,
      classId: row.classId,
      coachId: row.coachId,
      coachName: fullName(row.coach),
      createdAt: row.createdAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      id: row.id,
      originalEndsAt: row.originalEndsAt?.toISOString() ?? null,
      originalStartsAt: row.originalStartsAt?.toISOString() ?? null,
      reason: row.reason,
      reviewNote: row.reviewNote,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      reviewedByName: row.reviewedBy ? fullName(row.reviewedBy) : null,
      startsAt: row.startsAt.toISOString(),
      status: row.status,
      topic: row.topic,
      type: row.type
    };
  }

  private async assertCoachInBatch(coachId: string, batchId: string) {
    const link = await this.prisma.batchCoach.findFirst({
      where: { batchId, coachId, isDeleted: false, batch: { isDeleted: false } },
      select: { id: true }
    });
    if (!link) throw new ForbiddenException("You are not assigned to this batch.");
  }

  private isAdmin(user: AuthenticatedUser) {
    return user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN;
  }

  private assertAdmin(user: AuthenticatedUser) {
    if (!this.isAdmin(user)) throw new ForbiddenException("Only an admin can review class requests.");
    return user;
  }

  private assertCoach(user: AuthenticatedUser) {
    if (user.role !== UserRole.COACH) throw new ForbiddenException("Only coaches can make class requests.");
    return user;
  }

  private getAuthenticatedUser(accessToken: string | undefined): Promise<AuthenticatedUser> {
    return authenticateUser(this.jwtService, this.prisma, accessToken);
  }
}

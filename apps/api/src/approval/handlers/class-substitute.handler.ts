import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { classSubstitutePayloadSchema, type ClassSubstitutePayload } from "@nexa-chess/types";
import { BatchStatus, ClassStatus, UserRole, UserStatus, type ApprovalRequest } from "@prisma/client";
import { assertNoSchedulingConflict } from "../../coach/class-scheduling.util";
import { MessagingDispatchService } from "../../messaging/messaging-dispatch.service";
import type { PrismaService, PrismaTransactionClient } from "../../prisma/prisma.service";
import type { ApprovalActor, ApprovalHandler, PreparedApproval } from "../approval-handler";

const HOUR = 3_600_000;
const URGENT_WITHIN_HOURS = 6;

const asClient = (tx: PrismaTransactionClient) => tx as unknown as PrismaService;

const activeCoach = { isDeleted: false, role: UserRole.COACH, status: UserStatus.ACTIVE } as const;

/**
 * `CLASS_SUBSTITUTE_COACH`: a coach asks for a colleague to take one of their
 * upcoming classes. Approval makes the colleague the class's coach, for that one
 * class: they aren't added to the batch, and they're paid for the class because
 * payroll follows `CoachClass.coachId`. Regenerating a recurring schedule
 * re-creates its future classes with the schedule's coach.
 */
@Injectable()
export class ClassSubstituteHandler implements ApprovalHandler<ClassSubstitutePayload> {
  readonly actionType = "CLASS_SUBSTITUTE_COACH" as const;
  readonly payloadSchema = classSubstitutePayloadSchema;

  constructor(private readonly messaging: MessagingDispatchService) {}

  async prepare(
    tx: PrismaTransactionClient,
    requester: ApprovalActor,
    payload: ClassSubstitutePayload
  ): Promise<PreparedApproval> {
    const cls = await tx.coachClass.findUnique({
      select: {
        batch: { select: { isDeleted: true, status: true } },
        batchId: true,
        coachId: true,
        endsAt: true,
        id: true,
        startsAt: true,
        status: true
      },
      where: { id: payload.classId }
    });
    if (!cls || cls.coachId !== requester.id || !cls.batchId) throw new NotFoundException("Class not found.");
    if (cls.status !== ClassStatus.SCHEDULED || cls.startsAt.getTime() <= Date.now()) {
      throw new ConflictException("Only an upcoming class can be handed to another coach.");
    }
    if (!cls.batch || cls.batch.isDeleted || cls.batch.status === BatchStatus.ARCHIVED) {
      throw new ConflictException("This class belongs to an archived batch.");
    }
    if (payload.substituteCoachId === requester.id) {
      throw new ForbiddenException("Choose a different coach.");
    }
    const substitute = await tx.user.findFirst({
      select: { firstName: true, lastName: true, timezone: true },
      where: { id: payload.substituteCoachId, ...activeCoach }
    });
    if (!substitute) throw new NotFoundException("Coach not found.");
    // Surface an obvious clash now; approval checks again against the schedule then.
    await assertNoSchedulingConflict(asClient(tx), {
      coachId: payload.substituteCoachId,
      endsAt: cls.endsAt,
      excludeClassId: cls.id,
      startsAt: cls.startsAt,
      timeZone: requester.timezone ?? undefined
    }).catch(() => {
      throw new ConflictException("That coach already has a class at this time. Choose someone else.");
    });

    return {
      batchId: cls.batchId,
      classId: cls.id,
      currentValue: { startsAt: cls.startsAt.toISOString(), status: cls.status },
      dedupeKey: `CLASS_SUBSTITUTE_COACH:${cls.id}`,
      expiresAt: cls.startsAt,
      requestedValue: {
        substituteName: `${substitute.firstName} ${substitute.lastName ?? ""}`.trim()
      },
      subjectUserId: payload.substituteCoachId,
      urgent: cls.startsAt.getTime() - Date.now() < URGENT_WITHIN_HOURS * HOUR
    };
  }

  async revalidate(tx: PrismaTransactionClient, request: ApprovalRequest): Promise<void> {
    const { classId, subjectUserId: substituteId } = request;
    if (!classId || !substituteId) throw new ConflictException("This request is incomplete. Reject it.");
    // Hold the class: a start, cancel or move waits for this decision.
    await tx.$queryRaw`SELECT "id" FROM "classes" WHERE "id" = ${classId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${substituteId} FOR SHARE`;

    const cls = await tx.coachClass.findUnique({
      select: {
        coach: { select: { isDeleted: true, role: true, status: true } },
        coachId: true,
        endsAt: true,
        startsAt: true,
        status: true
      },
      where: { id: classId }
    });
    if (!cls) throw new ConflictException("The class no longer exists. Reject this request.");
    if (
      cls.coachId !== request.requesterId ||
      cls.coach.isDeleted ||
      cls.coach.role !== UserRole.COACH ||
      cls.coach.status !== UserStatus.ACTIVE
    ) {
      throw new ConflictException("The class is no longer this coach's (or the coach is inactive). Reject this request.");
    }
    if (cls.status !== ClassStatus.SCHEDULED || cls.startsAt.getTime() <= Date.now()) {
      throw new ConflictException("The class has started or was cancelled. Reject this request.");
    }
    const asked = (request.currentValue as { startsAt?: unknown } | null)?.startsAt;
    if (asked !== cls.startsAt.toISOString()) {
      throw new ConflictException("The class was moved after this request was made. Reject it and ask again.");
    }
    const substitute = await tx.user.findFirst({
      select: { timezone: true },
      where: { id: substituteId, ...activeCoach }
    });
    if (!substitute) throw new ConflictException("The other coach is no longer active. Reject this request.");
    await assertNoSchedulingConflict(asClient(tx), {
      coachId: substituteId,
      endsAt: cls.endsAt,
      excludeClassId: classId,
      startsAt: cls.startsAt,
      timeZone: substitute.timezone ?? undefined
    }).catch(() => {
      throw new ConflictException("The other coach now has a class at this time. Reject this request.");
    });
  }

  async execute(tx: PrismaTransactionClient, request: ApprovalRequest) {
    const { count } = await tx.coachClass.updateMany({
      data: { coachId: request.subjectUserId! },
      where: { coachId: request.requesterId!, id: request.classId!, status: ClassStatus.SCHEDULED }
    });
    if (count !== 1) throw new ConflictException("The class changed while this was being approved.");
    return { fromCoachId: request.requesterId, toCoachId: request.subjectUserId };
  }

  afterCommit(request: ApprovalRequest, outcome: "CREATED" | "APPROVED" | "REJECTED" | "CANCELLED") {
    if (outcome === "APPROVED" && request.classId) {
      this.messaging.dispatchInBackground({ classId: request.classId, event: "CLASS_SUBSTITUTE_ASSIGNED" });
    }
  }
}

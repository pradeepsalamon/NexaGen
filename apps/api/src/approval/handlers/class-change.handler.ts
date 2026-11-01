import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  classExtraPayloadSchema,
  classReschedulePayloadSchema,
  readClassTimeValue,
  type ClassExtraPayload,
  type ClassReschedulePayload,
  type ClassTimeValue
} from "@nexa-chess/types";
import { BatchStatus, ClassStatus, UserRole, UserStatus, type ApprovalRequest } from "@prisma/client";
import { assertNoSchedulingConflict, assertNotInPast } from "../../coach/class-scheduling.util";
import { assertWithinBatchDates } from "../../common/batch-dates";
import { MessagingDispatchService } from "../../messaging/messaging-dispatch.service";
import type { PrismaService, PrismaTransactionClient } from "../../prisma/prisma.service";
import type { ApprovalActor, ApprovalHandler, PreparedApproval } from "../approval-handler";

type RescheduleSnapshot = ClassTimeValue & { status: ClassStatus };

/** The extra-class dedupe key; the Stage 5 data migration builds the same string in SQL. */
export const classExtraDedupeKey = (coachId: string, batchId: string, startsAt: Date) =>
  `CLASS_EXTRA:${coachId}:${batchId}:${startsAt.toISOString()}`;
export const classRescheduleDedupeKey = (classId: string) => `CLASS_RESCHEDULE:${classId}`;

const liveBatch = { isDeleted: false, status: { not: BatchStatus.ARCHIVED } } as const;

/** The scheduling helpers take the client type; a transaction client works the same. */
const asClient = (tx: PrismaTransactionClient) => tx as unknown as PrismaService;

async function assertBatchDates(tx: PrismaTransactionClient, batchId: string, startsAt: Date) {
  const batch = await tx.batch.findUnique({
    select: { endsAt: true, name: true, startsAt: true },
    where: { id: batchId }
  });
  if (batch) assertWithinBatchDates(batch, startsAt);
}

/**
 * Re-checks, inside the approval transaction, that the requesting coach is still
 * an ACTIVE coach of a live (not deleted, not archived) batch (V3). The rows are
 * share-locked first, so an archive, batch delete, coach removal or
 * deactivation waits for this transaction instead of landing between the check
 * and the class write. Returns the coach's timezone for the clash message.
 */
export async function assertCoachStillInBatch(
  tx: PrismaTransactionClient,
  coachId: string,
  batchId: string
): Promise<string | null> {
  await tx.$queryRaw`SELECT "id" FROM "batches" WHERE "id" = ${batchId} FOR SHARE`;
  await tx.$queryRaw`
    SELECT "id" FROM "batch_coaches" WHERE "batchId" = ${batchId} AND "coachId" = ${coachId} FOR SHARE`;
  await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${coachId} FOR SHARE`;
  const link = await tx.batchCoach.findFirst({
    select: { coach: { select: { timezone: true } } },
    where: {
      batch: liveBatch,
      batchId,
      coach: { isDeleted: false, role: UserRole.COACH, status: UserStatus.ACTIVE },
      coachId,
      isDeleted: false
    }
  });
  if (!link) {
    throw new ConflictException(
      "The coach is no longer an active coach of this batch (or the batch is archived), so this request can't be approved. Reject it instead."
    );
  }
  return link.coach.timezone;
}

/** Re-runs the time checks at approval: the schedule and batch dates may have moved since. */
async function assertSlotStillFree(
  tx: PrismaTransactionClient,
  params: { batchId: string; coachId: string; excludeClassId?: string; timeZone: string | null; window: ClassTimeValue }
) {
  const startsAt = new Date(params.window.startsAt);
  assertNotInPast(startsAt);
  await assertBatchDates(tx, params.batchId, startsAt);
  await assertNoSchedulingConflict(asClient(tx), {
    coachId: params.coachId,
    endsAt: new Date(params.window.endsAt),
    excludeClassId: params.excludeClassId,
    startsAt,
    timeZone: params.timeZone ?? undefined
  });
}

function storedWindow(request: ApprovalRequest): ClassTimeValue {
  const window = readClassTimeValue(request.requestedValue);
  if (!window) throw new ConflictException("This request has no class time. Reject it.");
  return window;
}

/**
 * `CLASS_EXTRA`: a coach asks for a new class in one of their batches; approval
 * creates it (Stage 5 port of the old extra-class request). One pending request
 * per coach, batch and start time. Expires at the requested start.
 */
@Injectable()
export class ClassExtraHandler implements ApprovalHandler<ClassExtraPayload> {
  readonly actionType = "CLASS_EXTRA" as const;
  readonly payloadSchema = classExtraPayloadSchema;

  constructor(private readonly messaging: MessagingDispatchService) {}

  async prepare(tx: PrismaTransactionClient, requester: ApprovalActor, payload: ClassExtraPayload): Promise<PreparedApproval> {
    const startsAt = new Date(payload.startsAt);
    assertNotInPast(startsAt);
    const link = await tx.batchCoach.findFirst({
      select: { id: true },
      where: { batch: liveBatch, batchId: payload.batchId, coachId: requester.id, isDeleted: false }
    });
    if (!link) throw new ForbiddenException("You are not assigned to this batch.");
    await assertBatchDates(tx, payload.batchId, startsAt);
    // Surface an obvious clash now; approval checks again against the schedule then.
    await assertNoSchedulingConflict(asClient(tx), {
      coachId: requester.id,
      endsAt: new Date(payload.endsAt),
      startsAt,
      timeZone: requester.timezone ?? undefined
    });

    const requested: ClassTimeValue = {
      endsAt: new Date(payload.endsAt).toISOString(),
      startsAt: startsAt.toISOString(),
      topic: payload.topic || null
    };
    return {
      batchId: payload.batchId,
      currentValue: null,
      dedupeKey: classExtraDedupeKey(requester.id, payload.batchId, startsAt),
      expiresAt: startsAt,
      requestedValue: requested
    };
  }

  async revalidate(tx: PrismaTransactionClient, request: ApprovalRequest): Promise<void> {
    if (!request.batchId || !request.requesterId) throw new ConflictException("This request has no batch. Reject it.");
    const timeZone = await assertCoachStillInBatch(tx, request.requesterId, request.batchId);
    await assertSlotStillFree(tx, {
      batchId: request.batchId,
      coachId: request.requesterId,
      timeZone,
      window: storedWindow(request)
    });
  }

  async execute(tx: PrismaTransactionClient, request: ApprovalRequest) {
    const window = storedWindow(request);
    const cls = await tx.coachClass.create({
      data: {
        batchId: request.batchId!,
        coachId: request.requesterId!,
        endsAt: new Date(window.endsAt),
        startsAt: new Date(window.startsAt),
        topic: window.topic ?? null
      },
      select: { id: true }
    });
    // The inbox and the coach's list then show (and link) the class it created.
    await tx.approvalRequest.update({ data: { classId: cls.id }, where: { id: request.id } });
    return { createdClassId: cls.id };
  }

  afterCommit(request: ApprovalRequest, outcome: "CREATED" | "APPROVED" | "REJECTED" | "CANCELLED") {
    const classId = (request.executionResult as { createdClassId?: unknown } | null)?.createdClassId;
    if (outcome === "APPROVED" && typeof classId === "string") {
      this.messaging.dispatchInBackground({ classId, event: "CLASS_SCHEDULED" });
    }
  }
}

/**
 * `CLASS_RESCHEDULE`: a coach asks to move one of their scheduled classes;
 * approval moves it (Stage 5 port of the old reschedule request). One pending
 * request per class. Expires at whichever comes first, the class's current
 * start or the requested one.
 */
@Injectable()
export class ClassRescheduleHandler implements ApprovalHandler<ClassReschedulePayload> {
  readonly actionType = "CLASS_RESCHEDULE" as const;
  readonly payloadSchema = classReschedulePayloadSchema;

  async prepare(
    tx: PrismaTransactionClient,
    requester: ApprovalActor,
    payload: ClassReschedulePayload
  ): Promise<PreparedApproval> {
    const startsAt = new Date(payload.startsAt);
    assertNotInPast(startsAt);
    const cls = await tx.coachClass.findUnique({
      select: { batchId: true, coachId: true, endsAt: true, id: true, startsAt: true, status: true },
      where: { id: payload.classId }
    });
    if (!cls || cls.coachId !== requester.id || !cls.batchId) throw new NotFoundException("Class not found.");
    if (cls.status !== ClassStatus.SCHEDULED) {
      throw new ConflictException("Only a scheduled class can be rescheduled.");
    }
    const batch = await tx.batch.findFirst({ select: { id: true }, where: { id: cls.batchId, ...liveBatch } });
    if (!batch) throw new ConflictException("This class belongs to an archived batch, so it can't be rescheduled.");
    await assertBatchDates(tx, cls.batchId, startsAt);
    await assertNoSchedulingConflict(asClient(tx), {
      coachId: requester.id,
      endsAt: new Date(payload.endsAt),
      excludeClassId: cls.id,
      startsAt,
      timeZone: requester.timezone ?? undefined
    });

    const snapshot: RescheduleSnapshot = {
      endsAt: cls.endsAt.toISOString(),
      startsAt: cls.startsAt.toISOString(),
      status: cls.status
    };
    const requested: ClassTimeValue = {
      endsAt: new Date(payload.endsAt).toISOString(),
      startsAt: startsAt.toISOString()
    };
    return {
      batchId: cls.batchId,
      classId: cls.id,
      currentValue: snapshot,
      dedupeKey: classRescheduleDedupeKey(cls.id),
      expiresAt: cls.startsAt < startsAt ? cls.startsAt : startsAt,
      requestedValue: requested
    };
  }

  async revalidate(tx: PrismaTransactionClient, request: ApprovalRequest): Promise<void> {
    if (!request.classId || !request.requesterId) throw new ConflictException("This request has no class. Reject it.");
    // Hold the class row: a start, cancel or other move waits for this decision.
    await tx.$queryRaw`SELECT "id" FROM "classes" WHERE "id" = ${request.classId} FOR UPDATE`;
    const cls = await tx.coachClass.findUnique({
      select: { batchId: true, coachId: true, startsAt: true, status: true },
      where: { id: request.classId }
    });
    if (!cls || !cls.batchId) throw new ConflictException("The class no longer exists. Reject this request.");
    if (cls.coachId !== request.requesterId) {
      throw new ConflictException("The class is no longer this coach's, so it can't be moved. Reject this request.");
    }
    if (cls.status !== ClassStatus.SCHEDULED) {
      throw new ConflictException(`The class is ${cls.status.toLowerCase()} now. Reject this request.`);
    }
    const asked = readClassTimeValue(request.currentValue);
    if (asked && cls.startsAt.toISOString() !== asked.startsAt) {
      throw new ConflictException("The class was moved after this request was made. Reject it and ask again.");
    }
    const timeZone = await assertCoachStillInBatch(tx, request.requesterId, cls.batchId);
    await assertSlotStillFree(tx, {
      batchId: cls.batchId,
      coachId: request.requesterId,
      excludeClassId: request.classId,
      timeZone,
      window: storedWindow(request)
    });
  }

  async execute(tx: PrismaTransactionClient, request: ApprovalRequest) {
    const window = storedWindow(request);
    const { count } = await tx.coachClass.updateMany({
      data: { endsAt: new Date(window.endsAt), startsAt: new Date(window.startsAt) },
      where: { coachId: request.requesterId!, id: request.classId!, status: ClassStatus.SCHEDULED }
    });
    if (count !== 1) throw new ConflictException("The class changed while this was being approved.");
    return { movedClassId: request.classId!, startsAt: window.startsAt };
  }
}

import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  batchStudentPayloadSchema,
  batchStudentTransferPayloadSchema,
  type BatchStudentPayload,
  type BatchStudentTransferPayload
} from "@nexa-chess/types";
import { BatchStatus, UserRole, UserStatus, type ApprovalRequest } from "@prisma/client";
import type { PrismaTransactionClient } from "../../prisma/prisma.service";
import { TrashRepository } from "../../trash/trash.repository";
import type { ApprovalActor, ApprovalHandler, PreparedApproval } from "../approval-handler";
import { assertCoachStillInBatch } from "./class-change.handler";

const liveBatch = { isDeleted: false, status: { not: BatchStatus.ARCHIVED } } as const;

/** The coach's own live batch, for the name shown in the inbox. 403 otherwise. */
async function ownLiveBatch(tx: PrismaTransactionClient, coachId: string, batchId: string) {
  const link = await tx.batchCoach.findFirst({
    select: { batch: { select: { name: true } } },
    where: { batch: liveBatch, batchId, coachId, isDeleted: false }
  });
  if (!link) throw new ForbiddenException("You are not assigned to this batch.");
  return link.batch;
}

async function assertActiveStudent(tx: PrismaTransactionClient, studentId: string, atApproval = false) {
  const student = await tx.user.findFirst({
    select: { id: true },
    where: { id: studentId, isDeleted: false, role: UserRole.STUDENT, status: UserStatus.ACTIVE }
  });
  if (student) return;
  if (atApproval) throw new ConflictException("The student is no longer active. Reject this request.");
  throw new NotFoundException("Student not found.");
}

const enrolmentOf = (tx: PrismaTransactionClient, batchId: string, studentId: string) =>
  tx.batchStudent.findFirst({ select: { id: true }, where: { batchId, isDeleted: false, studentId } });

/** Holds the roster row (when there is one) so a concurrent roster edit waits for this decision. */
const lockEnrolment = (tx: PrismaTransactionClient, batchId: string, studentId: string) =>
  tx.$queryRaw`SELECT "id" FROM "batch_students" WHERE "batchId" = ${batchId} AND "studentId" = ${studentId} FOR UPDATE`;

/**
 * Same write as `EntitlementService.enrol`: `BatchStudent`'s unique key spans
 * soft-deleted rows, so an earlier removal is restored rather than re-created.
 */
const enrol = (tx: PrismaTransactionClient, batchId: string, studentId: string) =>
  tx.batchStudent.upsert({
    create: { batchId, studentId },
    update: { deletedAt: null, deletedById: null, deleteGroupId: null, isDeleted: false },
    where: { batchId_studentId: { batchId, studentId } }
  });

function requestIds(request: ApprovalRequest) {
  const { batchId, requesterId, subjectUserId: studentId } = request;
  if (!batchId || !requesterId || !studentId) throw new ConflictException("This request is incomplete. Reject it.");
  return { batchId, requesterId, studentId };
}

/** `BATCH_STUDENT_ENROL`: a coach asks to add a student to one of their batches. */
@Injectable()
export class BatchStudentEnrolHandler implements ApprovalHandler<BatchStudentPayload> {
  readonly actionType = "BATCH_STUDENT_ENROL" as const;
  readonly payloadSchema = batchStudentPayloadSchema;

  async prepare(
    tx: PrismaTransactionClient,
    requester: ApprovalActor,
    payload: BatchStudentPayload
  ): Promise<PreparedApproval> {
    await ownLiveBatch(tx, requester.id, payload.batchId);
    await assertActiveStudent(tx, payload.studentId);
    if (await enrolmentOf(tx, payload.batchId, payload.studentId)) {
      throw new ConflictException("This student is already in the batch.");
    }
    return {
      batchId: payload.batchId,
      currentValue: { enrolled: false },
      dedupeKey: `BATCH_STUDENT_ENROL:${payload.batchId}:${payload.studentId}`,
      requestedValue: { enrolled: true },
      subjectUserId: payload.studentId
    };
  }

  async revalidate(tx: PrismaTransactionClient, request: ApprovalRequest): Promise<void> {
    const { batchId, requesterId, studentId } = requestIds(request);
    await assertCoachStillInBatch(tx, requesterId, batchId);
    await lockEnrolment(tx, batchId, studentId);
    await assertActiveStudent(tx, studentId, true);
    if (await enrolmentOf(tx, batchId, studentId)) {
      throw new ConflictException("The student is already in the batch. Reject this request.");
    }
  }

  async execute(tx: PrismaTransactionClient, request: ApprovalRequest) {
    const { batchId, studentId } = requestIds(request);
    await enrol(tx, batchId, studentId);
    return { enrolledIn: batchId };
  }
}

/**
 * `BATCH_STUDENT_REMOVE`: a coach asks to take a student out of one of their
 * batches. The enrolment goes to the trash, so it can be restored. A paid
 * entitlement isn't touched (as when an admin edits the roster).
 */
@Injectable()
export class BatchStudentRemoveHandler implements ApprovalHandler<BatchStudentPayload> {
  readonly actionType = "BATCH_STUDENT_REMOVE" as const;
  readonly payloadSchema = batchStudentPayloadSchema;

  constructor(private readonly trash: TrashRepository) {}

  async prepare(
    tx: PrismaTransactionClient,
    requester: ApprovalActor,
    payload: BatchStudentPayload
  ): Promise<PreparedApproval> {
    await ownLiveBatch(tx, requester.id, payload.batchId);
    if (!(await enrolmentOf(tx, payload.batchId, payload.studentId))) {
      throw new NotFoundException("This student isn't in the batch.");
    }
    return {
      batchId: payload.batchId,
      currentValue: { enrolled: true },
      dedupeKey: `BATCH_STUDENT_REMOVE:${payload.batchId}:${payload.studentId}`,
      requestedValue: { enrolled: false },
      subjectUserId: payload.studentId
    };
  }

  async revalidate(tx: PrismaTransactionClient, request: ApprovalRequest): Promise<void> {
    const { batchId, requesterId, studentId } = requestIds(request);
    await assertCoachStillInBatch(tx, requesterId, batchId);
    await lockEnrolment(tx, batchId, studentId);
    if (!(await enrolmentOf(tx, batchId, studentId))) {
      throw new ConflictException("The student has already left the batch. Reject this request.");
    }
  }

  async execute(tx: PrismaTransactionClient, request: ApprovalRequest, reviewer: { id: string }) {
    const { batchId, studentId } = requestIds(request);
    const link = await enrolmentOf(tx, batchId, studentId);
    if (!link) throw new ConflictException("The student left the batch while this was being approved.");
    await this.trash.softDelete(tx, "BatchStudent", link.id, reviewer.id);
    return { removedFrom: batchId };
  }
}

/**
 * `BATCH_STUDENT_TRANSFER`: a coach asks to move a student between two of their
 * own batches. A move into another coach's batch stays an admin's roster edit,
 * so coaches don't get a directory of batches that aren't theirs.
 */
@Injectable()
export class BatchStudentTransferHandler implements ApprovalHandler<BatchStudentTransferPayload> {
  readonly actionType = "BATCH_STUDENT_TRANSFER" as const;
  readonly payloadSchema = batchStudentTransferPayloadSchema;

  constructor(private readonly trash: TrashRepository) {}

  async prepare(
    tx: PrismaTransactionClient,
    requester: ApprovalActor,
    payload: BatchStudentTransferPayload
  ): Promise<PreparedApproval> {
    const from = await ownLiveBatch(tx, requester.id, payload.fromBatchId);
    const to = await ownLiveBatch(tx, requester.id, payload.toBatchId);
    if (!(await enrolmentOf(tx, payload.fromBatchId, payload.studentId))) {
      throw new NotFoundException("This student isn't in the batch.");
    }
    if (await enrolmentOf(tx, payload.toBatchId, payload.studentId)) {
      throw new ConflictException("This student is already in the other batch.");
    }
    await assertActiveStudent(tx, payload.studentId);
    return {
      batchId: payload.fromBatchId,
      currentValue: { fromBatchId: payload.fromBatchId },
      dedupeKey: `BATCH_STUDENT_TRANSFER:${payload.fromBatchId}:${payload.studentId}`,
      requestedValue: { fromBatchName: from.name, toBatchId: payload.toBatchId, toBatchName: to.name },
      subjectUserId: payload.studentId
    };
  }

  async revalidate(tx: PrismaTransactionClient, request: ApprovalRequest): Promise<void> {
    const { batchId, requesterId, studentId } = requestIds(request);
    const toBatchId = this.toBatchId(request);
    await assertCoachStillInBatch(tx, requesterId, batchId);
    await assertCoachStillInBatch(tx, requesterId, toBatchId);
    await lockEnrolment(tx, batchId, studentId);
    await lockEnrolment(tx, toBatchId, studentId);
    await assertActiveStudent(tx, studentId, true);
    if (!(await enrolmentOf(tx, batchId, studentId))) {
      throw new ConflictException("The student has already left the batch. Reject this request.");
    }
    if (await enrolmentOf(tx, toBatchId, studentId)) {
      throw new ConflictException("The student is already in the other batch. Reject this request.");
    }
  }

  async execute(tx: PrismaTransactionClient, request: ApprovalRequest, reviewer: { id: string }) {
    const { batchId, studentId } = requestIds(request);
    const toBatchId = this.toBatchId(request);
    const link = await enrolmentOf(tx, batchId, studentId);
    if (!link) throw new ConflictException("The student left the batch while this was being approved.");
    await this.trash.softDelete(tx, "BatchStudent", link.id, reviewer.id);
    await enrol(tx, toBatchId, studentId);
    return { from: batchId, to: toBatchId };
  }

  private toBatchId(request: ApprovalRequest) {
    const toBatchId = (request.requestedValue as { toBatchId?: unknown } | null)?.toBatchId;
    if (typeof toBatchId !== "string") throw new ConflictException("This request has no target batch. Reject it.");
    return toBatchId;
  }
}

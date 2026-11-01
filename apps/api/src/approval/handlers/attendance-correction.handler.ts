import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { attendanceCorrectionPayloadSchema, type AttendanceCorrectionPayload } from "@nexa-chess/types";
import { UserRole, UserStatus, type ApprovalRequest, type AttendanceStatus } from "@prisma/client";
import {
  applyAttendanceCorrection,
  currentAttendanceStatus,
  loadClassForCorrection
} from "../../attendance/attendance-correction";
import type { PrismaTransactionClient } from "../../prisma/prisma.service";
import type { ApprovalActor, ApprovalHandler, PreparedApproval } from "../approval-handler";

/**
 * `ATTENDANCE_CORRECTION`: a coach asks to change a student's attendance in their
 * own finished class. One pending request per student and class; approval fails
 * if the status moved since the coach asked.
 */
@Injectable()
export class AttendanceCorrectionHandler implements ApprovalHandler<AttendanceCorrectionPayload> {
  readonly actionType = "ATTENDANCE_CORRECTION" as const;
  readonly payloadSchema = attendanceCorrectionPayloadSchema;

  async prepare(
    tx: PrismaTransactionClient,
    requester: ApprovalActor,
    payload: AttendanceCorrectionPayload
  ): Promise<PreparedApproval> {
    const owned = await tx.coachClass.findUnique({ select: { coachId: true }, where: { id: payload.classId } });
    if (!owned || owned.coachId !== requester.id) throw new NotFoundException("Class not found.");
    const cls = await loadClassForCorrection(tx, payload.classId);
    const current = await currentAttendanceStatus(tx, cls, payload.studentId);
    if (current === payload.status) throw new ConflictException("The attendance already says that.");

    return {
      batchId: cls.batchId,
      classId: cls.id,
      currentValue: { status: current },
      dedupeKey: `ATTENDANCE_CORRECTION:${cls.id}:${payload.studentId}`,
      requestedValue: { status: payload.status },
      subjectUserId: payload.studentId
    };
  }

  async revalidate(tx: PrismaTransactionClient, request: ApprovalRequest): Promise<void> {
    const { classId, requesterId, subjectUserId: studentId } = request;
    if (!classId || !requesterId || !studentId) throw new ConflictException("This request is incomplete. Reject it.");
    await tx.$queryRaw`SELECT "id" FROM "classes" WHERE "id" = ${classId} FOR SHARE`;
    await tx.$queryRaw`
      SELECT "id" FROM "class_attendance" WHERE "classId" = ${classId} AND "studentId" = ${studentId} FOR UPDATE`;

    const cls = await loadClassForCorrection(tx, classId).catch(() => {
      throw new ConflictException("The class no longer has attendance to correct. Reject this request.");
    });
    if (
      cls.coachId !== requesterId ||
      cls.coach.isDeleted ||
      cls.coach.role !== UserRole.COACH ||
      cls.coach.status !== UserStatus.ACTIVE
    ) {
      throw new ConflictException("The class is no longer this coach's (or the coach is inactive). Reject this request.");
    }
    const current = await currentAttendanceStatus(tx, cls, studentId).catch(() => {
      throw new ConflictException("The student no longer has attendance in this class. Reject this request.");
    });
    const asked = (request.currentValue as { status?: AttendanceStatus | null } | null)?.status ?? null;
    if (current !== asked) {
      throw new ConflictException("The attendance changed after this request was made. Reject it and ask again.");
    }
  }

  async execute(tx: PrismaTransactionClient, request: ApprovalRequest, reviewer: { id: string }) {
    const before = (request.currentValue as { status?: AttendanceStatus | null } | null)?.status ?? null;
    const { status } = request.requestedValue as { status: AttendanceStatus };
    await applyAttendanceCorrection(tx, {
      actorId: reviewer.id,
      approvalRequestId: request.id,
      before,
      classId: request.classId!,
      reason: request.reason,
      status,
      studentId: request.subjectUserId!
    });
    return { after: status, before };
  }
}

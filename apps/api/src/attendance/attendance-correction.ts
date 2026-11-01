import { ConflictException, NotFoundException } from "@nestjs/common";
import { ClassStatus, type AttendanceStatus, type Prisma } from "@prisma/client";
import type { PrismaTransactionClient } from "../prisma/prisma.service";

/** A class can be corrected once it has ended; a cancelled one has no attendance to correct. */
export async function loadClassForCorrection(tx: PrismaTransactionClient, classId: string) {
  const cls = await tx.coachClass.findUnique({
    select: {
      batchId: true,
      coach: { select: { isDeleted: true, role: true, status: true } },
      coachId: true,
      id: true,
      liveSession: { select: { status: true } },
      status: true
    },
    where: { id: classId }
  });
  if (!cls) throw new NotFoundException("Class not found.");
  const ended = cls.status === ClassStatus.COMPLETED || cls.liveSession?.status === "ENDED";
  if (!ended || cls.status === ClassStatus.CANCELLED) {
    throw new ConflictException("Attendance can only be corrected after the class has ended.");
  }
  return cls;
}

/** The status on record, or null for a student of the batch who has no row yet. 404 for anyone else. */
export async function currentAttendanceStatus(
  tx: PrismaTransactionClient,
  cls: { batchId: string | null; id: string },
  studentId: string
): Promise<AttendanceStatus | null> {
  const row = await tx.classAttendance.findUnique({
    select: { status: true },
    where: { classId_studentId: { classId: cls.id, studentId } }
  });
  if (row) return row.status;
  const enrolled = cls.batchId
    ? await tx.batchStudent.findFirst({
        select: { id: true },
        where: { batchId: cls.batchId, isDeleted: false, studentId }
      })
    : null;
  if (!enrolled) throw new NotFoundException("This student has no attendance in this class.");
  return null;
}

/**
 * The one way a status is changed by hand, for an admin's direct correction and
 * an approved coach request alike. The audit row commits with the change. The
 * measured duration and percentage stay as recorded.
 */
export async function applyAttendanceCorrection(
  tx: PrismaTransactionClient,
  input: {
    actorId: string;
    approvalRequestId?: string;
    before: AttendanceStatus | null;
    classId: string;
    reason: string;
    status: AttendanceStatus;
    studentId: string;
  }
): Promise<{ correctedAt: Date; status: AttendanceStatus }> {
  const correctedAt = new Date();
  const row = await tx.classAttendance.upsert({
    // The column defaults to now(); a student with no row never joined.
    create: {
      classId: input.classId,
      correctedAt,
      joinedAt: null,
      status: input.status,
      studentId: input.studentId
    },
    select: { id: true },
    update: { correctedAt, status: input.status },
    where: { classId_studentId: { classId: input.classId, studentId: input.studentId } }
  });
  const metadata: Prisma.InputJsonObject = {
    after: input.status,
    before: input.before,
    classId: input.classId,
    reason: input.reason,
    studentId: input.studentId,
    ...(input.approvalRequestId ? { approvalRequestId: input.approvalRequestId } : {})
  };
  await tx.trashAuditLog.create({
    data: {
      action: "ATTENDANCE_CORRECTION",
      entity: "ClassAttendance",
      entityId: row.id,
      metadata,
      userId: input.actorId
    }
  });
  return { correctedAt, status: input.status };
}

import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  BatchStatus,
  ClassStatus,
  LiveSessionStatus,
  UserRole,
  UserStatus,
  type ApprovalRequest
} from "@prisma/client";
import { z } from "zod";
import type { PrismaTransactionClient } from "../../prisma/prisma.service";
import type { ApprovalActor, ApprovalHandler, PreparedApproval } from "../approval-handler";

const payloadSchema = z.object({
  classId: z.string().trim().min(1).max(64),
  studentId: z.string().trim().min(1).max(64)
});
type Payload = z.infer<typeof payloadSchema>;

const CLOSED: ClassStatus[] = [ClassStatus.CANCELLED, ClassStatus.COMPLETED];

/**
 * V4 (docs/PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md §1.3): a coach asks to
 * let a student from outside their batches into ONE of their classes. The
 * APPROVED request is itself the grant — `LiveClassPullService` reads it — and
 * if the class is live when it's approved, the pull is sent straight away.
 */
@Injectable()
export class LiveClassGuestStudentHandler implements ApprovalHandler<Payload> {
  readonly actionType = "LIVE_CLASS_GUEST_STUDENT" as const;
  readonly payloadSchema = payloadSchema;

  async prepare(tx: PrismaTransactionClient, requester: ApprovalActor, payload: Payload): Promise<PreparedApproval> {
    const cls = await tx.coachClass.findUnique({
      select: { batchId: true, coachId: true, endsAt: true, id: true, status: true },
      where: { id: payload.classId }
    });
    if (!cls || cls.coachId !== requester.id) throw new NotFoundException("Class not found.");
    if (CLOSED.includes(cls.status) || cls.endsAt.getTime() <= Date.now()) {
      throw new ConflictException("This class is over, so nobody can join it.");
    }
    await this.assertActiveStudent(tx, payload.studentId);
    if (await this.inCoachBatches(tx, requester.id, payload.studentId)) {
      throw new ConflictException("This student is in one of your batches. Pull them in directly.");
    }

    return {
      batchId: cls.batchId,
      classId: cls.id,
      currentValue: { classStatus: cls.status },
      dedupeKey: `LIVE_CLASS_GUEST_STUDENT:${cls.id}:${payload.studentId}`,
      // No use after the class ends.
      expiresAt: cls.endsAt,
      requestedValue: { classId: cls.id, studentId: payload.studentId },
      subjectUserId: payload.studentId,
      // The class is running: someone is waiting.
      urgent: cls.status === ClassStatus.LIVE || cls.status === ClassStatus.IN_PROGRESS
    };
  }

  async revalidate(tx: PrismaTransactionClient, request: ApprovalRequest): Promise<void> {
    const classId = request.classId;
    const studentId = request.subjectUserId;
    if (!classId || !studentId) throw new ConflictException("This request is incomplete. Reject it.");
    await tx.$queryRaw`SELECT "id" FROM "classes" WHERE "id" = ${classId} FOR SHARE`;
    const cls = await tx.coachClass.findUnique({
      select: {
        coach: { select: { isDeleted: true, role: true, status: true } },
        coachId: true,
        endsAt: true,
        status: true
      },
      where: { id: classId }
    });
    if (!cls || CLOSED.includes(cls.status) || cls.endsAt.getTime() <= Date.now()) {
      throw new ConflictException("The class is over or cancelled. Reject this request.");
    }
    if (
      cls.coachId !== request.requesterId ||
      cls.coach.isDeleted ||
      cls.coach.role !== UserRole.COACH ||
      cls.coach.status !== UserStatus.ACTIVE
    ) {
      throw new ConflictException("The class is no longer this coach's (or the coach is inactive). Reject this request.");
    }
    await this.assertActiveStudent(tx, studentId, true);
  }

  async execute(tx: PrismaTransactionClient, request: ApprovalRequest) {
    const liveSession = await tx.liveSession.findUnique({
      select: { id: true, status: true },
      where: { classId: request.classId! }
    });
    if (liveSession?.status !== LiveSessionStatus.LIVE) return { granted: true, pulled: false };
    // Live now: send the pull on the coach's behalf, so the student is prompted at once.
    await tx.liveClassPull.upsert({
      create: { liveSessionId: liveSession.id, requestedById: request.requesterId!, studentId: request.subjectUserId! },
      update: { requestedAt: new Date(), requestedById: request.requesterId!, resolvedAt: null, status: "PENDING" },
      where: { liveSessionId_studentId: { liveSessionId: liveSession.id, studentId: request.subjectUserId! } }
    });
    return { granted: true, pulled: true };
  }

  private async assertActiveStudent(tx: PrismaTransactionClient, studentId: string, atApproval = false) {
    const student = await tx.user.findFirst({
      select: { id: true },
      where: { id: studentId, isDeleted: false, role: UserRole.STUDENT, status: UserStatus.ACTIVE }
    });
    if (!student) {
      if (atApproval) throw new ConflictException("The student is no longer active. Reject this request.");
      throw new NotFoundException("Student not found.");
    }
  }

  /** Same reach rule as LiveClassPullService.coachReach. */
  private async inCoachBatches(tx: PrismaTransactionClient, coachId: string, studentId: string) {
    const link = await tx.batchStudent.findFirst({
      select: { id: true },
      where: {
        batch: {
          coaches: { some: { coachId, isDeleted: false } },
          isDeleted: false,
          status: { not: BatchStatus.ARCHIVED }
        },
        isDeleted: false,
        studentId
      }
    });
    return !!link;
  }
}

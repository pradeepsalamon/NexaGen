import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { resolveCancellationPath, type ApprovalActionType } from "@nexa-chess/types";
import { ClassStatus, UserRole, UserStatus, type ApprovalRequest } from "@prisma/client";
import { z } from "zod";
import { MessagingDispatchService } from "../../messaging/messaging-dispatch.service";
import type { PrismaTransactionClient } from "../../prisma/prisma.service";
import type { ApprovalActor, ApprovalHandler, PreparedApproval } from "../approval-handler";

const payloadSchema = z.object({ classId: z.string().trim().min(1).max(64) });
type Payload = z.infer<typeof payloadSchema>;

type Snapshot = { status: string; startsAt: string };

/**
 * Coach class cancellation that needs an admin (V10,
 * docs/PLATFORM_PERMISSIONS_AND_APPROVALS_PLAN.md §1.3). `resolveCancellationPath`
 * decides which action applies; the coach's direct route only takes DIRECT.
 *
 * One pending cancellation per class, whichever kind (shared dedupe key).
 */
abstract class ClassCancelHandlerBase implements ApprovalHandler<Payload> {
  abstract readonly actionType: ApprovalActionType;
  readonly payloadSchema = payloadSchema;
  /** The path this action covers. */
  protected abstract readonly path: "APPROVAL" | "EXCEPTIONAL";

  constructor(private readonly messaging: MessagingDispatchService) {}

  async prepare(tx: PrismaTransactionClient, requester: ApprovalActor, payload: Payload): Promise<PreparedApproval> {
    const cls = await tx.coachClass.findUnique({
      select: { batchId: true, coachId: true, id: true, startsAt: true, status: true },
      where: { id: payload.classId }
    });
    if (!cls || cls.coachId !== requester.id) throw new NotFoundException("Class not found.");

    const path = resolveCancellationPath(cls);
    if (path !== this.path) throw new ConflictException(this.wrongPathMessage(path));

    const snapshot: Snapshot = { startsAt: cls.startsAt.toISOString(), status: cls.status };
    return {
      batchId: cls.batchId,
      classId: cls.id,
      currentValue: snapshot,
      dedupeKey: `CLASS_CANCEL:${cls.id}`,
      requestedValue: { classId: cls.id, status: ClassStatus.CANCELLED },
      ...this.timing(cls.startsAt)
    };
  }

  async revalidate(tx: PrismaTransactionClient, request: ApprovalRequest): Promise<void> {
    const classId = request.classId;
    if (!classId) throw new ConflictException("This request has no class.");
    // Hold the class row: a start, reschedule or other cancel waits for this decision.
    await tx.$queryRaw`SELECT "id" FROM "classes" WHERE "id" = ${classId} FOR UPDATE`;
    const cls = await tx.coachClass.findUnique({
      select: {
        coach: { select: { isDeleted: true, role: true, status: true } },
        coachId: true,
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
    const asked = request.currentValue as Snapshot | null;
    if (asked && cls.startsAt.toISOString() !== asked.startsAt) {
      throw new ConflictException("The class was rescheduled after this request was made. Reject it and ask again.");
    }
    this.assertStillCancellable(cls);
  }

  async execute(tx: PrismaTransactionClient, request: ApprovalRequest, reviewer: { id: string }) {
    const { count } = await tx.coachClass.updateMany({
      data: { cancelledAt: new Date(), cancelledById: reviewer.id, status: ClassStatus.CANCELLED },
      where: { id: request.classId!, status: { in: [ClassStatus.SCHEDULED] } }
    });
    if (count !== 1) throw new ConflictException("The class changed while this was being approved.");
    return { cancelledClassId: request.classId!, requestedBy: request.requesterId };
  }

  afterCommit(request: ApprovalRequest, outcome: "CREATED" | "APPROVED" | "REJECTED" | "CANCELLED") {
    if (outcome === "APPROVED" && request.classId) {
      this.messaging.dispatchInBackground({ classId: request.classId, event: "CLASS_CANCELLED" });
    }
  }

  protected abstract timing(startsAt: Date): Pick<PreparedApproval, "expiresAt" | "urgent">;
  protected abstract assertStillCancellable(cls: { status: ClassStatus; startsAt: Date }): void;

  private wrongPathMessage(path: string): string {
    switch (path) {
      case "DIRECT":
        return "This class is more than 24 hours away. Cancel it directly.";
      case "APPROVAL":
        return "This class hasn't started. Ask for a regular cancellation instead.";
      case "EXCEPTIONAL":
        return "This class has already started. Ask for an exceptional cancellation instead.";
      default:
        return "This class can't be cancelled.";
    }
  }
}

/** Within 24 h of the start. Expires at the start: after that it's the exceptional path. */
@Injectable()
export class ClassCancelHandler extends ClassCancelHandlerBase {
  readonly actionType = "CLASS_CANCEL" as const;
  protected readonly path = "APPROVAL" as const;

  protected timing(startsAt: Date) {
    // Less than 6 h left: flag it so it tops the admin inbox.
    return { expiresAt: startsAt, urgent: startsAt.getTime() - Date.now() < 6 * 3_600_000 };
  }

  protected assertStillCancellable(cls: { status: ClassStatus; startsAt: Date }) {
    if (cls.status !== ClassStatus.SCHEDULED) {
      throw new ConflictException(`The class is ${cls.status.toLowerCase()} now. Reject this request.`);
    }
  }
}

/**
 * After the start time (not held, or running). Always urgent. A running class
 * must be ended first: approval only marks a class that isn't live CANCELLED,
 * and a COMPLETED class can't be cancelled at all.
 */
@Injectable()
export class ClassCancelExceptionalHandler extends ClassCancelHandlerBase {
  readonly actionType = "CLASS_CANCEL_EXCEPTIONAL" as const;
  protected readonly path = "EXCEPTIONAL" as const;

  protected timing() {
    return { urgent: true };
  }

  protected assertStillCancellable(cls: { status: ClassStatus; startsAt: Date }) {
    if (cls.status === ClassStatus.LIVE || cls.status === ClassStatus.IN_PROGRESS) {
      throw new ConflictException("The class is still running. End it first, then approve.");
    }
    if (cls.status !== ClassStatus.SCHEDULED) {
      throw new ConflictException(`The class is ${cls.status.toLowerCase()} now. Reject this request.`);
    }
  }
}

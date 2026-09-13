import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import type { EntitlementItem } from "@nexa-chess/types";
import {
  EntitlementStatus,
  Prisma,
  type Entitlement,
  type Plan
} from "@prisma/client";
import {
  PrismaService,
  type PrismaTransactionClient
} from "../prisma/prisma.service";
import { computeAccessEnd } from "./payments.util";

type EntitlementRow = Entitlement & {
  plan: Pick<Plan, "name">;
  batch: { name: string } | null;
};

const ENTITLEMENT_INCLUDE = {
  plan: { select: { name: true } },
  batch: { select: { name: true } }
} satisfies Prisma.EntitlementInclude;

/**
 * The access boundary (§21).
 *
 * Payment provider → verification → payment → order → ENTITLEMENT → user
 * access. Nothing else in the codebase may enrol a student off the back of a
 * payment, and nothing here runs on a frontend success callback: `grant` is
 * only ever called from a verified payment capture.
 */
@Injectable()
export class EntitlementService {
  private readonly logger = new Logger(EntitlementService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Grants what an order bought. Idempotent by the unique (orderId, planId):
   * a replayed webhook, a reconciliation sweep and a manual retry all converge
   * on one entitlement and one enrolment, never two.
   *
   * Runs inside the caller's transaction so the entitlement, the enrolment and
   * the payment's PAID status commit together or not at all.
   */
  async grant(
    tx: PrismaTransactionClient,
    input: {
      userId: string;
      planId: string;
      orderId: string;
      paymentId: string | null;
      subscriptionId?: string | null;
      grantedAt?: Date;
    }
  ): Promise<Entitlement | null> {
    const plan = await tx.plan.findUnique({ where: { id: input.planId } });
    if (!plan) {
      this.logger.error(
        `Order ${input.orderId} is PAID but plan ${input.planId} no longer exists — access not granted.`
      );
      return null;
    }

    const startsAt = input.grantedAt ?? new Date();
    const endsAt = computeAccessEnd(plan, startsAt);

    const existing = await tx.entitlement.findUnique({
      where: { orderId_planId: { orderId: input.orderId, planId: input.planId } }
    });

    if (existing) {
      // Already granted. A repeat capture must not extend access — that would
      // be a duplicate benefit, which §11 exists to prevent.
      return existing;
    }

    const entitlement = await tx.entitlement.create({
      data: {
        userId: input.userId,
        planId: input.planId,
        orderId: input.orderId,
        paymentId: input.paymentId,
        subscriptionId: input.subscriptionId ?? null,
        batchId: plan.batchId,
        status: EntitlementStatus.ACTIVE,
        startsAt,
        endsAt
      }
    });

    if (plan.batchId) {
      await this.enrol(tx, input.userId, plan.batchId);
    }

    return entitlement;
  }

  /**
   * Enrols the student into the plan's batch.
   *
   * An upsert, not a find-then-create: `BatchStudent` is soft-deletable and its
   * unique (batchId, studentId) spans deleted rows, so a filtered read would
   * miss a previously removed enrolment and the create would die on P2002. The
   * extension leaves writes alone, so the upsert sees the deleted row and
   * restores it.
   */
  private async enrol(
    tx: PrismaTransactionClient,
    studentId: string,
    batchId: string
  ): Promise<void> {
    await tx.batchStudent.upsert({
      where: { batchId_studentId: { batchId, studentId } },
      create: { batchId, studentId },
      update: {
        isDeleted: false,
        deletedAt: null,
        deletedById: null,
        deleteGroupId: null
      }
    });
  }

  /**
   * Revokes access, for a refund an admin chose to claw back. Removing the
   * batch enrolment is deliberately NOT done here: a coach may have already
   * taught the student, and pulling them out of a live batch is a decision for
   * a human, not a refund webhook.
   */
  async revoke(
    tx: PrismaTransactionClient,
    entitlementId: string,
    reason: string
  ): Promise<void> {
    await tx.entitlement.update({
      where: { id: entitlementId },
      data: {
        status: EntitlementStatus.REVOKED,
        revokedAt: new Date(),
        revokedReason: reason.slice(0, 500)
      }
    });
  }

  async revokeForOrder(
    tx: PrismaTransactionClient,
    orderId: string,
    reason: string
  ): Promise<number> {
    const { count } = await tx.entitlement.updateMany({
      where: { orderId, status: EntitlementStatus.ACTIVE },
      data: {
        status: EntitlementStatus.REVOKED,
        revokedAt: new Date(),
        revokedReason: reason.slice(0, 500)
      }
    });
    return count;
  }

  /** Whether this user currently holds usable access to a plan. */
  async hasActiveAccess(userId: string, planId: string): Promise<boolean> {
    const now = new Date();
    const count = await this.prisma.entitlement.count({
      where: {
        userId,
        planId,
        status: EntitlementStatus.ACTIVE,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }]
      }
    });
    return count > 0;
  }

  async listForUser(userId: string): Promise<EntitlementItem[]> {
    const rows = await this.prisma.entitlement.findMany({
      where: { userId },
      include: ENTITLEMENT_INCLUDE,
      orderBy: { createdAt: "desc" }
    });
    return rows.map((row) => this.toItem(row));
  }

  /**
   * Expires entitlements whose window has closed. Access is checked against
   * `endsAt` at read time too, so this sweep is bookkeeping rather than the
   * thing that actually locks anyone out.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async expireLapsed(): Promise<void> {
    const { count } = await this.prisma.entitlement.updateMany({
      where: {
        status: EntitlementStatus.ACTIVE,
        endsAt: { not: null, lte: new Date() }
      },
      data: { status: EntitlementStatus.EXPIRED }
    });

    if (count > 0) {
      this.logger.log(`Expired ${count} entitlements.`);
    }
  }

  private toItem(row: EntitlementRow): EntitlementItem {
    return {
      id: row.id,
      planId: row.planId,
      planName: row.plan.name,
      status: row.status,
      batchId: row.batchId,
      batchName: row.batch?.name ?? null,
      startsAt: row.startsAt.toISOString(),
      endsAt: row.endsAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString()
    };
  }
}

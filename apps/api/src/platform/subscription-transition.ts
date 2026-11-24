import { ConflictException, NotFoundException } from "@nestjs/common";
import { isAllowedSubscriptionTransition, type TenantSubscriptionStatusType } from "@nexa-chess/types";
import { Prisma, TenantSubscriptionEventSource, type TenantSubscription } from "@prisma/client";
import type { PrismaTransactionClient } from "../prisma/prisma.service";

export type SubscriptionTransition = {
  tenantId: string;
  to: TenantSubscriptionStatusType;
  source: TenantSubscriptionEventSource;
  actorUserId?: string | null;
  note?: string | null;
  /** Other columns to change in the same write (dates, plan). */
  data?: Prisma.TenantSubscriptionUncheckedUpdateInput;
  /** The event's change set, for audit. */
  changes?: Record<string, unknown>;
};

/**
 * The one funnel for a subscription's status (docs/SAAS_MULTI_TENANCY.md §G
 * "State machine"): the allowed-transition guard, the write, and the
 * `TenantSubscriptionEvent`, all in the caller's transaction. Phase 6's
 * gateway webhooks call this too (after their own idempotent event row).
 */
/**
 * Locks an academy's subscription row for the rest of the transaction, so a
 * sweep, a settling payment and an operator's edit act on one state at a time
 * (review T4, T5).
 */
export async function lockTenantSubscription(tx: PrismaTransactionClient, tenantId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "tenant_subscriptions" WHERE "tenantId" = ${tenantId} FOR UPDATE`;
}

export async function applySubscriptionTransition(
  tx: PrismaTransactionClient,
  transition: SubscriptionTransition
): Promise<TenantSubscription> {
  const current = await tx.tenantSubscription.findUnique({ include: { plan: true }, where: { tenantId: transition.tenantId } });
  if (!current) throw new NotFoundException("This academy has no subscription.");
  if (!isAllowedSubscriptionTransition(current.status, transition.to)) {
    throw new ConflictException(`A subscription can't go from ${current.status} to ${transition.to}.`);
  }
  // Status-filtered claim: a concurrent transition from the same state loses.
  const claimed = await tx.tenantSubscription.updateMany({
    data: { ...(transition.data as Prisma.TenantSubscriptionUncheckedUpdateManyInput), status: transition.to },
    where: { id: current.id, status: current.status }
  });
  if (claimed.count !== 1) throw new ConflictException("The subscription changed meanwhile; reload and try again.");
  const updated = await tx.tenantSubscription.findUniqueOrThrow({ include: { plan: true }, where: { id: current.id } });
  await tx.tenantSubscriptionEvent.create({
    data: {
      actorUserId: transition.actorUserId ?? null,
      changes: (transition.changes ?? {}) as Prisma.InputJsonValue,
      fromPlanCode: current.plan.code,
      fromStatus: current.status,
      note: transition.note ?? null,
      source: transition.source,
      subscriptionId: current.id,
      tenantId: transition.tenantId,
      toPlanCode: updated.plan.code,
      toStatus: updated.status
    }
  });
  return updated;
}

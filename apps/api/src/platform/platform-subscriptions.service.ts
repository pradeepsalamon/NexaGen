import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
  isAllowedSubscriptionTransition,
  type ChangeTenantPlanRequest,
  type PlatformDealRequest,
  type PlatformTenantSubscriptionResponse,
  type RecordPlatformPaymentRequest,
  type TenantSubscriptionStatusType,
  type TransitionTenantSubscriptionRequest
} from "@nexa-chess/types";
import {
  PlatformPaymentMethod,
  Prisma,
  TenantSubscriptionEventSource,
  TenantSubscriptionStatus,
  type TenantSubscription
} from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { JOB_LOCKS, JobLockService } from "../prisma/job-lock.service";
import { PrismaService, type PrismaTransactionClient } from "../prisma/prisma.service";
import { EntitlementService, pinnedLapsePolicy } from "./entitlement.service";
import { assertPlatformOperator, writePlatformAudit } from "./platform-operator";
import { PlatformService } from "./platform.service";

const DAY_MS = 24 * 60 * 60_000;

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

/**
 * A payment extended the paid-up period (a manual payment the owner recorded,
 * or a gateway payment). An ACTIVE subscription keeps its status and logs the
 * extension; any other status goes to ACTIVE through
 * `applySubscriptionTransition`, the one status funnel (§G "State machine").
 */
export async function applyPaidPeriod(
  tx: PrismaTransactionClient,
  input: {
    tenantId: string;
    source: TenantSubscriptionEventSource;
    actorUserId: string | null;
    note?: string | null;
    data: Prisma.TenantSubscriptionUncheckedUpdateInput;
    changes: Record<string, unknown>;
  }
): Promise<TenantSubscription> {
  const sub = await tx.tenantSubscription.findUnique({ include: { plan: true }, where: { tenantId: input.tenantId } });
  if (!sub) throw new NotFoundException("This academy has no subscription.");
  if (sub.status !== TenantSubscriptionStatus.ACTIVE) {
    return applySubscriptionTransition(tx, {
      actorUserId: input.actorUserId,
      changes: input.changes,
      data: input.data,
      note: input.note ?? null,
      source: input.source,
      tenantId: input.tenantId,
      to: TenantSubscriptionStatus.ACTIVE
    });
  }
  const updated = await tx.tenantSubscription.update({ data: input.data, include: { plan: true }, where: { id: sub.id } });
  await tx.tenantSubscriptionEvent.create({
    data: {
      actorUserId: input.actorUserId,
      changes: input.changes as Prisma.InputJsonValue,
      fromPlanCode: sub.plan.code,
      fromStatus: sub.status,
      note: input.note ?? null,
      source: input.source,
      subscriptionId: sub.id,
      tenantId: input.tenantId,
      toPlanCode: updated.plan.code,
      toStatus: updated.status
    }
  });
  return updated;
}

/**
 * Platform console: an academy's subscription (§G, §I "Subscriptions";
 * Phase 4c/4d), and the nightly lapse sweep.
 */
@Injectable()
export class PlatformSubscriptionsService {
  private readonly logger = new Logger(PlatformSubscriptionsService.name);

  constructor(
    private readonly entitlements: EntitlementService,
    private readonly jobLocks: JobLockService,
    private readonly jwtService: JwtService,
    private readonly platform: PlatformService,
    private readonly prisma: PrismaService
  ) {}

  private async operator(accessToken: string | undefined) {
    return assertPlatformOperator(await authenticateUser(this.jwtService, this.prisma, accessToken));
  }

  private async subscriptionOrThrow(tenantId: string) {
    const sub = await this.prisma.tenantSubscription.findUnique({ include: { plan: true }, where: { tenantId } });
    if (!sub) throw new NotFoundException("This academy has no subscription.");
    return sub;
  }

  private done(tenantId: string): Promise<PlatformTenantSubscriptionResponse> {
    this.entitlements.invalidate(tenantId);
    return this.platform.subscriptionView(tenantId);
  }

  /** Move to another plan now (at its current version), or at the end of the paid-up period. */
  async changePlan(
    accessToken: string | undefined,
    tenantId: string,
    body: ChangeTenantPlanRequest
  ): Promise<PlatformTenantSubscriptionResponse> {
    const actor = await this.operator(accessToken);
    const sub = await this.subscriptionOrThrow(tenantId);
    const plan = await this.prisma.platformPlan.findUnique({ where: { code: body.planCode } });
    if (!plan || !plan.isActive) throw new NotFoundException("Plan not found.");
    if (body.when === "periodEnd" && !sub.currentPeriodEnd) {
      throw new BadRequestException("This subscription has no period end; change the plan now instead.");
    }
    await this.prisma.$transaction(async (tx) => {
      if (body.when === "now") {
        await tx.tenantSubscription.update({
          data: { pendingPlanId: null, planId: plan.id, planVersion: plan.version },
          where: { id: sub.id }
        });
      } else {
        await tx.tenantSubscription.update({ data: { pendingPlanId: plan.id }, where: { id: sub.id } });
      }
      await tx.tenantSubscriptionEvent.create({
        data: {
          actorUserId: actor.id,
          changes: { planCode: plan.code, when: body.when },
          fromPlanCode: sub.plan.code,
          fromStatus: sub.status,
          note: body.note ?? null,
          source: TenantSubscriptionEventSource.ADMIN,
          subscriptionId: sub.id,
          tenantId,
          toPlanCode: body.when === "now" ? plan.code : sub.plan.code,
          toStatus: sub.status
        }
      });
      await writePlatformAudit(tx, {
        action: "subscription.plan",
        actorUserId: actor.id,
        details: { from: sub.plan.code, to: plan.code, when: body.when },
        reason: body.note,
        targetTenantId: tenantId
      });
    });
    return this.done(tenantId);
  }

  async transition(
    accessToken: string | undefined,
    tenantId: string,
    body: TransitionTenantSubscriptionRequest
  ): Promise<PlatformTenantSubscriptionResponse> {
    const actor = await this.operator(accessToken);
    await this.subscriptionOrThrow(tenantId);
    const periodEnd = body.currentPeriodEnd === undefined ? undefined : body.currentPeriodEnd ? new Date(body.currentPeriodEnd) : null;
    await this.prisma.$transaction(async (tx) => {
      const lapse = await this.lapseFor(tx, tenantId);
      const now = Date.now();
      await applySubscriptionTransition(tx, {
        actorUserId: actor.id,
        changes: { currentPeriodEnd: body.currentPeriodEnd ?? null, status: body.status },
        data: {
          ...(periodEnd !== undefined ? { currentPeriodEnd: periodEnd } : {}),
          ...(body.status === "GRACE" ? { graceEndsAt: new Date(now + lapse.graceDays * DAY_MS) } : {}),
          ...(body.status === "ACTIVE" ? { graceEndsAt: null } : {})
        },
        note: body.note,
        source: TenantSubscriptionEventSource.ADMIN,
        tenantId,
        to: body.status
      });
      await writePlatformAudit(tx, {
        action: "subscription.transition",
        actorUserId: actor.id,
        details: { status: body.status },
        reason: body.note,
        targetTenantId: tenantId
      });
    });
    return this.done(tenantId);
  }

  /** A payment received outside a gateway: the period is extended and the subscription is ACTIVE. */
  async recordPayment(
    accessToken: string | undefined,
    tenantId: string,
    body: RecordPlatformPaymentRequest
  ): Promise<PlatformTenantSubscriptionResponse> {
    const actor = await this.operator(accessToken);
    const sub = await this.subscriptionOrThrow(tenantId);
    const periodEnd = new Date(body.currentPeriodEnd);
    if (periodEnd.getTime() <= Date.now()) throw new BadRequestException("The paid-up period must end in the future.");
    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.platformPayment.create({
        data: {
          amountMinor: body.amountMinor,
          currency: sub.plan.currency,
          method: PlatformPaymentMethod.MANUAL,
          note: body.note,
          periodEnd,
          recordedById: actor.id,
          reference: body.reference ?? null,
          tenantId
        }
      });
      await applyPaidPeriod(tx, {
        actorUserId: actor.id,
        changes: { amountMinor: body.amountMinor, paymentId: payment.id, periodEnd: periodEnd.toISOString() },
        data: { currentPeriodEnd: periodEnd, graceEndsAt: null, trialEndsAt: null },
        note: body.note,
        source: TenantSubscriptionEventSource.ADMIN,
        tenantId
      });
      await writePlatformAudit(tx, {
        action: "subscription.payment",
        actorUserId: actor.id,
        details: { amountMinor: body.amountMinor, paymentId: payment.id, reference: body.reference ?? null },
        reason: body.note,
        targetTenantId: tenantId
      });
    });
    return this.done(tenantId);
  }

  /** The academy's custom deal: feature/limit overrides, lapse overrides, a custom price and a note. */
  async setDeal(
    accessToken: string | undefined,
    tenantId: string,
    body: PlatformDealRequest
  ): Promise<PlatformTenantSubscriptionResponse> {
    const actor = await this.operator(accessToken);
    const sub = await this.subscriptionOrThrow(tenantId);
    // `lapse: null` keeps the academy's lapse override (the console's deal
    // dialog has no lapse fields, and a price edit mustn't erase it); `{}`
    // clears it back to the plan's policy.
    const keptLapse = (sub.overrides as { lapse?: unknown } | null)?.lapse ?? null;
    const lapse = body.lapse ?? keptLapse;
    const overrides = { ...body.overrides, ...(lapse ? { lapse } : {}) };
    await this.prisma.$transaction(async (tx) => {
      await tx.tenantSubscription.update({
        data: {
          customPriceMinor: body.customPriceMinor,
          dealNote: body.note,
          overrides: overrides as Prisma.InputJsonValue
        },
        where: { id: sub.id }
      });
      await tx.tenantSubscriptionEvent.create({
        data: {
          actorUserId: actor.id,
          changes: { customPriceMinor: body.customPriceMinor, overrides } as Prisma.InputJsonValue,
          fromPlanCode: sub.plan.code,
          fromStatus: sub.status,
          note: body.note,
          source: TenantSubscriptionEventSource.ADMIN,
          subscriptionId: sub.id,
          tenantId,
          toPlanCode: sub.plan.code,
          toStatus: sub.status
        }
      });
      await writePlatformAudit(tx, {
        action: "subscription.deal",
        actorUserId: actor.id,
        details: { customPriceMinor: body.customPriceMinor, overrides },
        reason: body.note,
        targetTenantId: tenantId
      });
    });
    return this.done(tenantId);
  }

  // ── nightly lapse sweep ─────────────────────────────────

  @Cron(CronExpression.EVERY_HOUR)
  async sweepCron(): Promise<void> {
    await this.jobLocks.runExclusive(JOB_LOCKS.platformSubscriptionLapse, () => this.sweep());
  }

  /**
   * Moves subscriptions along the §G lapse policy by their dates. Platform
   * tables only (subscriptions, plans), so no academy context is needed.
   * Returns how many subscriptions changed.
   */
  async sweep(now = new Date()): Promise<number> {
    const due = await this.prisma.tenantSubscription.findMany({
      include: { plan: true },
      where: {
        OR: [
          { status: TenantSubscriptionStatus.TRIALING, trialEndsAt: { lte: now } },
          { currentPeriodEnd: { lte: now }, status: TenantSubscriptionStatus.ACTIVE },
          { currentPeriodEnd: { lte: now }, status: TenantSubscriptionStatus.PAST_DUE },
          { graceEndsAt: { lte: now }, status: TenantSubscriptionStatus.GRACE },
          { currentPeriodEnd: { lte: now }, status: TenantSubscriptionStatus.CANCEL_SCHEDULED },
          { currentPeriodEnd: { lte: now }, pendingPlanId: { not: null } }
        ]
      }
    });
    let changed = 0;
    for (const sub of due) {
      try {
        if (await this.sweepOne(sub, now)) changed += 1;
      } catch (error) {
        this.logger.warn(`Lapse sweep skipped ${sub.tenantId}: ${(error as Error).message}`);
      }
    }
    if (changed) this.entitlements.invalidate();
    return changed;
  }

  private async sweepOne(sub: Prisma.TenantSubscriptionGetPayload<{ include: { plan: true } }>, now: Date): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const lapse = await this.lapseFor(tx, sub.tenantId);
      const base = { source: TenantSubscriptionEventSource.SYSTEM, tenantId: sub.tenantId };
      // A scheduled plan change happens at the period end, whatever else is due.
      if (sub.pendingPlanId && sub.currentPeriodEnd && sub.currentPeriodEnd <= now) {
        const next = await tx.platformPlan.findUniqueOrThrow({ where: { id: sub.pendingPlanId } });
        await tx.tenantSubscription.update({
          data: { pendingPlanId: null, planId: next.id, planVersion: next.version },
          where: { id: sub.id }
        });
        await tx.tenantSubscriptionEvent.create({
          data: {
            changes: { planCode: next.code, when: "periodEnd" },
            fromPlanCode: sub.plan.code,
            fromStatus: sub.status,
            note: "Scheduled plan change",
            source: TenantSubscriptionEventSource.SYSTEM,
            subscriptionId: sub.id,
            tenantId: sub.tenantId,
            toPlanCode: next.code,
            toStatus: sub.status
          }
        });
      }
      switch (sub.status) {
        case TenantSubscriptionStatus.TRIALING:
          await applySubscriptionTransition(tx, { ...base, note: "Trial ended", to: TenantSubscriptionStatus.EXPIRED });
          return true;
        case TenantSubscriptionStatus.ACTIVE:
          await applySubscriptionTransition(tx, { ...base, note: "Payment due", to: TenantSubscriptionStatus.PAST_DUE });
          return true;
        case TenantSubscriptionStatus.PAST_DUE: {
          const pastDueUntil = (sub.currentPeriodEnd?.getTime() ?? 0) + lapse.pastDueDays * DAY_MS;
          if (pastDueUntil > now.getTime()) return Boolean(sub.pendingPlanId);
          await applySubscriptionTransition(tx, {
            ...base,
            data: { graceEndsAt: new Date(now.getTime() + lapse.graceDays * DAY_MS) },
            note: "Past-due period over: grace",
            to: TenantSubscriptionStatus.GRACE
          });
          return true;
        }
        case TenantSubscriptionStatus.GRACE:
          if (!sub.graceEndsAt || sub.graceEndsAt > now) return Boolean(sub.pendingPlanId);
          await applySubscriptionTransition(tx, { ...base, note: "Grace over", to: TenantSubscriptionStatus.EXPIRED });
          return true;
        case TenantSubscriptionStatus.CANCEL_SCHEDULED:
          await applySubscriptionTransition(tx, { ...base, note: "Cancelled at period end", to: TenantSubscriptionStatus.EXPIRED });
          return true;
        default:
          return Boolean(sub.pendingPlanId);
      }
    });
  }

  /** The pinned plan version's lapse policy, so editing a plan never shortens an existing academy's terms. */
  private async lapseFor(tx: PrismaTransactionClient, tenantId: string) {
    const sub = await tx.tenantSubscription.findUnique({ include: { plan: true }, where: { tenantId } });
    return pinnedLapsePolicy(tx, sub);
  }
}

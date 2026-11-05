import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type {
  CreatePlatformPlanRequest,
  DuplicatePlatformPlanRequest,
  PlatformPlansResponse,
  PlatformPlanSummary,
  UpdatePlatformPlanRequest
} from "@nexa-chess/types";
import { Prisma, TenantSubscriptionEventSource, type PlatformPlan } from "@prisma/client";
import { authenticateUser } from "../auth/authenticate";
import { isUniqueViolation } from "../payments/payments.util";
import { PrismaService } from "../prisma/prisma.service";
import { EntitlementService, toPlatformPlanSummary } from "./entitlement.service";
import { assertPlatformOperator, writePlatformAudit } from "./platform-operator";

/** What a plan version freezes (§G): everything an academy's access depends on. */
export function planSnapshot(plan: PlatformPlan): Prisma.InputJsonValue {
  return {
    currency: plan.currency,
    features: plan.features,
    graceAllows: plan.graceAllows,
    graceDays: plan.graceDays,
    limits: plan.limits as Prisma.InputJsonValue,
    name: plan.name,
    pastDueDays: plan.pastDueDays,
    priceMonthlyMinor: plan.priceMonthlyMinor,
    priceYearlyMinor: plan.priceYearlyMinor,
    trialDays: plan.trialDays
  };
}

/**
 * Plans in the console (docs/SAAS_MULTI_TENANCY.md §G "Plans"; Phase 4c).
 * Editing a plan bumps its version and freezes the new one; subscriptions keep
 * the version they signed up on until "apply to existing subscribers".
 */
@Injectable()
export class PlatformPlansService {
  constructor(
    private readonly entitlements: EntitlementService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  private async operator(accessToken: string | undefined) {
    return assertPlatformOperator(await authenticateUser(this.jwtService, this.prisma, accessToken));
  }

  async list(accessToken: string | undefined): Promise<PlatformPlansResponse> {
    await this.operator(accessToken);
    const plans = await this.prisma.platformPlan.findMany({ orderBy: [{ sortOrder: "asc" }, { code: "asc" }] });
    return { plans: plans.map(toPlatformPlanSummary) };
  }

  async create(accessToken: string | undefined, body: CreatePlatformPlanRequest): Promise<{ plan: PlatformPlanSummary }> {
    const actor = await this.operator(accessToken);
    const { lapse, ...fields } = body;
    try {
      const plan = await this.prisma.$transaction(async (tx) => {
        const created = await tx.platformPlan.create({
          data: { ...fields, graceAllows: lapse.graceAllows, graceDays: lapse.graceDays, pastDueDays: lapse.pastDueDays, version: 1 }
        });
        await tx.platformPlanVersion.create({
          data: { createdById: actor.id, planId: created.id, snapshot: planSnapshot(created), version: 1 }
        });
        await writePlatformAudit(tx, { action: "plan.create", actorUserId: actor.id, details: { code: created.code } });
        return created;
      });
      return { plan: toPlatformPlanSummary(plan) };
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException("A plan with that code already exists.");
      throw error;
    }
  }

  async duplicate(
    accessToken: string | undefined,
    id: string,
    body: DuplicatePlatformPlanRequest
  ): Promise<{ plan: PlatformPlanSummary }> {
    await this.operator(accessToken);
    const source = await this.planOrThrow(id);
    return this.create(accessToken, {
      code: body.code,
      contentPackIds: source.contentPackIds,
      currency: source.currency,
      description: source.description,
      features: source.features as CreatePlatformPlanRequest["features"],
      isPublic: false,
      lapse: {
        graceAllows: source.graceAllows as CreatePlatformPlanRequest["lapse"]["graceAllows"],
        graceDays: source.graceDays,
        pastDueDays: source.pastDueDays
      },
      limits: source.limits as CreatePlatformPlanRequest["limits"],
      name: body.name,
      priceMonthlyMinor: source.priceMonthlyMinor,
      priceYearlyMinor: source.priceYearlyMinor,
      sortOrder: source.sortOrder + 1,
      trialDays: source.trialDays
    });
  }

  /**
   * A new version: the plan row holds it, a frozen copy is kept, and every
   * subscription stays on the version it had (§G).
   */
  async update(
    accessToken: string | undefined,
    id: string,
    body: UpdatePlatformPlanRequest
  ): Promise<{ plan: PlatformPlanSummary }> {
    const actor = await this.operator(accessToken);
    await this.planOrThrow(id);
    const { lapse, ...fields } = body;
    const plan = await this.prisma.$transaction(async (tx) => {
      const before = await tx.platformPlan.findUniqueOrThrow({ where: { id } });
      // The version being replaced is frozen first if it never was (a plan seeded after the backfill).
      await tx.platformPlanVersion.upsert({
        create: { createdById: actor.id, planId: id, snapshot: planSnapshot(before), version: before.version },
        update: {},
        where: { planId_version: { planId: id, version: before.version } }
      });
      // Subscriptions that never recorded a version are pinned to the one they had.
      await tx.tenantSubscription.updateMany({ data: { planVersion: before.version }, where: { planId: id, planVersion: null } });
      const updated = await tx.platformPlan.update({
        data: {
          ...fields,
          ...(lapse ? { graceAllows: lapse.graceAllows, graceDays: lapse.graceDays, pastDueDays: lapse.pastDueDays } : {}),
          version: { increment: 1 }
        },
        where: { id }
      });
      await tx.platformPlanVersion.create({
        data: { createdById: actor.id, planId: id, snapshot: planSnapshot(updated), version: updated.version }
      });
      await writePlatformAudit(tx, {
        action: "plan.update",
        actorUserId: actor.id,
        details: { code: updated.code, version: updated.version }
      });
      return updated;
    });
    this.entitlements.invalidate();
    return { plan: toPlatformPlanSummary(plan) };
  }

  /** Retired: no new subscriptions; existing ones continue. */
  async retire(accessToken: string | undefined, id: string): Promise<{ plan: PlatformPlanSummary }> {
    const actor = await this.operator(accessToken);
    await this.planOrThrow(id);
    const plan = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.platformPlan.update({ data: { isActive: false, isPublic: false }, where: { id } });
      await writePlatformAudit(tx, { action: "plan.retire", actorUserId: actor.id, details: { code: updated.code } });
      return updated;
    });
    return { plan: toPlatformPlanSummary(plan) };
  }

  /** Moves every subscriber of the plan onto its current version, logged per academy. */
  async applyToExisting(accessToken: string | undefined, id: string): Promise<{ updated: number }> {
    const actor = await this.operator(accessToken);
    const plan = await this.planOrThrow(id);
    const behind = await this.prisma.tenantSubscription.findMany({
      where: { planId: id, OR: [{ planVersion: null }, { planVersion: { not: plan.version } }] }
    });
    await this.prisma.$transaction(async (tx) => {
      for (const sub of behind) {
        await tx.tenantSubscription.update({ data: { planVersion: plan.version }, where: { id: sub.id } });
        await tx.tenantSubscriptionEvent.create({
          data: {
            actorUserId: actor.id,
            changes: { fromVersion: sub.planVersion, toVersion: plan.version },
            fromPlanCode: plan.code,
            fromStatus: sub.status,
            note: `Moved to version ${plan.version} of ${plan.name}`,
            source: TenantSubscriptionEventSource.ADMIN,
            subscriptionId: sub.id,
            tenantId: sub.tenantId,
            toPlanCode: plan.code,
            toStatus: sub.status
          }
        });
        await writePlatformAudit(tx, {
          action: "plan.apply-to-existing",
          actorUserId: actor.id,
          details: { code: plan.code, fromVersion: sub.planVersion, toVersion: plan.version },
          targetTenantId: sub.tenantId
        });
      }
    });
    this.entitlements.invalidate();
    return { updated: behind.length };
  }

  private async planOrThrow(id: string) {
    const plan = await this.prisma.platformPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException("Plan not found.");
    return plan;
  }
}

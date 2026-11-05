import { Injectable } from "@nestjs/common";
import { LiveSessionStatus, UserRole, UserStatus } from "@prisma/client";
import {
  DEFAULT_TENANT_ID,
  isWithinLimit,
  resolveEntitlements,
  resolveLapsePolicy,
  resolveTenantAccessMode,
  sanitizePlanFeatures,
  sanitizePlanLimits,
  type CurrentEntitlementsResponse,
  type LapsePolicy,
  type PlanFeatureKey,
  type PlanLimitKey,
  type PlanUsage,
  type PlatformPlanSummary,
  type ResolvedEntitlements,
  type TenantAccessMode
} from "@nexa-chess/types";
import { PrismaService, type PrismaTransactionClient } from "../prisma/prisma.service";
import { currentTenantId as contextTenantId } from "../tenancy/tenant-context";
import { PlanRestrictionException } from "./plan-restriction.exception";

/** Every request reads this; plan changes are rare and call `invalidate()`. */
const CACHE_TTL_MS = 30_000;

type TenantRow = NonNullable<Awaited<ReturnType<EntitlementService["loadTenant"]>>>;

export type TenantEntitlementState = ResolvedEntitlements & {
  accessMode: TenantAccessMode;
  /** The lapse policy in force (plan version + the academy's overrides). */
  lapse: LapsePolicy;
  tenant: { id: string; name: string } | null;
  subscription: TenantRow["subscription"];
};

/**
 * The one place the API decides what an academy's plan allows
 * (docs/SAAS_PLANS.md). Feature checks run in `FeatureGateGuard`; limit
 * checks are called by the services that create the counted thing, inside
 * their transaction, under a transaction-scoped advisory lock so two
 * concurrent creates can't both take the last seat.
 */
@Injectable()
export class EntitlementService {
  /** Per academy: the request's academy now comes from TenantContext, so one slot would thrash. */
  private readonly cache = new Map<string, { at: number; state: Promise<TenantEntitlementState> }>();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * The request's academy (TenantContext). Outside one — crons, boot — Nexa,
   * the only academy until Phase 3 runs background work in `runInTenant`.
   */
  currentTenantId() {
    return contextTenantId() ?? DEFAULT_TENANT_ID;
  }

  /** Drops one academy's cached state, or every academy's. */
  invalidate(tenantId?: string) {
    if (tenantId) this.cache.delete(tenantId);
    else this.cache.clear();
  }

  private loadTenant(tenantId: string) {
    return this.prisma.tenant.findUnique({
      include: { subscription: { include: { plan: true } } },
      where: { id: tenantId }
    });
  }

  /**
   * The plan as this subscription has it: the frozen version it signed up on
   * when the plan has been edited since (§G), else the plan row.
   */
  private async effectivePlan(subscription: NonNullable<TenantRow["subscription"]>) {
    const { plan, planVersion } = subscription;
    if (planVersion === null || planVersion === plan.version) return plan;
    const frozen = await this.prisma.platformPlanVersion.findUnique({
      where: { planId_version: { planId: plan.id, version: planVersion } }
    });
    if (!frozen) return plan;
    const snapshot = (frozen.snapshot ?? {}) as Record<string, unknown>;
    return { ...plan, ...snapshot } as typeof plan;
  }

  private async computeState(tenantId: string): Promise<TenantEntitlementState> {
    const tenant = await this.loadTenant(tenantId);
    const subscription = tenant?.subscription ?? null;
    // No tenant or no subscription: fail closed.
    const accessMode = tenant
      ? resolveTenantAccessMode({ subscription, tenantStatus: tenant.status })
      : "LOCKED";
    const plan = subscription ? await this.effectivePlan(subscription) : null;
    const resolved = plan
      ? resolveEntitlements(plan, subscription?.overrides)
      : resolveEntitlements({ features: [], limits: {} });
    const lapse = resolveLapsePolicy(
      plan
        ? { graceAllows: plan.graceAllows as LapsePolicy["graceAllows"], graceDays: plan.graceDays, pastDueDays: plan.pastDueDays }
        : null,
      subscription?.overrides
    );
    return {
      ...resolved,
      accessMode,
      lapse,
      subscription,
      tenant: tenant ? { id: tenant.id, name: tenant.name } : null
    };
  }

  getState(tenantId = this.currentTenantId()): Promise<TenantEntitlementState> {
    const now = Date.now();
    const cached = this.cache.get(tenantId);
    if (cached && now - cached.at < CACHE_TTL_MS) return cached.state;
    const state = this.computeState(tenantId);
    this.cache.set(tenantId, { at: now, state });
    // A failed load must not be served from the cache for 30s.
    state.catch(() => {
      if (this.cache.get(tenantId)?.state === state) this.cache.delete(tenantId);
    });
    return state;
  }

  async getCurrent(): Promise<CurrentEntitlementsResponse> {
    const state = await this.getState();
    return {
      accessMode: state.accessMode,
      features: state.features,
      limits: state.limits,
      plan: state.subscription ? { code: state.subscription.plan.code, name: state.subscription.plan.name } : null,
      status: state.subscription?.status ?? null
    };
  }

  async hasFeature(feature: PlanFeatureKey) {
    return (await this.getState()).features.includes(feature);
  }

  async assertFeature(feature: PlanFeatureKey) {
    if (!(await this.hasFeature(feature))) throw PlanRestrictionException.featureRequired(feature);
  }

  // ── Limits ──────────────────────────────────────────

  /**
   * Serialises every create that counts against `limit` until the caller's
   * transaction ends. Transaction-scoped, so the pool can't leak it (unlike a
   * session advisory lock — CLAUDE.md §3.6b).
   */
  private async lockLimit(tx: PrismaTransactionClient, limit: PlanLimitKey) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`plan-limit:${this.currentTenantId()}:${limit}`}))`;
  }

  private async assertRoom(limit: PlanLimitKey, used: () => Promise<number>, adding = 1) {
    const { limits } = await this.getState();
    const value = limits[limit];
    if (value === null) return;
    if (!isWithinLimit(value, await used(), adding)) throw PlanRestrictionException.limitReached(limit, value);
  }

  private seatLimitFor(role: UserRole): PlanLimitKey | null {
    if (role === UserRole.STUDENT) return "maxStudents";
    if (role === UserRole.COACH) return "maxCoaches";
    return null;
  }

  /**
   * Call inside the transaction that makes `userId` an ACTIVE `role` user
   * (create, approve, restore, role/status change). Admin roles take no seat.
   */
  async assertSeatAvailable(tx: PrismaTransactionClient, role: UserRole, userId?: string) {
    const limit = this.seatLimitFor(role);
    if (!limit) return;
    await this.lockLimit(tx, limit);
    await this.assertRoom(limit, () =>
      tx.user.count({
        where: { role, status: UserStatus.ACTIVE, ...(userId ? { id: { not: userId } } : {}) }
      })
    );
  }

  /** Call inside the transaction that creates a batch. */
  async assertCanCreateBatch(tx: PrismaTransactionClient) {
    await this.lockLimit(tx, "maxBatches");
    await this.assertRoom("maxBatches", () => tx.batch.count());
  }

  /**
   * Before a class goes live. Not serialised: LiveKit room creation sits
   * between the check and the write, and a rare one-room overshoot is harmless.
   */
  async assertCanStartLiveClass(classId: string) {
    await this.assertRoom("maxConcurrentLiveClasses", () =>
      this.prisma.liveSession.count({ where: { classId: { not: classId }, status: LiveSessionStatus.LIVE } })
    );
  }

  async getUsage(): Promise<PlanUsage> {
    const [maxStudents, maxCoaches, maxBatches, maxConcurrentLiveClasses] = await Promise.all([
      this.prisma.user.count({ where: { role: UserRole.STUDENT, status: UserStatus.ACTIVE } }),
      this.prisma.user.count({ where: { role: UserRole.COACH, status: UserStatus.ACTIVE } }),
      this.prisma.batch.count(),
      this.prisma.liveSession.count({ where: { status: LiveSessionStatus.LIVE } })
    ]);
    return { maxBatches, maxCoaches, maxConcurrentLiveClasses, maxStudents };
  }
}

export function toPlatformPlanSummary(plan: {
  id: string;
  code: string;
  contentPackIds: string[];
  name: string;
  description: string | null;
  sortOrder: number;
  features: string[];
  limits: unknown;
  priceMonthlyMinor: number | null;
  priceYearlyMinor: number | null;
  currency: string;
  trialDays: number;
  isPublic: boolean;
  isActive: boolean;
  version: number;
  pastDueDays: number;
  graceDays: number;
  graceAllows: string[];
}): PlatformPlanSummary {
  return {
    code: plan.code,
    contentPackIds: plan.contentPackIds,
    currency: plan.currency,
    description: plan.description,
    features: sanitizePlanFeatures(plan.features),
    id: plan.id,
    isActive: plan.isActive,
    isPublic: plan.isPublic,
    limits: sanitizePlanLimits(plan.limits),
    name: plan.name,
    priceMonthlyMinor: plan.priceMonthlyMinor,
    priceYearlyMinor: plan.priceYearlyMinor,
    sortOrder: plan.sortOrder,
    trialDays: plan.trialDays,
    lapse: resolveLapsePolicy({
      graceAllows: plan.graceAllows as LapsePolicy["graceAllows"],
      graceDays: plan.graceDays,
      pastDueDays: plan.pastDueDays
    }),
    version: plan.version
  };
}

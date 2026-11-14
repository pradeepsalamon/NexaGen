import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma, TenantSubscriptionEventSource } from "@prisma/client";
import type {
  PlatformPlansResponse,
  PlatformPlanSummary,
  PlatformTenantSubscriptionResponse,
  UpdatePlatformPlanRequest,
  UpdateTenantSubscriptionRequest
} from "@nexa-chess/types";
import { authenticateUser } from "../auth/authenticate";
import { PrismaService } from "../prisma/prisma.service";
import { EntitlementService, toPlatformPlanSummary } from "./entitlement.service";
import { buildAdminSubscriptionView } from "./subscription.service";

const toDate = (value: string | null | undefined) =>
  value === undefined ? undefined : value === null ? null : new Date(value);

/**
 * Platform staff (NexaChess) manage plans and each academy's subscription.
 * A tenant role — even SUPER_ADMIN — is never enough: only a `PlatformStaff`
 * row is. Until online SaaS billing exists (SAAS_MULTI_TENANCY.md §G) this is
 * how a plan is assigned; every change appends a TenantSubscriptionEvent.
 */
@Injectable()
export class PlatformService {
  constructor(
    private readonly entitlements: EntitlementService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  private async assertPlatformStaff(accessToken: string | undefined) {
    const user = await authenticateUser(this.jwtService, this.prisma, accessToken, {
      include: { platformStaff: true }
    });
    if (!user.platformStaff) throw new ForbiddenException("Platform staff only.");
    return user;
  }

  async listPlans(accessToken: string | undefined): Promise<PlatformPlansResponse> {
    await this.assertPlatformStaff(accessToken);
    const plans = await this.prisma.platformPlan.findMany({ orderBy: { sortOrder: "asc" } });
    return { plans: plans.map(toPlatformPlanSummary) };
  }

  async updatePlan(
    accessToken: string | undefined,
    id: string,
    body: UpdatePlatformPlanRequest
  ): Promise<{ plan: PlatformPlanSummary }> {
    await this.assertPlatformStaff(accessToken);
    const existing = await this.prisma.platformPlan.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Plan not found.");
    const plan = await this.prisma.platformPlan.update({
      data: {
        currency: body.currency,
        description: body.description,
        features: body.features,
        isActive: body.isActive,
        isPublic: body.isPublic,
        limits: body.limits,
        name: body.name,
        priceMonthlyMinor: body.priceMonthlyMinor,
        priceYearlyMinor: body.priceYearlyMinor,
        sortOrder: body.sortOrder,
        trialDays: body.trialDays
      },
      where: { id }
    });
    this.entitlements.invalidate();
    return { plan: toPlatformPlanSummary(plan) };
  }

  private async assertTenantKnown(tenantId: string) {
    // Single tenant until the host resolver lands; any other id is unknown.
    if (tenantId !== this.entitlements.currentTenantId()) throw new NotFoundException("Tenant not found.");
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException("Tenant not found.");
  }

  private async view(tenantId: string): Promise<PlatformTenantSubscriptionResponse> {
    const [base, events] = await Promise.all([
      buildAdminSubscriptionView(this.prisma, this.entitlements),
      this.prisma.tenantSubscriptionEvent.findMany({ orderBy: { createdAt: "desc" }, take: 50, where: { tenantId } })
    ]);
    return {
      ...base,
      events: events.map((event) => ({
        actorUserId: event.actorUserId,
        createdAt: event.createdAt.toISOString(),
        fromPlanCode: event.fromPlanCode,
        fromStatus: event.fromStatus,
        id: event.id,
        note: event.note,
        source: event.source,
        toPlanCode: event.toPlanCode,
        toStatus: event.toStatus
      }))
    };
  }

  async getTenantSubscription(
    accessToken: string | undefined,
    tenantId: string
  ): Promise<PlatformTenantSubscriptionResponse> {
    await this.assertPlatformStaff(accessToken);
    await this.assertTenantKnown(tenantId);
    return this.view(tenantId);
  }

  async updateTenantSubscription(
    accessToken: string | undefined,
    tenantId: string,
    body: UpdateTenantSubscriptionRequest
  ): Promise<PlatformTenantSubscriptionResponse> {
    const actor = await this.assertPlatformStaff(accessToken);
    await this.assertTenantKnown(tenantId);

    const plan = body.planCode
      ? await this.prisma.platformPlan.findUnique({ where: { code: body.planCode } })
      : null;
    if (body.planCode && !plan) throw new NotFoundException("Plan not found.");

    await this.prisma.$transaction(async (tx) => {
      const current = await tx.tenantSubscription.findUnique({ include: { plan: true }, where: { tenantId } });
      const data = {
        currentPeriodEnd: toDate(body.currentPeriodEnd),
        currentPeriodStart: toDate(body.currentPeriodStart),
        graceEndsAt: toDate(body.graceEndsAt),
        overrides: body.overrides as Prisma.InputJsonValue | undefined,
        status: body.status,
        trialEndsAt: toDate(body.trialEndsAt)
      };
      let subscriptionId: string;
      if (current) {
        await tx.tenantSubscription.update({ data: { ...data, planId: plan?.id }, where: { id: current.id } });
        subscriptionId = current.id;
      } else {
        if (!plan) throw new NotFoundException("This tenant has no subscription yet; choose a plan.");
        subscriptionId = (await tx.tenantSubscription.create({ data: { ...data, planId: plan.id, tenantId } })).id;
      }
      const { note, ...changes } = body;
      await tx.tenantSubscriptionEvent.create({
        data: {
          actorUserId: actor.id,
          changes: changes as Prisma.InputJsonValue,
          fromPlanCode: current?.plan.code ?? null,
          fromStatus: current?.status ?? null,
          note: note ?? null,
          source: TenantSubscriptionEventSource.ADMIN,
          subscriptionId,
          tenantId,
          toPlanCode: plan?.code ?? current?.plan.code ?? null,
          toStatus: body.status ?? current?.status ?? null
        }
      });
    });
    this.entitlements.invalidate();
    return this.view(tenantId);
  }
}

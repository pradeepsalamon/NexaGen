import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma, TenantSubscriptionEventSource } from "@prisma/client";
import {
  isAllowedSubscriptionTransition,
  type PlatformTenantSubscriptionResponse,
  type UpdateTenantSubscriptionRequest
} from "@nexa-chess/types";
import { authenticateUser } from "../auth/authenticate";
import { PrismaService } from "../prisma/prisma.service";
import { runInTenant } from "../tenancy/tenant-context";
import { EntitlementService, pinnedLapsePolicy } from "./entitlement.service";
import { assertPlatformOperator, writePlatformAudit } from "./platform-operator";
import { buildAdminSubscriptionView } from "./subscription.service";

const toDate = (value: string | null | undefined) =>
  value === undefined ? undefined : value === null ? null : new Date(value);

/**
 * An academy's subscription as the platform console sees it, and the raw
 * subscription edit (docs/SAAS_MULTI_TENANCY.md §G, §I). Platform operators
 * only: Nexa's SUPER_ADMINs (`assertPlatformOperator`, §E); `PlatformStaff`
 * rows no longer grant anything. Plans are `PlatformPlansService`; status
 * changes keep to the §G state machine.
 */
@Injectable()
export class PlatformService {
  constructor(
    private readonly entitlements: EntitlementService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  private async operator(accessToken: string | undefined) {
    return assertPlatformOperator(await authenticateUser(this.jwtService, this.prisma, accessToken));
  }

  private async assertTenantKnown(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ select: { id: true }, where: { id: tenantId } });
    if (!tenant) throw new NotFoundException("Academy not found.");
  }

  /** The academy's view (in its own academy), plus the platform-only deal, payments and history. */
  async subscriptionView(tenantId: string): Promise<PlatformTenantSubscriptionResponse> {
    const [base, events, sub, payments] = await Promise.all([
      runInTenant(tenantId, "platform:subscription-view", () => buildAdminSubscriptionView(this.prisma, this.entitlements)),
      this.prisma.tenantSubscriptionEvent.findMany({ orderBy: { createdAt: "desc" }, take: 50, where: { tenantId } }),
      this.prisma.tenantSubscription.findUnique({ include: { pendingPlan: true, plan: true }, where: { tenantId } }),
      this.prisma.platformPayment.findMany({ orderBy: { createdAt: "desc" }, take: 50, where: { tenantId } })
    ]);
    // The pinned plan version's policy (what the sweep applies), not the live plan's.
    const lapse = await pinnedLapsePolicy(this.prisma, sub);
    return {
      ...base,
      deal: sub
        ? {
            currentPlanVersion: sub.plan.version,
            customPriceMinor: sub.customPriceMinor,
            lapse,
            note: sub.dealNote,
            pendingPlanCode: sub.pendingPlan?.code ?? null,
            planVersion: sub.planVersion
          }
        : null,
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
      })),
      payments: payments.map((payment) => ({
        amountMinor: payment.amountMinor,
        createdAt: payment.createdAt.toISOString(),
        currency: payment.currency,
        id: payment.id,
        method: payment.method,
        note: payment.note,
        periodEnd: payment.periodEnd.toISOString(),
        reference: payment.reference
      }))
    };
  }

  async getTenantSubscription(
    accessToken: string | undefined,
    tenantId: string
  ): Promise<PlatformTenantSubscriptionResponse> {
    await this.operator(accessToken);
    await this.assertTenantKnown(tenantId);
    return this.subscriptionView(tenantId);
  }

  /**
   * The raw edit (dates, overrides, plan, status). A status change must be an
   * allowed §G transition; a plan change moves the subscription onto the
   * plan's current version.
   */
  async updateTenantSubscription(
    accessToken: string | undefined,
    tenantId: string,
    body: UpdateTenantSubscriptionRequest
  ): Promise<PlatformTenantSubscriptionResponse> {
    const actor = await this.operator(accessToken);
    await this.assertTenantKnown(tenantId);

    const plan = body.planCode
      ? await this.prisma.platformPlan.findUnique({ where: { code: body.planCode } })
      : null;
    if (body.planCode && !plan) throw new NotFoundException("Plan not found.");

    await this.prisma.$transaction(async (tx) => {
      const current = await tx.tenantSubscription.findUnique({ include: { plan: true }, where: { tenantId } });
      if (current && body.status && !isAllowedSubscriptionTransition(current.status, body.status)) {
        throw new ConflictException(`A subscription can't go from ${current.status} to ${body.status}.`);
      }
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
        await tx.tenantSubscription.update({
          data: { ...data, ...(plan ? { planId: plan.id, planVersion: plan.version } : {}) },
          where: { id: current.id }
        });
        subscriptionId = current.id;
      } else {
        if (!plan) throw new NotFoundException("This academy has no subscription yet; choose a plan.");
        subscriptionId = (
          await tx.tenantSubscription.create({ data: { ...data, planId: plan.id, planVersion: plan.version, tenantId } })
        ).id;
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
      await writePlatformAudit(tx, {
        action: "subscription.update",
        actorUserId: actor.id,
        details: changes as Record<string, unknown>,
        reason: note,
        targetTenantId: tenantId
      });
    });
    this.entitlements.invalidate(tenantId);
    return this.subscriptionView(tenantId);
  }
}

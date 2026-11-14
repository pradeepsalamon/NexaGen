import { ForbiddenException, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { UserRole } from "@prisma/client";
import {
  entitlementOverridesSchema,
  type AdminSubscriptionResponse,
  type CurrentEntitlementsResponse
} from "@nexa-chess/types";
import { authenticateUser } from "../auth/authenticate";
import { PrismaService } from "../prisma/prisma.service";
import { EntitlementService, toPlatformPlanSummary } from "./entitlement.service";

/** The academy's own view of its SaaS plan. Changing the plan is platform staff only (PlatformService). */
@Injectable()
export class SubscriptionService {
  constructor(
    private readonly entitlements: EntitlementService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService
  ) {}

  private getAuthenticatedUser(accessToken: string | undefined) {
    return authenticateUser(this.jwtService, this.prisma, accessToken);
  }

  /** Any signed-in user: which features to show. Limits are included for admin-facing copy. */
  async getCurrent(accessToken: string | undefined): Promise<CurrentEntitlementsResponse> {
    await this.getAuthenticatedUser(accessToken);
    return this.entitlements.getCurrent();
  }

  async getAdminView(accessToken: string | undefined): Promise<AdminSubscriptionResponse> {
    const user = await this.getAuthenticatedUser(accessToken);
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException("Only administrators can view the academy's subscription.");
    }
    return buildAdminSubscriptionView(this.prisma, this.entitlements);
  }
}

export async function buildAdminSubscriptionView(
  prisma: PrismaService,
  entitlements: EntitlementService
): Promise<AdminSubscriptionResponse> {
  const [current, state, usage, plans] = await Promise.all([
    entitlements.getCurrent(),
    entitlements.getState(),
    entitlements.getUsage(),
    prisma.platformPlan.findMany({ orderBy: { sortOrder: "asc" }, where: { isActive: true, isPublic: true } })
  ]);
  const sub = state.subscription;
  const overrides = entitlementOverridesSchema.safeParse(sub?.overrides ?? {});
  return {
    ...current,
    plans: plans.map(toPlatformPlanSummary),
    subscription: sub
      ? {
          currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
          currentPeriodStart: sub.currentPeriodStart?.toISOString() ?? null,
          graceEndsAt: sub.graceEndsAt?.toISOString() ?? null,
          overrides: overrides.success ? overrides.data : { addFeatures: [], limits: {}, removeFeatures: [] },
          status: sub.status,
          trialEndsAt: sub.trialEndsAt?.toISOString() ?? null
        }
      : null,
    tenant: state.tenant ?? { id: entitlements.currentTenantId(), name: "" },
    usage
  };
}

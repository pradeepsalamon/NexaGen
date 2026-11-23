import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import { DEFAULT_TENANT_ID, isGraceAllowedPath } from "@nexa-chess/types";
import { verifyAccessToken } from "../auth/authenticate";
import { AUTH_COOKIE_NAMES } from "../auth/types";
import { PrismaService } from "../prisma/prisma.service";
import { asPlatform, getTenantContext } from "../tenancy/tenant-context";
import { EntitlementService } from "./entitlement.service";
import { PlanRestrictionException } from "./plan-restriction.exception";
import { REQUIRED_FEATURE_KEY, type RequiredFeature } from "./require-feature.decorator";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Reachable whatever the subscription state: signing in, health, the plan
 * pages themselves, the privacy export, platform staff, and provider webhooks
 * (a payment captured before a lapse must still settle).
 */
const ALWAYS_OPEN_PREFIXES = [
  "/admin/subscription",
  "/auth",
  "/health",
  "/payments/webhooks",
  "/platform",
  // The owner's gateway webhook: an academy's plan payment must settle even when it is locked.
  "/platform-billing",
  "/privacy",
  "/subscription",
  // The academy's public config and domain check: the login page needs them even when locked.
  "/tenant",
  "/webhooks"
];

export const isAlwaysOpenPath = (path: string) =>
  ALWAYS_OPEN_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

/**
 * Global guard (registered in AppModule after the throttler). Enforces the
 * subscription's access mode on every route and `@RequireFeature` where set.
 * Not authentication — every handler still authenticates as CLAUDE.md §3.2.
 */
@Injectable()
export class FeatureGateGuard implements CanActivate {
  // verifyAccessToken passes the secret itself, so no module config is needed.
  private readonly jwt = new JwtService({});

  constructor(
    private readonly entitlements: EntitlementService,
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true;
    const request = context.switchToHttp().getRequest<GateRequest>();
    if (isAlwaysOpenPath(request.path)) return true;

    await this.bindAcademyFromToken(request);
    const state = await this.entitlements.getState();
    if (state.accessMode === "LOCKED") throw PlanRestrictionException.locked();
    // Grace (§G "Lapse policy"): reads work, and so do the writes the lapse
    // policy keeps open (live classes, homework, fees, chat); admin growth never.
    if (
      state.accessMode === "READ_ONLY" &&
      !SAFE_METHODS.has(request.method) &&
      !isGraceAllowedPath(request.path, state.lapse.graceAllows)
    ) {
      throw PlanRestrictionException.readOnly();
    }

    const required = this.reflector.getAllAndOverride<RequiredFeature | null | undefined>(REQUIRED_FEATURE_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!required || state.features.includes(required.feature)) return true;
    if (required.allowReads && SAFE_METHODS.has(request.method)) return true;
    throw PlanRestrictionException.featureRequired(required.feature);
  }

  /**
   * Review T1: this guard runs before any handler's `authenticateUser`. When
   * the host, Origin and Referer name no academy (a direct API call with a
   * cookie), the plan would otherwise be the DEFAULT academy's, Nexa's
   * Enterprise, and every LOCKED, READ_ONLY and feature check would pass for
   * any academy. A signed-in caller's plan is their own academy's, so the
   * academy is taken from the token's user here, as `authenticateUser` would
   * (it then finds the same academy and binds the user). A bad token is left
   * for the handler's own 401; an anonymous call reaches only public routes.
   */
  private async bindAcademyFromToken(request: GateRequest): Promise<void> {
    const store = getTenantContext();
    if (!store || store.tenantId) return;
    const token = request.cookies?.[AUTH_COOKIE_NAMES.accessToken];
    if (!token) return;
    const payload = await verifyAccessToken(this.jwt, token).catch(() => null);
    if (!payload) return;
    const user = await asPlatform("feature gate: the token names the academy", () =>
      this.prisma.user.findUnique({ select: { tenantId: true }, where: { id: payload.sub } })
    );
    if (!user) return;
    store.tenantId = user.tenantId ?? DEFAULT_TENANT_ID;
    store.source = "user";
  }
}

type GateRequest = { cookies?: Record<string, string | undefined>; method: string; path: string };

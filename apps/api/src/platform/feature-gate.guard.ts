import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
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
  "/privacy",
  "/subscription",
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
  constructor(
    private readonly entitlements: EntitlementService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true;
    const request = context.switchToHttp().getRequest<{ method: string; path: string }>();
    if (isAlwaysOpenPath(request.path)) return true;

    const state = await this.entitlements.getState();
    if (state.accessMode === "LOCKED") throw PlanRestrictionException.locked();
    if (state.accessMode === "READ_ONLY" && !SAFE_METHODS.has(request.method)) {
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
}

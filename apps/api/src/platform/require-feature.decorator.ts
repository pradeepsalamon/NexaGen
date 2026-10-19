import { SetMetadata } from "@nestjs/common";
import type { PlanFeatureKey } from "@nexa-chess/types";

export const REQUIRED_FEATURE_KEY = "nexa:requiredPlanFeature";

export type RequiredFeature = {
  feature: PlanFeatureKey;
  /**
   * GET/HEAD stay open; only changes are gated. For state every live-class
   * participant reads on mount (a simul, a match, the activity queue): with the
   * feature off it is simply empty, so the room still loads.
   */
  allowReads: boolean;
};

/**
 * Marks a controller (or one handler) as part of a plan feature; the global
 * `FeatureGateGuard` refuses it with a 402 when the academy's plan lacks it.
 * On a handler, `null` exempts it from its controller's feature.
 */
export const RequireFeature = (feature: PlanFeatureKey | null, options: { allowReads?: boolean } = {}) =>
  SetMetadata<string, RequiredFeature | null>(
    REQUIRED_FEATURE_KEY,
    feature ? { allowReads: options.allowReads ?? false, feature } : null
  );

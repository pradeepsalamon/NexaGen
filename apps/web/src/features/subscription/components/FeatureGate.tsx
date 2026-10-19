"use client";

import type { ReactNode } from "react";
import type { PlanFeatureKey } from "@nexa-chess/types";
import { usePlanFeature } from "../hooks/useSubscription";
import { PlanUpgradeNotice } from "./PlanUpgradeNotice";

/**
 * Renders `children` unless the academy's plan is known to lack `feature`.
 * While the plan loads the children render: the API refuses a gated call with
 * a 402 anyway, and a lock flashing over every page load would be worse.
 */
export function FeatureGate({ children, feature }: { children: ReactNode; feature: PlanFeatureKey }) {
  const enabled = usePlanFeature(feature);
  if (enabled === false) return <PlanUpgradeNotice feature={feature} />;
  return <>{children}</>;
}

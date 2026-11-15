"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { PageContent } from "@/components/layout/PageContent";
import { featureForPath } from "../lib/featureRoutes";
import { usePlanFeature } from "../hooks/useSubscription";
import { PlanUpgradeNotice } from "./PlanUpgradeNotice";

function GatedRoute({ children, feature }: { children: ReactNode; feature: NonNullable<ReturnType<typeof featureForPath>> }) {
  const enabled = usePlanFeature(feature);
  if (enabled !== false) return <>{children}</>;
  // Replaces the role layout's own wrapper.
  return (
    <PageContent>
      <PlanUpgradeNotice feature={feature} />
    </PageContent>
  );
}

/**
 * Page-level plan gate for every route in `featureRoutes.ts`, mounted once in
 * `AppShell`. Renders the page while the plan loads (see `FeatureGate`).
 */
export function RouteFeatureGate({ children }: { children: ReactNode }) {
  const feature = featureForPath(usePathname() ?? "");
  if (!feature) return <>{children}</>;
  return <GatedRoute feature={feature}>{children}</GatedRoute>;
}

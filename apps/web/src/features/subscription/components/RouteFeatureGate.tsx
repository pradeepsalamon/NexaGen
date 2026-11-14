"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { featureForPath } from "../lib/featureRoutes";
import { usePlanFeature } from "../hooks/useSubscription";
import { PlanUpgradeNotice } from "./PlanUpgradeNotice";

function GatedRoute({ children, feature }: { children: ReactNode; feature: NonNullable<ReturnType<typeof featureForPath>> }) {
  const enabled = usePlanFeature(feature);
  if (enabled !== false) return <>{children}</>;
  // Replaces the role layout's own wrapper, so it repeats that padding (app/admin/layout.tsx).
  return (
    <div className="min-h-[calc(100dvh-64px)] bg-app-background">
      <main className="min-w-0 overflow-x-clip p-4 md:p-6 lg:p-8">
        <div className="mx-auto max-w-6xl">
          <PlanUpgradeNotice feature={feature} />
        </div>
      </main>
    </div>
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

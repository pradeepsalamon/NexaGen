import type { ReactNode } from "react";
import { RoleSidebar } from "@/components/layout/RoleSidebar";
import { SupportVisitBanner } from "@/features/platform/components/SupportVisitBanner";
import { RouteFeatureGate } from "@/features/subscription/components/RouteFeatureGate";

/**
 * Role area frame. From `xl` the nav's icon rail is fixed on the left, and
 * `--app-rail-w` (set before paint, 0 when signed out) offsets the page by the
 * rail only. Expanding the nav slides its panel over the page, so the page never
 * moves or resizes, on load or on toggle.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      {/* The rail's navy ground from first paint; the nav itself mounts over it. */}
      <div
        aria-hidden="true"
        className="fixed inset-y-0 left-0 z-20 hidden w-[var(--app-rail-w,0px)] py-2 pl-2 xl:block"
      >
        <div className="h-full rounded-panel bg-app-drawer" />
      </div>
      <RoleSidebar />
      {/* Fixed: the rail's width only. Opening the nav never touches this padding. */}
      <div className="xl:pl-[var(--app-rail-w,0px)]">
        <SupportVisitBanner />
        <RouteFeatureGate>{children}</RouteFeatureGate>
      </div>
    </>
  );
}

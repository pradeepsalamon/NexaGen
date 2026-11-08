import type { ReactNode } from "react";
import { RoleSidebar } from "@/components/layout/RoleSidebar";
import { SupportVisitBanner } from "@/features/platform/components/SupportVisitBanner";
import { RouteFeatureGate } from "@/features/subscription/components/RouteFeatureGate";

/**
 * Role area frame. From `xl` the nav is docked, and `--app-nav-w` (set before
 * paint from the saved collapse choice, 0 when signed out) reserves its column,
 * so pages never shift when the nav mounts after hydration.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      {/* The column's navy ground from first paint; the nav itself mounts over it. */}
      <div
        aria-hidden="true"
        className="fixed inset-y-0 left-0 z-20 hidden w-[var(--app-nav-w,0px)] py-2 pl-2 xl:block"
      >
        <div className="h-full rounded-panel bg-app-drawer" />
      </div>
      <RoleSidebar />
      {/* The offset jumps; only the nav column animates. Animating this padding re-laid out
          the whole page every frame, which is what made collapsing the nav stutter. */}
      <div className="xl:pl-[var(--app-nav-w,0px)]">
        <SupportVisitBanner />
        <RouteFeatureGate>{children}</RouteFeatureGate>
      </div>
    </>
  );
}

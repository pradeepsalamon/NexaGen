import type { ReactNode } from "react";
import { RoleSidebar } from "@/components/layout/RoleSidebar";
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
        className="fixed bottom-0 left-0 top-16 z-20 hidden w-[var(--app-nav-w,0px)] bg-app-drawer xl:block"
      />
      <RoleSidebar />
      <div className="xl:pl-[var(--app-nav-w,0px)] motion-safe:transition-[padding] motion-safe:duration-200">
        <RouteFeatureGate>{children}</RouteFeatureGate>
      </div>
    </>
  );
}

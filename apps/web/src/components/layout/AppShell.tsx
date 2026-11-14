import type { ReactNode } from "react";
import { RoleSidebar } from "@/components/layout/RoleSidebar";
import { RouteFeatureGate } from "@/features/subscription/components/RouteFeatureGate";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <RoleSidebar />
      <RouteFeatureGate>{children}</RouteFeatureGate>
    </>
  );
}

import type { ReactNode } from "react";
import { MobileNavDrawer } from "@/components/layout/MobileNavDrawer";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <MobileNavDrawer />
    </>
  );
}

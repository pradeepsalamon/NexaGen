import type { ReactNode } from "react";
import { RoleSidebar } from "@/components/layout/RoleSidebar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <RoleSidebar />
      {children}
    </>
  );
}

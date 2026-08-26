import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <div className="pb-24 md:pb-0">{children}</div>
    </AppShell>
  );
}

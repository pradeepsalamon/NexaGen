import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { PageContent } from "@/components/layout/PageContent";

export default function StudentDashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <PageContent>{children}</PageContent>
    </AppShell>
  );
}

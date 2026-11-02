import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { PageContent } from "@/components/layout/PageContent";

export default function SalesLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <PageContent>{children}</PageContent>
    </AppShell>
  );
}

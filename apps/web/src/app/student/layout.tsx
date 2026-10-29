import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";

export default function StudentDashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <div className="min-h-[calc(100dvh-64px)] bg-nx-page text-nx-ink transition-colors duration-200">
        <main className="min-w-0 overflow-x-clip px-4 py-5 sm:px-8 sm:py-6 lg:px-10 lg:py-7">
          <div className="mx-auto max-w-[1180px]">{children}</div>
        </main>
      </div>
    </AppShell>
  );
}

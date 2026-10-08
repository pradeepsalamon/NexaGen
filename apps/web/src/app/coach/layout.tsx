import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";

export default function CoachLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <div className="min-h-[calc(100vh-64px)] bg-app-background">
        <main className="min-w-0 overflow-x-clip p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </main>
      </div>
    </AppShell>
  );
}

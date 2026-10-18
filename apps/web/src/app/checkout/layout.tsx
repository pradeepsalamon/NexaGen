import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <main className="min-h-[calc(100dvh-64px)] min-w-0 overflow-x-clip bg-app-background px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </AppShell>
  );
}

"use client";

import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useTheme } from "@/providers/ThemeProvider";

export default function StudentDashboardLayout({
  children
}: {
  children: ReactNode;
}) {
  const { mode, isHydrated } = useTheme();
  const isDark = isHydrated && mode === "dark";

  return (
    <AppShell>
      <div
        className={`min-h-[calc(100dvh-64px)] transition-colors duration-200 ${isDark ? "bg-[#040D1F] text-white" : "bg-[#F8FAFC] text-[#071B41]"
          }`}
      >
        <main className="min-w-0 overflow-x-clip px-4 py-5 sm:px-8 sm:py-6 lg:px-10 lg:py-7">
          <div className="mx-auto max-w-[1180px]">{children}</div>
        </main>
      </div>
    </AppShell>
  );
}
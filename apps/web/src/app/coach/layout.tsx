import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { CoachSidebar } from "@/components/layout/CoachSidebar";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const AUTH_COOKIE_NAME = "nexagen_access_token";

export default function CoachLayout({ children }: { children: ReactNode }) {
  const hasAccessToken = Boolean(cookies().get(AUTH_COOKIE_NAME)?.value);

  if (!hasAccessToken) {
    redirect("/login?next=/coach&reason=unauthorized");
  }

  return (
    <AppShell>
      <div className="flex min-h-[calc(100vh-64px)] bg-app-background">
        <CoachSidebar />
        <main className="flex-1 overflow-x-hidden p-6 md:p-8">
          <div className="mx-auto max-w-6xl">
            {children}
          </div>
        </main>
      </div>
    </AppShell>
  );
}

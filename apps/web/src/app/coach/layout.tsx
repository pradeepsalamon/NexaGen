import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const AUTH_COOKIE_NAME = "nexa_access_token";

export default function CoachLayout({ children }: { children: ReactNode }) {
  const hasAccessToken = Boolean(cookies().get(AUTH_COOKIE_NAME)?.value);

  const hasRefreshToken = Boolean(cookies().get("nexa_refresh_token")?.value);

  if (!hasAccessToken && !hasRefreshToken) {
    redirect("/login?reason=unauthorized");
  }

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

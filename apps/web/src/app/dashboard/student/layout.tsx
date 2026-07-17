import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { StudentSidebar } from "@/components/layout/StudentSidebar";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const AUTH_COOKIE_NAME = "nexa_access_token";

export default function StudentDashboardLayout({ children }: { children: ReactNode }) {
  const hasAccessToken = Boolean(cookies().get(AUTH_COOKIE_NAME)?.value);

  if (!hasAccessToken) {
    redirect("/login?next=/dashboard/student&reason=unauthorized");
  }

  return (
    <AppShell>
      <div className="flex min-h-[calc(100vh-64px)] bg-app-background">
        <StudentSidebar />
        <main className="flex-1 overflow-x-hidden p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </AppShell>
  );
}

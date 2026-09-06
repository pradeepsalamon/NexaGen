"use client";

import { LayoutDashboard, Loader2, LogIn } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";
import { UserNavMenu } from "@/components/layout/UserNavMenu";
import { NotificationBell } from "@/features/notifications/components/NotificationBell";
import { getRoleDashboardHref, useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";

const pageTitles: Record<string, string> = {
  "/": "Nexa Chess",
  "/admin": "Admin Analytics",
  "/admin/analytics/users": "User Analytics",
  "/admin/analytics/acquisition": "Acquisition Analytics",
  "/admin/analytics/coaches": "Coach Analytics",
  "/admin/analytics/classes": "Class Analytics",
  "/admin/analytics/attendance": "Attendance Analytics",
  "/admin/analytics/batches": "Batch Analytics",
  "/admin/analytics/recordings": "Recordings & Storage",
  "/admin/analytics/engagement": "Engagement Analytics",
  "/admin/analytics/operations": "Operations",
  "/admin/backups": "Database Backups",
  "/admin/batches": "Batch management",
  "/admin/coaches": "Coach applications",
  "/admin/trash": "Trash",
  "/admin/users": "User management",
  "/coach": "Coach Dashboard",
  "/coach/batches": "My Batches",
  "/coach/schedule": "Schedule",
  "/coach/students": "Students",
  "/coach/history": "Class History",
  "/student": "Student Dashboard",
  "/student/courses": "My Courses",
  "/student/batches": "My Batches",
  "/student/live-classes": "Live Classes",
  "/student/schedule": "Schedule",
  "/student/practice": "Practice",
  "/student/progress": "Progress",
  "/student/attendance": "Attendance",
  "/forgot-password": "Account Help",
  "/login": "Login",
  "/profile": "My Profile",
  "/register": "Register",
  "/reset-password": "Reset Password"
};

function formatPageTitle(pathname: string) {
  if (pageTitles[pathname]) {
    return pageTitles[pathname];
  }

  if (pathname.startsWith("/classes/")) {
    return "Class Details";
  }

  if (pathname.startsWith("/live-class/")) {
    return "Live Class";
  }

  const currentSegment = pathname.split("/").filter(Boolean).at(-1);

  if (!currentSegment) {
    return "Dashboard";
  }

  return currentSegment
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function Header({
  centerSlot,
  rightSlot,
  leftSlot,
  compact = false,
}: {
  centerSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  leftSlot?: React.ReactNode;
  /**
   * Trims the header for immersive screens (live class / summary): hides the
   * Dashboard CTA and notification bell below `sm` so the bar doesn't overflow
   * on a phone. No effect on `sm+` or when omitted.
   */
  compact?: boolean;
} = {}) {
  const pathname = usePathname();
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const isSessionChecked = useAuthStore((state) => state.isSessionChecked);
  const isSessionLoading = useAuthStore((state) => state.isSessionLoading);
  const user = useAuthStore((state) => state.user);
  const pageTitle = formatPageTitle(pathname);
  const isAuthPending = !isHydrated || isSessionLoading || !isSessionChecked;
  const activeUser = isSessionChecked ? user : undefined;

  const dashboardHref = getRoleDashboardHref(activeUser?.role);
  const homeHref = activeUser ? dashboardHref : "/";

  return (
    <header className="fixed inset-x-0 top-0 z-40 h-16 border-b border-app-border bg-app-surface/95 shadow-[0_1px_0_rgba(16,24,40,0.02)] backdrop-blur supports-[backdrop-filter]:bg-app-surface/[0.88]">
      <div className="mx-auto grid h-full w-full max-w-7xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 min-w-0 justify-self-start">
          <Link
            aria-label={activeUser ? "Go to Dashboard" : "Go to Home"}
            className="shrink-0 rounded-control transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
            href={homeHref}
          >
            <Logo
              compact
              size={40}
              wordmarkClassName={compact ? "hidden sm:block" : undefined}
            />
          </Link>
          {leftSlot}
        </div>
        {centerSlot ? (
          centerSlot
        ) : (
          <h1 className="max-w-[42vw] truncate text-center text-sm font-extrabold text-app-text sm:max-w-none sm:text-base">
            {pageTitle}
          </h1>
        )}
        <div className="flex items-center gap-2 justify-self-end">
          {rightSlot}
          {activeUser && (
            <Link
              className={cn(
                "min-h-9 items-center gap-2 rounded-control border px-3 text-xs font-extrabold shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus sm:text-sm",
                compact ? "hidden lg:inline-flex" : "inline-flex",
                pathname.startsWith(dashboardHref) && dashboardHref !== "/"
                  ? "border-primary bg-primary text-white"
                  : "border-app-border bg-app-soft text-app-text hover:border-primary/50 hover:bg-app-soft/80"
              )}
              href={dashboardHref}
            >
              <LayoutDashboard aria-hidden="true" className="size-4" strokeWidth={2.5} />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
          )}
          {activeUser && (
            <span className={cn(compact && "hidden lg:block")}>
              <NotificationBell />
            </span>
          )}
          <span className={cn(compact && "hidden sm:block")}>
            <ThemeToggle />
          </span>
          {isAuthPending ? (
            <div
              aria-label="Checking session"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-app-border bg-app-soft text-app-muted shadow-card"
              role="status"
            >
              <Loader2
                aria-hidden="true"
                className="size-4 animate-spin"
                strokeWidth={2.5}
              />
            </div>
          ) : activeUser ? (
            <UserNavMenu user={activeUser} />
          ) : (
            <Link
              className="inline-flex min-h-10 items-center gap-2 rounded-control border border-app-border bg-primary px-3 text-sm font-extrabold text-white shadow-card transition hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus sm:px-4"
              href="/login"
            >
              <LogIn aria-hidden="true" className="size-4" strokeWidth={2.5} />
              <span className="hidden sm:inline">Login</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}


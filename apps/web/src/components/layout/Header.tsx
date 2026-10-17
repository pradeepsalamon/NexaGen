"use client";

import { LayoutDashboard, Loader2, LogIn, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";
import { UserNavMenu } from "@/components/layout/UserNavMenu";
import { NotificationBell } from "@/features/notifications/components/NotificationBell";
import { getRoleDashboardHref, useAuthStore } from "@/stores/authStore";
import { useSidebarStore } from "@/stores/sidebarStore";
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
  "/admin/feedback": "Coach Feedback",
  "/admin/typography": "Fonts & Text",
  "/admin/class-requests": "Class Requests",
  "/admin/privacy": "Privacy",
  "/admin/finance/invoices": "Invoices",
  "/admin/finance/coach-payroll": "Coach Payroll",
  "/admin/puzzles": "Puzzle Library",
  "/admin/courses": "Courses",
  "/admin/approvals": "Approvals",
  "/admin/trash": "Trash",
  "/admin/users": "User management",
  "/coach": "Coach Dashboard",
  "/coach/batches": "My Batches",
  "/coach/schedule": "Schedule",
  "/coach/students": "Students",
  "/coach/feedback": "My Feedback",
  "/coach/history": "Class History",
  "/coach/puzzles": "Puzzles",
  "/coach/earnings": "Earnings",
  "/student": "Student Dashboard",
  "/student/courses": "My Courses",
  "/student/batches": "My Batches",
  "/student/live-classes": "Live Classes",
  "/student/schedule": "Schedule",
  "/student/practice": "Practice",
  "/student/progress": "Progress",
  "/student/attendance": "Attendance",
  "/student/billing": "Billing",
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

  if (/^\/(admin|coach)\/puzzles\//.test(pathname)) {
    if (pathname.endsWith("/new")) return "New puzzle";
    if (pathname.endsWith("/edit")) return "Edit puzzle";
    return "Puzzle";
  }

  if (pathname.startsWith("/student/puzzles/")) {
    return "Solve puzzle";
  }

  // A course id is a cuid; showing it raw as the page title reads as noise.
  if (pathname.startsWith("/admin/courses/")) {
    return pathname.endsWith("/new") ? "New course" : "Course";
  }
  if (pathname.startsWith("/student/courses/")) {
    return "Course";
  }

  // An invoice id is a cuid; showing it raw as the page title reads as noise.
  if (
    pathname.startsWith("/admin/finance/invoices/") ||
    pathname.startsWith("/student/billing/invoices/")
  ) {
    return "Invoice";
  }

  // A payroll period id is a cuid; showing it raw as the page title reads as noise.
  if (pathname.startsWith("/admin/finance/coach-payroll/periods/")) {
    return "Payroll Period";
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
  openLinksInNewTab = false,
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
  /**
   * Live class only: the logo/Dashboard links and notification navigation open
   * in a new tab instead of routing the current tab away, which would unmount
   * the LiveKit room and disconnect the user. Backgrounding the class tab this
   * way is also what lets the browser's auto Picture-in-Picture kick in.
   */
  openLinksInNewTab?: boolean;
} = {}) {
  const pathname = usePathname();
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const isSessionChecked = useAuthStore((state) => state.isSessionChecked);
  const isSessionLoading = useAuthStore((state) => state.isSessionLoading);
  const user = useAuthStore((state) => state.user);
  const pageTitle = formatPageTitle(pathname);
  const hasSidebar = useSidebarStore((state) => state.available);
  const sidebarOpen = useSidebarStore((state) => state.open);
  const toggleSidebar = useSidebarStore((state) => state.toggle);
  const isAuthPending = !isHydrated || isSessionLoading || !isSessionChecked;
  const activeUser = isSessionChecked ? user : undefined;

  const dashboardHref = getRoleDashboardHref(activeUser?.role);
  const homeHref = activeUser ? dashboardHref : "/";

  return (
    <header className="fixed inset-x-0 top-0 z-40 h-16 border-b border-app-border bg-app-surface/95 shadow-[0_1px_0_rgba(16,24,40,0.02)] backdrop-blur supports-[backdrop-filter]:bg-app-surface/[0.88]">
      <div
        className={cn(
          "mx-auto grid h-full w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-3 sm:px-6 lg:px-8",
          // The classroom's right cluster (connection, timer, account…) is too
          // wide for a 7xl column and would spill into the centred title.
          compact ? "max-w-none" : "max-w-7xl"
        )}
      >
        <div className="flex min-w-0 items-center gap-2 justify-self-start sm:gap-3">
          {hasSidebar ? (
            <button
              aria-expanded={sidebarOpen}
              aria-label="Open menu"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-primary-ink transition hover:bg-app-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus sm:size-10"
              onClick={toggleSidebar}
              type="button"
            >
              <Menu aria-hidden="true" className="size-5" strokeWidth={2.5} />
            </button>
          ) : null}
          <Link
            aria-label={activeUser ? "Go to Dashboard" : "Go to Home"}
            className="shrink-0 rounded-control transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
            href={homeHref}
            {...(openLinksInNewTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            <Logo compact iconOnlyOnMobile size={40} />
          </Link>
          {leftSlot}
        </div>
        {centerSlot ? (
          centerSlot
        ) : (
          <h1 className="hidden max-w-[42vw] truncate text-center text-sm font-extrabold text-app-text sm:block sm:max-w-none sm:text-base">
            {pageTitle}
          </h1>
        )}
        <div className="flex items-center gap-2 justify-self-end">
          {rightSlot}
          {activeUser && (
            <Link
              className={cn(
                "min-h-9 items-center gap-2 rounded-control border px-3 text-xs font-extrabold shadow-card transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus sm:text-sm",
                compact ? "hidden lg:inline-flex" : hasSidebar ? "hidden sm:inline-flex" : "inline-flex",
                pathname.startsWith(dashboardHref) && dashboardHref !== "/"
                  ? "border-primary bg-primary text-white"
                  : "border-app-border bg-app-soft text-app-text hover:border-primary/50 hover:bg-app-soft/80"
              )}
              href={dashboardHref}
              {...(openLinksInNewTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            >
              <LayoutDashboard aria-hidden="true" className="size-4" strokeWidth={2.5} />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
          )}
          {activeUser && (
            <span className={cn(compact && "hidden lg:block")}>
              <NotificationBell openLinksInNewTab={openLinksInNewTab} />
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
            <UserNavMenu user={activeUser} openLinksInNewTab={openLinksInNewTab} />
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


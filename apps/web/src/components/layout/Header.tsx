"use client";

import { Loader2, LogIn } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/Logo";
import { UserAvatar } from "@/components/common/UserAvatar";
import { useAuthStore } from "@/stores/authStore";

const pageTitles: Record<string, string> = {
  "/": "Nexa Chess",
  "/admin": "Overview",
  "/admin/batches": "Batch management",
  "/admin/coaches": "Coach applications",
  "/admin/trash": "Trash",
  "/admin/users": "User management",
  "/coach": "Coach Dashboard",
  "/coach/batches": "My Batches",
  "/coach/schedule": "Schedule",
  "/coach/students": "Students",
  "/coach/history": "Class History",
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
}: {
  centerSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  leftSlot?: React.ReactNode;
} = {}) {
  const pathname = usePathname();
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const isSessionChecked = useAuthStore((state) => state.isSessionChecked);
  const isSessionLoading = useAuthStore((state) => state.isSessionLoading);
  const user = useAuthStore((state) => state.user);
  const pageTitle = formatPageTitle(pathname);
  const isAuthPending = !isHydrated || isSessionLoading || !isSessionChecked;
  const activeUser = isSessionChecked ? user : undefined;

  const homeHref = activeUser?.role === "SUPER_ADMIN" ? "/admin" : activeUser?.role === "COACH" ? "/coach" : "/";

  return (
    <header className="fixed inset-x-0 top-0 z-40 h-16 border-b border-app-border bg-app-surface/95 shadow-[0_1px_0_rgba(16,24,40,0.02)] backdrop-blur supports-[backdrop-filter]:bg-app-surface/88">
      <div className="mx-auto grid h-full w-full max-w-7xl grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3 min-w-0 justify-self-start">
          <Link
            aria-label={activeUser ? "Go to Dashboard" : "Go to Home"}
            className="shrink-0 rounded-control transition hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
            href={homeHref}
          >
            <Logo compact size={40}/>
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
          <ThemeToggle />
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
            <UserAvatar user={activeUser} />
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

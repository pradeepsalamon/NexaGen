"use client";

import { LifeBuoy, Loader2, LogIn, Menu, Sun, Moon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { UserNavMenu } from "@/components/layout/UserNavMenu";
import { NotificationBell } from "@/features/notifications/components/NotificationBell";
import { getRoleDashboardHref, useAuthStore } from "@/stores/authStore";
import { useSidebarStore } from "@/stores/sidebarStore";
import { useTheme } from "@/providers/ThemeProvider";
import { resolvePageTitle } from "@/lib/pageTitles";
import { cn } from "@/lib/utils";

export function Header({
  centerSlot,
  rightSlot,
  leftSlot,
  compact = false,
  openLinksInNewTab = false
}: {
  centerSlot?: React.ReactNode;
  rightSlot?: React.ReactNode;
  leftSlot?: React.ReactNode;
  compact?: boolean;
  openLinksInNewTab?: boolean;
} = {}) {
  const pathname = usePathname();
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const isSessionChecked = useAuthStore((state) => state.isSessionChecked);
  const isSessionLoading = useAuthStore((state) => state.isSessionLoading);
  const user = useAuthStore((state) => state.user);
  const pageTitle = resolvePageTitle(pathname);
  const hasSidebar = useSidebarStore((state) => state.available);
  const sidebarOpen = useSidebarStore((state) => state.open);
  const toggleSidebar = useSidebarStore((state) => state.toggle);

  const { mode, toggleMode, isHydrated: themeHydrated } = useTheme();
  const isDark = themeHydrated && mode === "dark";

  const isAuthPending = !isHydrated || isSessionLoading || !isSessionChecked;
  const activeUser = isSessionChecked ? user : undefined;

  const dashboardHref = getRoleDashboardHref(activeUser?.role);
  const homeHref = activeUser ? dashboardHref : "/";

  return (
    <header className="fixed inset-x-0 top-0 z-40 h-16 border-b border-nx-line bg-nx-bar text-nx-ink transition-colors duration-200">
      <div className="mx-auto flex h-full w-full max-w-[1360px] items-center justify-between gap-2 px-3 sm:px-6 lg:px-8">
        {/* Left: Mobile Hamburger + Logo */}
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-3 shrink-0">
          {hasSidebar ? (
            <button
              aria-expanded={sidebarOpen}
              aria-label="Open menu"
              className={cn(
                "lg:hidden inline-flex size-8 sm:size-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                "text-nx-ink hover:bg-nx-hover-faint"
              )}
              onClick={toggleSidebar}
              type="button"
            >
              <Menu aria-hidden="true" className="size-5" strokeWidth={2.2} />
            </button>
          ) : null}

          <Link
            aria-label={activeUser ? "Go to Dashboard" : "Go to Home"}
            className="shrink-0 flex items-center transition hover:opacity-90"
            href={homeHref}
            {...(openLinksInNewTab
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            {/* Both logos render; CSS shows the current theme's (no flash before hydration). */}
            <Image
              src="/academy/nexa_logo_light1.png"
              alt="NEXA Chess"
              width={140}
              height={38}
              priority
              className="h-7 w-auto max-w-[108px] sm:max-w-none sm:h-9 object-contain object-left dark:hidden"
            />
            <Image
              src="/academy/nexa_logo_dark1.png"
              alt="NEXA Chess"
              width={140}
              height={38}
              className="hidden h-7 w-auto max-w-[108px] sm:max-w-none sm:h-9 object-contain object-left dark:block"
            />
          </Link>

          {leftSlot}
        </div>

        {/* Center: the caller's slot, else the page name from PAGE_TITLES. Not a
            heading: each page's PageHeader owns the one <h1>. */}
        {centerSlot ? (
          <div className="hidden md:block min-w-0 truncate">{centerSlot}</div>
        ) : (
          <p className="hidden min-w-0 truncate text-center font-display text-base font-extrabold text-nx-ink lg:block">
            {activeUser ? pageTitle : null}
          </p>
        )}

        {/* Right Controls: Cleanly spaced so it never collides with the left Logo */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {rightSlot}

          {activeUser && !pathname.startsWith("/help") && (
            <span className={cn("hidden sm:block", compact && "sm:hidden lg:block")}>
              {/* Page-aware help: the help centre lists articles tagged for the page you came from. */}
              <SimpleTooltip label="Help">
                <Link
                  aria-label="Help"
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-app-border bg-app-soft text-app-text shadow-card transition hover:border-primary/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
                  href={`/help?from=${encodeURIComponent(pathname)}`}
                  {...(openLinksInNewTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                >
                  <LifeBuoy aria-hidden="true" className="size-4" strokeWidth={2.5} />
                </Link>
              </SimpleTooltip>
            </span>
          )}
          {activeUser && (
            <span className={cn("shrink-0", compact && "hidden lg:block")}>
              <NotificationBell openLinksInNewTab={openLinksInNewTab} />
            </span>
          )}

          {/* Compact single-icon theme button on mobile; full pill on sm+ */}
          <button
            type="button"
            onClick={toggleMode}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className={cn(
              "sm:hidden inline-flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors",
              "bg-nx-tile border-nx-line text-nx-gold-bright-ink"
            )}
          >
            {isDark ? (
              <Moon className="size-3.5" strokeWidth={2.2} />
            ) : (
              <Sun className="size-3.5" strokeWidth={2.2} />
            )}
          </button>

          <span className="hidden sm:block shrink-0">
            <ThemeToggle />
          </span>

          {isAuthPending ? (
            <div
              aria-label="Checking session"
              className={cn(
                "inline-flex size-8 sm:size-9 shrink-0 items-center justify-center rounded-full border",
                "border-nx-line bg-nx-tile text-nx-muted"
              )}
              role="status"
            >
              <Loader2
                aria-hidden="true"
                className="size-4 animate-spin"
                strokeWidth={2.5}
              />
            </div>
          ) : activeUser ? (
            <UserNavMenu
              user={activeUser}
              openLinksInNewTab={openLinksInNewTab}
            />
          ) : pathname === "/login" ? null : (
            <Link
              className="inline-flex h-8 sm:h-9 items-center gap-1.5 rounded-full bg-nx-emphasis px-3 sm:px-4 text-xs font-bold text-nx-ink-inverse transition hover:opacity-90"
              aria-label="Log in"
              href="/login"
            >
              <LogIn aria-hidden="true" className="size-3.5" strokeWidth={2.4} />
              <span className="hidden xs:inline">Log in</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
"use client";

import { LifeBuoy, LogIn, Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/Button";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { HEADER_ICON_BUTTON } from "@/components/layout/headerStyles";
import { NAV_DOCKED_QUERY } from "@/components/layout/Sidebar";
import { UserNavMenu } from "@/components/layout/UserNavMenu";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { NotificationBell } from "@/features/notifications/components/NotificationBell";
import { getRoleDashboardHref, useAuthStore } from "@/stores/authStore";
import { useSidebarStore } from "@/stores/sidebarStore";
import { resolvePageTitle } from "@/lib/pageTitles";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/Spinner";

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
  const navCollapsed = useSidebarStore((state) => state.collapsed);
  const toggleNavCollapsed = useSidebarStore((state) => state.toggleCollapsed);
  // From `xl` the nav is docked: the same button collapses it to a rail instead of opening a drawer.
  const navDocked = useMediaQuery(NAV_DOCKED_QUERY);

  const isAuthPending = !isHydrated || isSessionLoading || !isSessionChecked;
  const activeUser = isSessionChecked ? user : undefined;

  const dashboardHref = getRoleDashboardHref(activeUser?.role);
  const homeHref = activeUser ? dashboardHref : "/";

  return (
    <header className="surface-brand fixed inset-x-0 top-0 z-40 h-16 border-b border-app-border bg-brand-800 px-3 text-on-brand sm:px-4 md:px-6 lg:px-8">
      {/* Docked nav: the menu button and logo sit over the nav column, not in the centred page width. */}
      <div
        className={cn(
          "mx-auto flex h-full w-full items-center justify-between gap-2",
          hasSidebar && navDocked ? "max-w-none" : "max-w-7xl"
        )}
      >
        {/* Left: menu + logo */}
        <div className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-3">
          {hasSidebar && navDocked ? (
            <SimpleTooltip label={navCollapsed ? "Expand menu" : "Collapse menu"} side="bottom">
              <button
                aria-controls="nav-drawer"
                aria-expanded={!navCollapsed}
                aria-label={navCollapsed ? "Expand menu" : "Collapse menu"}
                className={HEADER_ICON_BUTTON}
                onClick={toggleNavCollapsed}
                type="button"
              >
                {navCollapsed ? (
                  <PanelLeftOpen aria-hidden="true" className="size-5" strokeWidth={2.25} />
                ) : (
                  <PanelLeftClose aria-hidden="true" className="size-5" strokeWidth={2.25} />
                )}
              </button>
            </SimpleTooltip>
          ) : hasSidebar ? (
            <button
              aria-controls="nav-drawer"
              aria-expanded={sidebarOpen}
              aria-label={sidebarOpen ? "Close menu" : "Open menu"}
              className={HEADER_ICON_BUTTON}
              onClick={toggleSidebar}
              type="button"
            >
              {sidebarOpen ? (
                <X aria-hidden="true" className="size-5" strokeWidth={2.25} />
              ) : (
                <Menu aria-hidden="true" className="size-5" strokeWidth={2.25} />
              )}
            </button>
          ) : null}

          <Link
            aria-label={activeUser ? "Go to Dashboard" : "Go to Home"}
            className="flex shrink-0 items-center transition hover:opacity-90"
            href={homeHref}
            {...(openLinksInNewTab
              ? { target: "_blank", rel: "noopener noreferrer" }
              : {})}
          >
            <Logo iconOnlyOnMobile onDark size={36} />
          </Link>

          {leftSlot}
        </div>

        {/* Center: the caller's slot, else the page name from PAGE_TITLES. Not a
            heading: each page's PageHeader owns the one <h1>. */}
        {centerSlot ? (
          <div className="hidden min-w-0 truncate md:block">{centerSlot}</div>
        ) : (
          <p className="hidden min-w-0 truncate text-center font-display text-base font-bold text-on-brand lg:block">
            {activeUser ? pageTitle : null}
          </p>
        )}

        {/* Right: the caller's slot, then account controls */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          {rightSlot}

          {activeUser && !pathname.startsWith("/help") && (
            <span className={cn("hidden sm:block", compact && "sm:hidden lg:block")}>
              {/* Page-aware help: the help centre lists articles tagged for the page you came from. */}
              <SimpleTooltip label="Help">
                <Link
                  aria-label="Help"
                  className={HEADER_ICON_BUTTON}
                  href={`/help?from=${encodeURIComponent(pathname)}`}
                  {...(openLinksInNewTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                >
                  <LifeBuoy aria-hidden="true" className="size-5" strokeWidth={2.25} />
                </Link>
              </SimpleTooltip>
            </span>
          )}
          {activeUser && (
            <span className={cn("shrink-0", compact && "hidden lg:block")}>
              <NotificationBell openLinksInNewTab={openLinksInNewTab} />
            </span>
          )}

          <ThemeToggle />

          {isAuthPending ? (
            <div
              aria-label="Checking session"
              className="inline-flex size-[var(--control-h)] shrink-0 items-center justify-center text-on-brand-muted"
              role="status"
            >
              <Spinner aria-hidden="true" className="size-4" />
            </div>
          ) : activeUser ? (
            <UserNavMenu user={activeUser} openLinksInNewTab={openLinksInNewTab} />
          ) : pathname === "/login" ? null : (
            <Button asChild>
              <Link aria-label="Log in" href="/login">
                <LogIn aria-hidden="true" className="size-4" strokeWidth={2.25} />
                <span className="hidden xs:inline">Log in</span>
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

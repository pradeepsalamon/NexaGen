"use client";

import { HelpCircle, LogIn, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "@/components/Logo";
import { ThemeModePicker } from "@/components/ThemeModePicker";
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
import { rolesOf } from "@nexa-chess/types";
import { roleViewLabel } from "@/features/auth/hooks/useSwitchRole";
import { Badge } from "@/components/ui/Badge";

/**
 * The header's own menu (three bars) button is switched off, not deleted: the nav is opened by
 * the gold tab on the drawer's edge and collapsed by the chevron in the docked sidebar. Set to
 * `true` to bring the button back.
 */
const SHOW_HEADER_MENU_BUTTON: boolean = false;

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
  const navExpanded = useSidebarStore((state) => state.expanded);
  const toggleNavExpanded = useSidebarStore((state) => state.toggleExpanded);
  // From `xl` the nav is a rail: the same button slides its full panel out instead of opening a drawer.
  const navDocked = useMediaQuery(NAV_DOCKED_QUERY);

  const isAuthPending = !isHydrated || isSessionLoading || !isSessionChecked;
  const activeUser = isSessionChecked ? user : undefined;

  const dashboardHref = getRoleDashboardHref(activeUser?.role);
  const homeHref = activeUser ? dashboardHref : "/";

  return (
    <header
      className={cn(
        // `right-scroll-bar-position`: while a menu or dialog locks scrolling, Radix hides the page's
        // scrollbar and gives this class `right: <bar width>`, so the header keeps its width.
        // Navy in both themes (owner, 2026-11-22), the nav's own shade (`bg-app-drawer`) with no
        // rule under it: header and nav read as one frame around the page. `surface-brand`
        // switches everything inside (icons, menus' triggers, badges) to the on-navy palette.
        "surface-brand right-scroll-bar-position fixed inset-x-0 top-0 z-40 h-16 bg-app-drawer px-3 text-app-text sm:px-4 md:px-6 lg:px-8",
        // From xl the rail runs full height on the left and the header starts beside it. Fixed:
        // the expanded nav slides over the header's left end, it never pushes it.
        hasSidebar && navDocked && "left-[var(--app-rail-w,0px)]"
      )}
    >
      {/* Docked nav: the menu button and logo sit over the nav column, not in the centred page width. */}
      <div
        className={cn(
          // Three columns, the outer two always equal, so the page name sits in the header's true
          // centre whatever width the logo side and the account side have. The middle cell is
          // always rendered (empty when its content is hidden), so the right group stays in column 3.
          "mx-auto grid h-full w-full grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-2",
          hasSidebar && navDocked ? "max-w-none" : "max-w-7xl"
        )}
      >
        {/* Left: menu + logo */}
        <div className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-3">
          {!SHOW_HEADER_MENU_BUTTON ? null : hasSidebar && navDocked ? (
            <SimpleTooltip label={navExpanded ? "Collapse menu" : "Expand menu"} side="bottom">
              <button
                aria-controls="nav-drawer"
                aria-expanded={navExpanded}
                aria-label={navExpanded ? "Collapse menu" : "Expand menu"}
                className={HEADER_ICON_BUTTON}
                onClick={toggleNavExpanded}
                type="button"
              >
                <Menu aria-hidden="true" className="size-5" strokeWidth={2.25} />
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
            <Logo mobileSize={28} onDark size={36} />
          </Link>

          {leftSlot}
        </div>

        {/* Center: the caller's slot, else the page name from PAGE_TITLES. Not a
            heading: each page's PageHeader owns the one <h1>. */}
        <div className="min-w-0">
          {centerSlot ? (
            <div className="hidden min-w-0 truncate md:block">{centerSlot}</div>
          ) : (
            <p className="hidden min-w-0 truncate text-center font-display text-base font-bold text-app-text lg:block">
              {activeUser ? pageTitle : null}
            </p>
          )}
        </div>

        {/* Right: the caller's slot, then account controls */}
        <div className="flex shrink-0 items-center justify-self-end gap-1 sm:gap-1.5">
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
                  <HelpCircle aria-hidden="true" className="size-5" strokeWidth={2.25} />
                </Link>
              </SimpleTooltip>
            </span>
          )}
          {activeUser && (
            <span className={cn("shrink-0", compact && "hidden lg:block")}>
              <NotificationBell openLinksInNewTab={openLinksInNewTab} />
            </span>
          )}

          {/* Was the sun/moon switch, `<ThemeToggle />` (components/ThemeToggle.tsx, still used outside the app shell). */}
          <ThemeModePicker />

          {isAuthPending ? (
            <div
              aria-label="Checking session"
              className="inline-flex size-[var(--control-h)] shrink-0 items-center justify-center text-app-muted"
              role="status"
            >
              <Spinner aria-hidden="true" className="size-4" />
            </div>
          ) : activeUser ? (
            <>
              {/* Multi-role accounts: which hat this session is wearing (docs/MULTI_ROLE_ACCOUNTS.md §5.6). */}
              {rolesOf(activeUser).length > 1 && (
                <Badge className={cn("hidden shrink-0 sm:inline-flex", compact && "sm:hidden lg:inline-flex")} variant="secondary">
                  {roleViewLabel(activeUser.role)}
                </Badge>
              )}
              <UserNavMenu user={activeUser} openLinksInNewTab={openLinksInNewTab} />
            </>
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

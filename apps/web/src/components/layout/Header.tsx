"use client";

import { Loader2, LogIn, Menu, Search, Sun, Moon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UserNavMenu } from "@/components/layout/UserNavMenu";
import { NotificationBell } from "@/features/notifications/components/NotificationBell";
import { getRoleDashboardHref, useAuthStore } from "@/stores/authStore";
import { useSidebarStore } from "@/stores/sidebarStore";
import { useTheme } from "@/providers/ThemeProvider";
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
    <header
      style={{
        backgroundColor: isDark ? "#051024" : "#FFFFFF"
      }}
      className={cn(
        "fixed inset-x-0 top-0 z-40 h-16 border-b transition-colors duration-200",
        isDark
          ? "bg-[#051024] border-white/10 text-white"
          : "bg-white border-[#E8EDF5] text-[#071B41]"
      )}
    >
      <div className="mx-auto flex h-full w-full max-w-[1360px] items-center justify-between gap-2 px-3 sm:px-6 lg:px-8">
        {/* Left: Mobile Hamburger + Logo */}
        <div className="flex min-w-0 items-center gap-1.5 sm:gap-3 shrink-0">
          {hasSidebar ? (
            <button
              aria-expanded={sidebarOpen}
              aria-label="Open menu"
              className={cn(
                "lg:hidden inline-flex size-8 sm:size-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                isDark
                  ? "text-white hover:bg-white/10"
                  : "text-[#071B41] hover:bg-[#F1F5F9]"
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
            <Image
              src={
                isDark
                  ? "/academy/nexa_logo_dark1.png"
                  : "/academy/nexa_logo_light1.png"
              }
              alt="NEXA Chess"
              width={140}
              height={38}
              priority
              className="h-7 w-auto max-w-[108px] sm:max-w-none sm:h-9 object-contain object-left"
            />
          </Link>

          {leftSlot}
        </div>

        {/* Optional Center Slot */}
        {centerSlot ? (
          <div className="hidden md:block min-w-0 truncate">{centerSlot}</div>
        ) : null}

        {/* Right Controls: Cleanly spaced so it never collides with the left Logo */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {rightSlot}

          {activeUser && !compact && (
            <button
              type="button"
              aria-label="Search"
              className={cn(
                "inline-flex size-8 sm:size-9 items-center justify-center rounded-full border transition-colors shrink-0",
                isDark
                  ? "bg-[#0B1B38] border-white/10 text-[#94A3B8] hover:text-white hover:border-white/25"
                  : "bg-[#F8FAFC] border-[#E2E8F0] text-[#475569] hover:text-[#071B41]"
              )}
            >
              <Search className="size-3.5 sm:size-4" strokeWidth={2.1} />
            </button>
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
              isDark
                ? "bg-[#0B1B38] border-white/10 text-[#E2B355]"
                : "bg-[#F8FAFC] border-[#E2E8F0] text-[#D49B35]"
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
                isDark
                  ? "border-white/10 bg-[#0B1B38] text-[#94A3B8]"
                  : "border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B]"
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
              className="inline-flex h-8 sm:h-9 items-center gap-1.5 rounded-full bg-[#071B41] dark:bg-[#E2B355] px-3 sm:px-4 text-xs font-bold text-white dark:text-[#071B41] transition hover:opacity-90"
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
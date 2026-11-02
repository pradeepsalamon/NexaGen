"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Sun,
  Moon,
  Menu,
  X,
  ArrowRight,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  User
} from "lucide-react";
import { useTheme } from "@/providers/ThemeProvider";
import { useAuthStore, getRoleDashboardHref } from "@/stores/authStore";
import { logout } from "@/features/auth/api/authApi";

const navItems = [
  { label: "Home", href: "#" },
  { label: "Programs", href: "#programs" },
  { label: "Coaching", href: "#class-types" },
  { label: "Tournaments", href: "#sunday-training" },
  { label: "About", href: "#why-choose-us" },
  { label: "Contact", href: "#contact" }
];

// A section counts as "current" once its top edge passes this line (px from the top)
const SPY_OFFSET = 120;

export interface NavbarUser {
  name: string;
  email?: string;
  avatarUrl?: string;
}

interface AcademyNavbarProps {
  /** Pass the signed-in user to show the profile chip. Leave empty/null to show Log In + Register. */
  user?: NavbarUser | null;
  /** Called when "Log out" is clicked. The menu item only shows when this is provided. */
  onLogout?: () => void;
  /** Where the "Dashboard" menu item goes. The item only shows when this is provided. */
  dashboardHref?: string;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ------------------------------------------------------------------ */
/*  Theme switch: sliding knob, navy in light mode / gold in dark mode */
/* ------------------------------------------------------------------ */
function ThemeSwitch({
  isDark,
  onToggle,
  size = "md"
}: {
  isDark: boolean;
  onToggle: () => void;
  size?: "md" | "sm";
}) {
  const sm = size === "sm";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label="Switch to dark theme"
      onClick={onToggle}
      className={`
        relative inline-flex shrink-0 cursor-pointer items-center rounded-full border p-[3px]
        bg-app-soft border-app-border shadow-[inset_0_1px_3px_rgb(var(--rgb-brand-800)/0.08)]
        hover:border-accent/60

        transition-colors duration-300
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70
        ${sm ? "h-8" : "h-9"}
      `}
    >
      {/* Sliding knob (CSS dark: variant, so no flash before the theme hydrates) */}
      <span
        aria-hidden="true"
        className={`
          pointer-events-none absolute left-[3px] top-[3px] rounded-full
          bg-toggle-knob shadow-card

          transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none
          ${sm ? "size-6 dark:translate-x-6" : "size-7 dark:translate-x-7"}
        `}
      />
      <span
        className={`relative z-10 flex items-center justify-center ${sm ? "size-6" : "size-7"}`}
      >
        <Sun
          className={`transition-colors duration-300 text-toggle-knob-sun ${sm ? "size-3.5" : "size-4"}`}
          strokeWidth={2.2}
        />
      </span>
      <span
        className={`relative z-10 flex items-center justify-center ${sm ? "size-6" : "size-7"}`}
      >
        <Moon
          className={`transition-colors duration-300 text-toggle-knob-moon ${sm ? "size-3.5" : "size-4"}`}
          strokeWidth={2.2}
        />
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Avatar (photo if provided, otherwise initials)                      */
/* ------------------------------------------------------------------ */
function UserAvatar({
  user,
  className = ""
}: {
  user: NavbarUser;
  className?: string;
}) {
  const base =
    "shrink-0 rounded-full flex items-center justify-center overflow-hidden font-bold select-none";

  if (user.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatarUrl}
        alt=""
        className={`${base} object-cover ${className}`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${base} bg-app-soft text-app-text ${className}`}
    >
      {getInitials(user.name)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Desktop profile chip + dropdown                                     */
/* ------------------------------------------------------------------ */
function UserMenu({
  user,
  dashboardHref,
  onLogout
}: {
  user: NavbarUser;
  dashboardHref?: string;
  onLogout?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const firstName = user.name.trim().split(/\s+/)[0] || user.name;
  const itemClass =
    "flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-sm font-semibold text-app-text hover:bg-app-text/5 transition-colors";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.name}`}
        className="
          inline-flex h-10 items-center gap-2.5 rounded-full border py-1 pl-1 pr-3 cursor-pointer
          bg-app-surface border-app-border hover:border-accent/60

          transition-colors duration-200
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70
        "
      >
        <UserAvatar user={user} className="size-8 text-xs" />
        <span className="max-w-[96px] truncate text-sm font-bold text-app-text">
          {firstName}
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-app-muted transition-transform duration-200 ${open ? "rotate-180" : ""
            }`}
          strokeWidth={2.2}
        />
      </button>

      <div
        role="menu"
        className={`
          absolute right-0 top-full mt-2 w-60 origin-top-right rounded-2xl border p-1.5
          bg-app-surface border-app-border shadow-[0_16px_40px_-10px_rgb(var(--rgb-brand-800)/0.22)]

          transition-[opacity,transform,visibility] duration-150 ease-out motion-reduce:transition-none
          ${open
            ? "visible opacity-100 scale-100"
            : "invisible opacity-0 scale-95 pointer-events-none"
          }
        `}
      >
        <div className="flex items-center gap-3 px-3 py-2.5">
          <UserAvatar user={user} className="size-9 text-xs" />
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-app-text">
              {user.name}
            </div>
            {user.email && (
              <div className="truncate text-xs text-app-muted">
                {user.email}
              </div>
            )}
          </div>
        </div>

        {(dashboardHref || onLogout) && (
          <div className="mt-1 border-t border-app-border pt-1">
            {dashboardHref && (
              <Link
                href={dashboardHref}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={itemClass}
              >
                <LayoutDashboard className="size-4 text-accent-ink" />
                Dashboard
              </Link>
            )}
            <Link
              href="/profile"
              role="menuitem"
              onClick={() => setOpen(false)}
              className={itemClass}
            >
              <User className="size-4 text-accent-ink" />
              Profile
            </Link>
            {onLogout && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
                className={itemClass}
              >
                <LogOut className="size-4 text-accent-ink" />
                Log out
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function AcademyNavbar({
  user: propUser,
  onLogout: propOnLogout,
  dashboardHref: propDashboardHref
}: AcademyNavbarProps = {}) {
  const router = useRouter();
  const authStoreUser = useAuthStore((state) => state.user);
  const isAuthHydrated = useAuthStore((state) => state.isHydrated);
  const clearSession = useAuthStore((state) => state.clearSession);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const [scrolled, setScrolled] = useState(false);
  const [activeTab, setActiveTab] = useState("Home");
  const [mobileOpen, setMobileOpen] = useState(false);
  const { mode, toggleMode, isHydrated } = useTheme();
  const isDark = isHydrated && mode === "dark";

  // Compute resolved user from props or auth store
  const effectiveUser: NavbarUser | null = propUser !== undefined
    ? propUser
    : mounted && isAuthHydrated && authStoreUser
      ? {
          name:
            [authStoreUser.firstName, authStoreUser.lastName].filter(Boolean).join(" ") ||
            authStoreUser.username ||
            authStoreUser.email,
          email: authStoreUser.email,
          avatarUrl: authStoreUser.avatarUrl ?? undefined
        }
      : null;

  const effectiveDashboardHref =
    propDashboardHref ??
    (authStoreUser ? getRoleDashboardHref(authStoreUser.role) : "/student");

  const handleLogout =
    propOnLogout ??
    (async () => {
      try {
        await logout();
      } catch {
        // Ignore network errors on logout
      } finally {
        clearSession();
        router.refresh();
      }
    });

  // Scroll state + scroll-spy (highlights the section currently on screen)
  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setScrolled(window.scrollY > 20);

        let current = "Home";
        let bestTop = -Infinity;
        for (const item of navItems) {
          if (item.href.length <= 1) continue;
          const el = document.getElementById(item.href.slice(1));
          if (!el) continue;
          const top = el.getBoundingClientRect().top;
          if (top <= SPY_OFFSET && top > bestTop) {
            bestTop = top;
            current = item.label;
          }
        }
        setActiveTab(current);

        ticking = false;
      });
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close the mobile drawer with Escape
  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-colors duration-300 border-b ${scrolled
        ? "bg-app-surface/95 backdrop-blur-md border-app-border shadow-xs"
        : "bg-app-surface/90 backdrop-blur-sm border-app-border/70"
        }`}
    >
      {/* Vertical padding lives here (not on <nav>) so the mobile drawer sits flush under the bar */}
      <div
        className={`max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 transition-[padding] duration-300 ${scrolled ? "py-1.5" : "py-2"
          }`}
      >
        <div className="flex items-center justify-between h-14">
          {/* Brand Logo (both rendered, swapped with CSS so there's no wrong-logo flash) */}
          <a
            href="#"
            onClick={() => setActiveTab("Home")}
            className="flex items-center gap-2 group transition-transform duration-200 hover:-translate-y-0.5 shrink-0"
            aria-label="Nexa Chess Academy Home"
          >
            <div className="relative h-9 w-36 sm:h-10 sm:w-40 flex items-center">
              <Image
                src="/academy/nexa_logo_light1.png"
                alt="NEXA Chess"
                width={168}
                height={46}
                priority
                className="h-9 sm:h-10 w-auto object-contain dark:hidden"
              />
              <Image
                src="/academy/nexa_logo_dark1.png"
                alt="NEXA Chess"
                width={168}
                height={46}
                priority
                className="h-9 sm:h-10 w-auto object-contain hidden dark:block"
              />
            </div>
          </a>

          {/* Desktop Center Navigation Links */}
          <div className="hidden lg:flex items-center gap-3.5 xl:gap-6">
            {navItems.map((item) => {
              const isActive = activeTab === item.label;
              return (
                <a
                  key={item.label}
                  href={item.href}
                  onClick={() => setActiveTab(item.label)}
                  aria-current={isActive ? "location" : undefined}
                  className={`relative py-1.5 text-sm font-semibold whitespace-nowrap transition-colors duration-200 ${isActive
                    ? "text-app-text font-bold"
                    : "text-app-muted hover:text-app-text"
                    }`}
                >
                  {item.label}
                  <span
                    aria-hidden="true"
                    className={`absolute bottom-0 left-0 right-0 h-[2.5px] origin-left rounded-full bg-accent transition-transform duration-300 ${isActive ? "scale-x-100" : "scale-x-0"
                      }`}
                  />
                </a>
              );
            })}
          </div>

          {/* Desktop Right Side: Theme Switch + (Profile chip | Log In + Register) + Book Free Class */}
          <div className="hidden lg:flex items-center gap-2 xl:gap-3 shrink-0">
            <ThemeSwitch isDark={isDark} onToggle={toggleMode} />

            {effectiveUser ? (
              <UserMenu
                user={effectiveUser}
                dashboardHref={effectiveDashboardHref}
                onLogout={handleLogout}
              />
            ) : (
              <>
                {/* Log In Button */}
                <Link
                  href="/login"
                  className="px-3 py-1.5 text-xs xl:text-sm font-semibold whitespace-nowrap text-app-text hover:text-accent-ink hover:bg-app-text/5 rounded-[10px] transition-colors"
                >
                  Log In
                </Link>

                {/* Register Button */}
                <Link
                  href="/register"
                  className="px-3 py-1.5 text-xs xl:text-sm font-semibold whitespace-nowrap border border-app-text/20 text-app-text hover:border-accent hover:text-accent-ink rounded-[10px] transition-colors"
                >
                  Register
                </Link>
              </>
            )}

            {/* Gold CTA Button */}
            <a
              href="#demo"
              className="
                inline-flex items-center justify-center gap-1.5 whitespace-nowrap
                min-h-[38px] px-3.5 xl:px-4 py-1.5 rounded-[10px]
                bg-gradient-to-r from-accent via-accent to-accent-hover
                hover:from-accent hover:to-accent-hover
                text-on-accent text-xs xl:text-sm font-bold
                shadow-[0_4px_14px_rgb(var(--rgb-accent)/0.3)]
                transition-all duration-200 hover:-translate-y-0.5
              "
            >
              <span>Book Free Class</span>
              <ArrowRight className="size-3.5 stroke-[2.5]" />
            </a>
          </div>

          {/* Mobile Right Controls: Theme Switch & Hamburger */}
          <div className="lg:hidden flex items-center gap-3">
            <ThemeSwitch isDark={isDark} onToggle={toggleMode} size="sm" />

            <button
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              className="size-9 rounded-[10px] text-app-text flex items-center justify-center hover:bg-app-text/5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
              aria-controls="academy-mobile-menu"
              aria-expanded={mobileOpen}
              aria-label="Toggle navigation menu"
            >
              {mobileOpen ? <X className="size-6" /> : <Menu className="size-6" />}
            </button>
          </div>
        </div>
      </div>

      {/*
        Mobile Drawer. Animates to its real height (grid 0fr -> 1fr) so nothing is
        clipped, scrolls on short screens, and its links can't be tabbed to while closed.
      */}
      <div
        id="academy-mobile-menu"
        className={`lg:hidden grid bg-app-surface transition-[grid-template-rows,opacity] duration-300 ease-in-out ${mobileOpen
          ? "grid-rows-[1fr] opacity-100 border-t border-app-border"
          : "grid-rows-[0fr] opacity-0"
          }`}
      >
        <div
          className={`min-h-0 overflow-y-auto max-h-[calc(100dvh-4.5rem)] transition-[visibility] duration-300 ${mobileOpen ? "visible" : "invisible"
            }`}
        >
          <div className="max-w-[1280px] mx-auto px-4 py-4 space-y-1.5">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => {
                  setActiveTab(item.label);
                  setMobileOpen(false);
                }}
                className={`block px-3 py-2 text-sm font-semibold rounded-[10px] transition-colors ${activeTab === item.label
                  ? "text-accent-ink bg-accent-soft font-bold"
                  : "text-app-text hover:bg-app-text/5"
                  }`}
              >
                {item.label}
              </a>
            ))}

            <div className="pt-3 border-t border-app-border space-y-2">
              {effectiveUser ? (
                <>
                  {/* Mobile profile card */}
                  <div className="flex items-center gap-3 rounded-[12px] border border-app-border bg-app-surface px-3 py-2.5">
                    <UserAvatar user={effectiveUser} className="size-10 text-sm" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-app-text">
                        {effectiveUser.name}
                      </div>
                      {effectiveUser.email && (
                        <div className="truncate text-xs text-app-muted">
                          {effectiveUser.email}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {effectiveDashboardHref && (
                      <Link
                        href={effectiveDashboardHref}
                        onClick={() => setMobileOpen(false)}
                        className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 text-sm font-semibold border border-app-border text-app-text rounded-[10px] hover:bg-app-text/5 transition-colors"
                      >
                        <LayoutDashboard className="size-4 text-accent-ink" />
                        Dashboard
                      </Link>
                    )}
                    <Link
                      href="/profile"
                      onClick={() => setMobileOpen(false)}
                      className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 text-sm font-semibold border border-app-border text-app-text rounded-[10px] hover:bg-app-text/5 transition-colors"
                    >
                      <User className="size-4 text-accent-ink" />
                      Profile
                    </Link>
                  </div>

                  {handleLogout && (
                    <button
                      type="button"
                      onClick={() => {
                        setMobileOpen(false);
                        handleLogout();
                      }}
                      className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 text-sm font-semibold border border-accent text-accent-ink rounded-[10px] hover:bg-accent hover:text-on-accent transition-colors"
                    >
                      <LogOut className="size-4" />
                      Log out
                    </button>
                  )}
                </>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/login"
                    onClick={() => setMobileOpen(false)}
                    className="w-full text-center py-2 px-3 text-sm font-semibold border border-app-border text-app-text rounded-[10px] hover:bg-app-text/5 transition-colors"
                  >
                    Log In
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setMobileOpen(false)}
                    className="w-full text-center py-2 px-3 text-sm font-semibold border border-accent text-accent-ink rounded-[10px] hover:bg-accent hover:text-on-accent transition-colors"
                  >
                    Register
                  </Link>
                </div>
              )}

              <a
                href="#demo"
                onClick={() => setMobileOpen(false)}
                className="
                  w-full inline-flex items-center justify-center gap-2
                  min-h-[42px] px-4 py-2 rounded-[10px]
                  bg-gradient-to-r from-accent via-accent to-accent-hover
                  text-on-accent font-bold text-sm shadow-sm
                "
              >
                <span>Book Free Class</span>
                <ArrowRight className="size-4 stroke-[2.5]" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
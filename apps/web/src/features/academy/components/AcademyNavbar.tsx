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
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      onClick={onToggle}
      className={`
        relative inline-flex shrink-0 cursor-pointer items-center rounded-full border p-[3px]
        bg-[#EEF2F8] border-[#D9E0EC] shadow-[inset_0_1px_3px_rgba(7,27,65,0.08)]
        hover:border-[#C58927]/60
        dark:bg-[#0B1A38] dark:border-white/12 dark:shadow-none dark:hover:border-[#E2B355]/50
        transition-colors duration-300
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D49B35]/70
        ${sm ? "h-8" : "h-9"}
      `}
    >
      {/* Sliding knob (CSS dark: variant, so no flash before the theme hydrates) */}
      <span
        aria-hidden="true"
        className={`
          pointer-events-none absolute left-[3px] top-[3px] rounded-full
          bg-[#071B41] shadow-[0_2px_6px_rgba(7,27,65,0.35)]
          dark:bg-[#E2B355] dark:shadow-[0_2px_8px_rgba(226,179,85,0.35)]
          transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none
          ${sm ? "size-6 dark:translate-x-6" : "size-7 dark:translate-x-7"}
        `}
      />
      <span
        className={`relative z-10 flex items-center justify-center ${sm ? "size-6" : "size-7"}`}
      >
        <Sun
          className={`transition-colors duration-300 text-white dark:text-[#8E98A8] ${sm ? "size-3.5" : "size-4"}`}
          strokeWidth={2.2}
        />
      </span>
      <span
        className={`relative z-10 flex items-center justify-center ${sm ? "size-6" : "size-7"}`}
      >
        <Moon
          className={`transition-colors duration-300 text-[#6B7280] dark:text-[#071B41] ${sm ? "size-3.5" : "size-4"}`}
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
      className={`${base} bg-[#DCDFE4] text-[#071B41] dark:bg-[#E2B355]/15 dark:text-[#E2B355] ${className}`}
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
    "flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-sm font-semibold text-[#071B41] dark:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors";

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
          bg-white border-[#DDE3EE] hover:border-[#C58927]/60
          dark:bg-[#08152E] dark:border-white/12 dark:hover:border-[#E2B355]/50
          transition-colors duration-200
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D49B35]/70
        "
      >
        <UserAvatar user={user} className="size-8 text-xs" />
        <span className="max-w-[96px] truncate text-sm font-bold text-[#071B41] dark:text-white">
          {firstName}
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-[#555C68] dark:text-[#C1C4CC] transition-transform duration-200 ${open ? "rotate-180" : ""
            }`}
          strokeWidth={2.2}
        />
      </button>

      <div
        role="menu"
        className={`
          absolute right-0 top-full mt-2 w-60 origin-top-right rounded-2xl border p-1.5
          bg-white border-[#E5E9F0] shadow-[0_16px_40px_-10px_rgba(7,27,65,0.22)]
          dark:bg-[#0B1A38] dark:border-white/10 dark:shadow-[0_16px_40px_-10px_rgba(0,0,0,0.7)]
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
            <div className="truncate text-sm font-bold text-[#071B41] dark:text-white">
              {user.name}
            </div>
            {user.email && (
              <div className="truncate text-xs text-[#555C68] dark:text-[#C1C4CC]">
                {user.email}
              </div>
            )}
          </div>
        </div>

        {(dashboardHref || onLogout) && (
          <div className="mt-1 border-t border-[#E5E9F0] pt-1 dark:border-white/10">
            {dashboardHref && (
              <Link
                href={dashboardHref}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={itemClass}
              >
                <LayoutDashboard className="size-4 text-[#C58927] dark:text-[#E2B355]" />
                Dashboard
              </Link>
            )}
            <Link
              href="/profile"
              role="menuitem"
              onClick={() => setOpen(false)}
              className={itemClass}
            >
              <User className="size-4 text-[#C58927] dark:text-[#E2B355]" />
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
                <LogOut className="size-4 text-[#C58927] dark:text-[#E2B355]" />
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
        ? "bg-white/95 dark:bg-[#030D24]/95 backdrop-blur-md border-[#E5E9F0] dark:border-white/10 shadow-xs"
        : "bg-white/90 dark:bg-[#030D24]/90 backdrop-blur-sm border-[#E5E9F0]/70 dark:border-white/10"
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
                    ? "text-[#071B41] dark:text-white font-bold"
                    : "text-[#3B4454] dark:text-[#C1C4CC] hover:text-[#071B41] dark:hover:text-white"
                    }`}
                >
                  {item.label}
                  <span
                    aria-hidden="true"
                    className={`absolute bottom-0 left-0 right-0 h-[2.5px] origin-left rounded-full bg-[#D49B35] dark:bg-[#E2B355] transition-transform duration-300 ${isActive ? "scale-x-100" : "scale-x-0"
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
                  className="px-3 py-1.5 text-xs xl:text-sm font-semibold whitespace-nowrap text-[#071B41] dark:text-white hover:text-[#C58927] dark:hover:text-[#E2B355] hover:bg-black/5 dark:hover:bg-white/5 rounded-[10px] transition-colors"
                >
                  Log In
                </Link>

                {/* Register Button */}
                <Link
                  href="/register"
                  className="px-3 py-1.5 text-xs xl:text-sm font-semibold whitespace-nowrap border border-[#071B41]/20 dark:border-white/20 text-[#071B41] dark:text-white hover:border-[#C58927] dark:hover:border-[#E2B355] hover:text-[#C58927] dark:hover:text-[#E2B355] rounded-[10px] transition-colors"
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
                bg-gradient-to-r from-[#E5B85B] via-[#DDA843] to-[#CE942E]
                hover:from-[#ECC36B] hover:to-[#D89E35]
                text-[#071B41] text-xs xl:text-sm font-bold
                shadow-[0_4px_14px_rgba(212,155,53,0.3)]
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
              className="size-9 rounded-[10px] text-[#071B41] dark:text-white flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D49B35]/70"
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
        className={`lg:hidden grid bg-white dark:bg-[#0B1A38] transition-[grid-template-rows,opacity] duration-300 ease-in-out ${mobileOpen
          ? "grid-rows-[1fr] opacity-100 border-t border-[#E5E9F0] dark:border-white/10"
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
                  ? "text-[#C58B2B] dark:text-[#E2B355] bg-[#FDF6E7] dark:bg-white/5 font-bold"
                  : "text-[#071B41] dark:text-white hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
              >
                {item.label}
              </a>
            ))}

            <div className="pt-3 border-t border-[#E5E9F0] dark:border-white/10 space-y-2">
              {effectiveUser ? (
                <>
                  {/* Mobile profile card */}
                  <div className="flex items-center gap-3 rounded-[12px] border border-[#DDE3EE] dark:border-white/12 bg-white dark:bg-[#08152E] px-3 py-2.5">
                    <UserAvatar user={effectiveUser} className="size-10 text-sm" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-[#071B41] dark:text-white">
                        {effectiveUser.name}
                      </div>
                      {effectiveUser.email && (
                        <div className="truncate text-xs text-[#555C68] dark:text-[#C1C4CC]">
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
                        className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 text-sm font-semibold border border-[#E5E9F0] dark:border-white/15 text-[#071B41] dark:text-white rounded-[10px] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                      >
                        <LayoutDashboard className="size-4 text-[#C58927] dark:text-[#E2B355]" />
                        Dashboard
                      </Link>
                    )}
                    <Link
                      href="/profile"
                      onClick={() => setMobileOpen(false)}
                      className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 text-sm font-semibold border border-[#E5E9F0] dark:border-white/15 text-[#071B41] dark:text-white rounded-[10px] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    >
                      <User className="size-4 text-[#C58927] dark:text-[#E2B355]" />
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
                      className="w-full inline-flex items-center justify-center gap-2 py-2 px-3 text-sm font-semibold border border-[#C58927] dark:border-[#E2B355] text-[#C58927] dark:text-[#E2B355] rounded-[10px] hover:bg-[#C58927] hover:text-white dark:hover:bg-[#E2B355] dark:hover:text-[#030D24] transition-colors"
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
                    className="w-full text-center py-2 px-3 text-sm font-semibold border border-[#E5E9F0] dark:border-white/15 text-[#071B41] dark:text-white rounded-[10px] hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  >
                    Log In
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setMobileOpen(false)}
                    className="w-full text-center py-2 px-3 text-sm font-semibold border border-[#C58927] dark:border-[#E2B355] text-[#C58927] dark:text-[#E2B355] rounded-[10px] hover:bg-[#C58927] hover:text-white dark:hover:bg-[#E2B355] dark:hover:text-[#030D24] transition-colors"
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
                  bg-gradient-to-r from-[#E5B85B] via-[#DDA843] to-[#CE942E]
                  text-[#071B41] font-bold text-sm shadow-sm
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
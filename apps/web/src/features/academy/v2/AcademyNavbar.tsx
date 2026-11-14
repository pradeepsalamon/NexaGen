"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { HEADER_ICON_BUTTON } from "@/components/layout/headerStyles";
import { UserNavMenu } from "@/components/layout/UserNavMenu";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";

const navItems = [
  { label: "Home", href: "#home" },
  { label: "Programs", href: "#programs" },
  { label: "Coaching", href: "#class-types" },
  { label: "Tournaments", href: "#sunday-training" },
  { label: "About", href: "#why-choose-us" },
  { label: "Contact", href: "#contact" }
];

// A section counts as "current" once its top edge passes this line (px from the top).
const SPY_OFFSET = 120;

/** Navy bar, the same chrome as the app header (`surface-brand`). */
export function AcademyNavbar() {
  const user = useAuthStore((state) => state.user);
  const isAuthHydrated = useAuthStore((state) => state.isHydrated);
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState("Home");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setMounted(true), []);
  const signedInUser = mounted && isAuthHydrated ? user : null;

  // Scroll-spy: highlight the section currently on screen.
  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        let current = "Home";
        let bestTop = -Infinity;
        for (const item of navItems) {
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

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  return (
    <header className="surface-brand fixed inset-x-0 top-0 z-50 border-b border-app-border bg-brand-800 text-app-text">
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <a
          aria-label="Nexa Chess Academy home"
          className="flex shrink-0 items-center rounded-control font-normal transition-opacity hover:opacity-90"
          href="#home"
          onClick={() => setActiveTab("Home")}
        >
          <Logo onDark size={36} />
        </a>

        <nav aria-label="Sections" className="hidden items-center gap-1 lg:flex">
          {navItems.map((item) => {
            const isActive = activeTab === item.label;
            return (
              <a
                aria-current={isActive ? "location" : undefined}
                className={cn(
                  "relative rounded-control px-3 py-2 text-sm font-medium transition-colors hover:bg-app-soft hover:text-app-text",
                  isActive ? "text-app-text" : "text-app-muted"
                )}
                href={item.href}
                key={item.label}
                onClick={() => setActiveTab(item.label)}
              >
                {item.label}
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-accent transition-transform motion-reduce:transition-none",
                    isActive ? "scale-x-100" : "scale-x-0"
                  )}
                />
              </a>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle />
          {signedInUser ? (
            <UserNavMenu user={signedInUser} />
          ) : (
            <div className="hidden items-center gap-2 lg:flex">
              <Button asChild variant="neutral">
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild variant="neutral">
                <Link href="/register">Register</Link>
              </Button>
            </div>
          )}
          <Button asChild className="hidden sm:inline-flex">
            <a href="#demo">Book a free class</a>
          </Button>
          <button
            aria-controls="academy-mobile-menu"
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            className={cn(HEADER_ICON_BUTTON, "lg:hidden")}
            onClick={() => setMobileOpen((open) => !open)}
            type="button"
          >
            {mobileOpen ? (
              <X aria-hidden="true" className="size-5" strokeWidth={2.25} />
            ) : (
              <Menu aria-hidden="true" className="size-5" strokeWidth={2.25} />
            )}
          </button>
        </div>
      </div>

      {/* Animates to its real height (grid 0fr -> 1fr); its links can't be tabbed to while closed. */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-in-out motion-reduce:transition-none lg:hidden",
          mobileOpen ? "grid-rows-[1fr] border-t border-app-border" : "grid-rows-[0fr]"
        )}
        id="academy-mobile-menu"
      >
        <div className={cn("min-h-0 overflow-y-auto", mobileOpen ? "visible max-h-[calc(100dvh-4rem)]" : "invisible")}>
          <div className="mx-auto grid max-w-7xl gap-1 px-4 py-4 sm:px-6">
            {navItems.map((item) => (
              <a
                className={cn(
                  "rounded-control px-3 py-2.5 text-base font-medium transition-colors hover:bg-app-soft",
                  activeTab === item.label ? "bg-app-soft text-app-text" : "text-app-muted"
                )}
                href={item.href}
                key={item.label}
                onClick={() => {
                  setActiveTab(item.label);
                  setMobileOpen(false);
                }}
              >
                {item.label}
              </a>
            ))}
            <div className="mt-3 grid gap-2 border-t border-app-border pt-4">
              {/* Signed in, the account menu in the bar holds Dashboard, Profile and Log out. */}
              {signedInUser ? null : (
                <div className="grid grid-cols-2 gap-2">
                  <Button asChild variant="neutral">
                    <Link href="/login" onClick={() => setMobileOpen(false)}>
                      Log in
                    </Link>
                  </Button>
                  <Button asChild variant="neutral">
                    <Link href="/register" onClick={() => setMobileOpen(false)}>
                      Register
                    </Link>
                  </Button>
                </div>
              )}
              <Button asChild fullWidth>
                <a href="#demo" onClick={() => setMobileOpen(false)}>
                  Book a free class
                </a>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

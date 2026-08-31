"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ChevronDown, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Logo } from "@/components/Logo";
import {
  coachNavItems,
  getAdminNavGroups,
  studentNavItems,
  type NavItem
} from "@/components/layout/navItems";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";

const ADMIN_NAV_STORAGE_KEY = "nexa-admin-nav-open-groups";

function getFlatItemsForRole(role?: string): NavItem[] | null {
  switch (role) {
    case "STUDENT":
      return studentNavItems;
    case "COACH":
      return coachNavItems;
    default:
      return null;
  }
}

export function MobileNavDrawer() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const user = useAuthStore((state) => state.user);
  const isHydrated = useAuthStore((state) => state.isHydrated);
  const role = user?.role;
  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
  const flatItems = getFlatItemsForRole(role);
  const adminGroups = useMemo(
    () => (isAdmin ? getAdminNavGroups(role) : []),
    [isAdmin, role]
  );

  const isItemActive = (href: string) =>
    pathname === href ||
    (href !== "/student" &&
      href !== "/coach" &&
      href !== "/admin" &&
      href !== "/profile" &&
      pathname.startsWith(`${href}/`));

  const activeGroup = useMemo(() => {
    for (const group of adminGroups) {
      if (group.group && group.items.some((item) => isItemActive(item.href))) {
        return group.group;
      }
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminGroups, pathname]);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ADMIN_NAV_STORAGE_KEY);
      if (raw) setOpenGroups(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      /* no stored preference */
    }
  }, []);

  useEffect(() => {
    if (!activeGroup) return;
    setOpenGroups((prev) =>
      prev[activeGroup] ? prev : { ...prev, [activeGroup]: true }
    );
  }, [activeGroup]);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  if (!isHydrated || (!flatItems && !isAdmin)) {
    return null;
  }

  const isGroupOpen = (group: string) =>
    group in openGroups ? openGroups[group] : group === activeGroup;

  const toggleGroup = (group: string) =>
    setOpenGroups((prev) => {
      const next = {
        ...prev,
        [group]: !(group in prev ? prev[group] : group === activeGroup)
      };
      try {
        window.localStorage.setItem(
          ADMIN_NAV_STORAGE_KEY,
          JSON.stringify(next)
        );
      } catch {
        /* storage unavailable */
      }
      return next;
    });

  const renderLink = (item: NavItem) => {
    const Icon = item.icon;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "flex items-center gap-3 rounded-control px-4 py-3 text-sm font-bold transition",
          isItemActive(item.href) || pathname === item.href
            ? "bg-secondary text-black shadow-card"
            : "text-app-muted hover:bg-app-soft hover:text-primary"
        )}
      >
        <Icon aria-hidden="true" className="h-5 w-5 flex-none" />
        {item.label}
      </Link>
    );
  };

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={setIsOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label="Open navigation menu"
          className="fixed bottom-5 right-5 z-40 inline-flex size-12 items-center justify-center rounded-full bg-primary text-white shadow-[0_10px_28px_color-mix(in_srgb,var(--color-primary)_35%,transparent)] transition active:scale-95 hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus md:hidden"
        >
          <Menu aria-hidden="true" className="size-5" strokeWidth={2.5} />
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-sm data-[state=closed]:animate-overlay-out data-[state=open]:animate-overlay-in" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-[280px] max-w-[85vw] flex-col border-l border-app-border bg-app-surface shadow-soft outline-none",
            "data-[state=closed]:animate-drawer-out data-[state=open]:animate-drawer-in"
          )}
        >
          <div className="flex items-center justify-between border-b border-app-border px-4 py-3.5">
            <DialogPrimitive.Title asChild>
              <span>
                <Logo compact size={36} />
              </span>
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label="Close navigation menu"
              className="inline-flex size-9 items-center justify-center rounded-control text-app-muted transition hover:bg-app-soft hover:text-app-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
            >
              <X aria-hidden="true" className="size-5" />
            </DialogPrimitive.Close>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto p-3 pb-24">
            {isAdmin
              ? adminGroups.map((group) => {
                  if (!group.group) {
                    return (
                      <div className="space-y-1 pb-1" key="top">
                        {group.items.map(renderLink)}
                      </div>
                    );
                  }

                  const expanded = isGroupOpen(group.group);
                  const hasActive = group.items.some((item) =>
                    isItemActive(item.href)
                  );

                  return (
                    <div key={group.group}>
                      <button
                        aria-expanded={expanded}
                        className={cn(
                          "flex w-full items-center justify-between rounded-control px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest transition hover:bg-app-soft hover:text-app-text",
                          hasActive ? "text-primary" : "text-app-muted"
                        )}
                        onClick={() => toggleGroup(group.group)}
                        type="button"
                      >
                        {group.group}
                        <ChevronDown
                          className={cn(
                            "size-4 shrink-0 transition-transform",
                            expanded ? "" : "-rotate-90"
                          )}
                          strokeWidth={2.5}
                        />
                      </button>
                      {expanded ? (
                        <div className="mb-1 mt-1 space-y-1 border-l border-app-border pl-2">
                          {group.items.map(renderLink)}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              : (flatItems ?? []).map(renderLink)}
          </nav>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

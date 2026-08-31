"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getAdminNavGroups, type NavItem } from "@/components/layout/navItems";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "nexa-admin-nav-open-groups";

export function AdminSidebar() {
  const pathname = usePathname();
  const role = useAuthStore((state) => state.user?.role);
  const groups = useMemo(() => getAdminNavGroups(role), [role]);

  const isItemActive = (href: string) =>
    pathname === href || (href !== "/admin" && pathname.startsWith(href));

  const activeGroup = useMemo(() => {
    for (const group of groups) {
      if (group.group && group.items.some((item) => isItemActive(item.href))) {
        return group.group;
      }
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, pathname]);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
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

  const isGroupOpen = (group: string) =>
    group in openGroups ? openGroups[group] : group === activeGroup;

  const toggleGroup = (group: string) =>
    setOpenGroups((prev) => {
      const next = { ...prev, [group]: !(group in prev ? prev[group] : group === activeGroup) };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });

  const renderLink = (item: NavItem) => {
    const Icon = item.icon;
    return (
      <Link
        className={cn(
          "flex items-center gap-2.5 rounded-control px-3 py-2 text-sm font-semibold transition",
          isItemActive(item.href)
            ? "bg-secondary text-black shadow-card"
            : "text-app-muted hover:bg-app-soft hover:text-primary"
        )}
        href={item.href}
        key={item.href}
      >
        <Icon className="size-4 shrink-0" strokeWidth={2.25} />
        <span className="truncate">{item.label}</span>
      </Link>
    );
  };

  return (
    <aside className="hidden w-60 flex-shrink-0 border-r border-app-border bg-app-surface md:block">
      <nav className="space-y-1 p-3">
        {groups.map((group) => {
          if (!group.group) {
            return (
              <div className="space-y-0.5 pb-1" key="top">
                {group.items.map(renderLink)}
              </div>
            );
          }

          const expanded = isGroupOpen(group.group);
          const hasActive = group.items.some((item) => isItemActive(item.href));

          return (
            <div key={group.group}>
              <button
                aria-expanded={expanded}
                className={cn(
                  "flex w-full items-center justify-between rounded-control px-3 py-2 text-[10px] font-bold uppercase tracking-widest transition hover:bg-app-soft hover:text-app-text",
                  hasActive ? "text-primary" : "text-app-muted"
                )}
                onClick={() => toggleGroup(group.group)}
                type="button"
              >
                {group.group}
                <ChevronDown
                  className={cn(
                    "size-3.5 shrink-0 transition-transform",
                    expanded ? "" : "-rotate-90"
                  )}
                  strokeWidth={2.5}
                />
              </button>
              {expanded ? (
                <div className="mb-1 mt-0.5 space-y-0.5 border-l border-app-border pl-2">
                  {group.items.map(renderLink)}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}

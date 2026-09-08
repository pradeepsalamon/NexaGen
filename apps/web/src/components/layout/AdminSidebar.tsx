"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import {
  SidebarContainer,
  SidebarGroupBox,
  SidebarLink,
  SidebarToggle
} from "@/components/layout/Sidebar";
import { getAdminNavGroups } from "@/components/layout/navItems";
import { useSidebarCollapse } from "@/components/layout/useSidebarCollapse";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "nexa-admin-nav-open-groups";

export function AdminSidebar() {
  const pathname = usePathname();
  const role = useAuthStore((state) => state.user?.role);
  const groups = useMemo(() => getAdminNavGroups(role), [role]);
  const { collapse, collapsed, toggle } = useSidebarCollapse();

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

  return (
    <SidebarContainer collapsed={collapsed} onDismiss={collapse}>
      <SidebarToggle collapsed={collapsed} onToggle={toggle} />
      {groups.map((group) => {
        if (!group.group) {
          return (
            <div className={cn("pb-1", collapsed ? "space-y-1" : "space-y-0.5")} key="top">
              {group.items.map((item) => (
                <SidebarLink
                  active={isItemActive(item.href)}
                  collapsed={collapsed}
                  item={item}
                  key={item.href}
                />
              ))}
            </div>
          );
        }

        return (
          <SidebarGroupBox
            collapsed={collapsed}
            group={group.group}
            hasActive={group.items.some((item) => isItemActive(item.href))}
            icon={group.icon}
            isItemActive={isItemActive}
            items={group.items}
            key={group.group}
            onToggle={() => toggleGroup(group.group)}
            open={isGroupOpen(group.group)}
          />
        );
      })}
    </SidebarContainer>
  );
}

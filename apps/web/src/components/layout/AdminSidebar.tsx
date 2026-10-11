"use client";

import { SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { NavDrawer, NavDrawerAccordion, NavDrawerLink } from "@/components/layout/Sidebar";
import { getAdminNavGroups } from "@/components/layout/navItems";
import { useLiveClassesMonitor } from "@/features/live-monitor/hooks/useLiveMonitor";
import { useAuthStore } from "@/stores/authStore";

export function AdminSidebar() {
  const pathname = usePathname();
  const role = useAuthStore((state) => state.user?.role);
  // Slow poll for the "Live Now" chip; the page itself shares this query and polls faster.
  const { data: live } = useLiveClassesMonitor({
    enabled: role === "ADMIN" || role === "SUPER_ADMIN",
    refetchIntervalMs: 60_000
  });
  const liveCount = live?.classes.length ?? 0;
  const groups = useMemo(
    () =>
      getAdminNavGroups(role).map((group) => ({
        ...group,
        items: group.items.map((item) =>
          item.href === "/admin/live-classes" && liveCount > 0
            ? { ...item, badge: { label: String(liveCount), pulse: true, tone: "danger" as const } }
            : item
        )
      })),
    [role, liveCount]
  );

  const isItemActive = (href: string) =>
    pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));

  // The section that owns the current route — derived from the URL, never from clicks.
  const routeGroup = useMemo(() => {
    for (const group of groups) {
      if (group.group && group.items.some((item) => isItemActive(item.href))) {
        return group.group;
      }
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, pathname]);

  // One section open at a time; a route change re-opens the section owning it.
  const [openGroup, setOpenGroup] = useState<string | null>(routeGroup);

  useEffect(() => {
    setOpenGroup(routeGroup);
  }, [routeGroup]);

  return (
    <NavDrawer
      subtitle={role === "SUPER_ADMIN" ? "Super Admin" : "Admin"}
      title="Nexa Chess"
    >
      {groups.map((group) =>
        group.group ? (
          <NavDrawerAccordion
            icon={group.icon ?? SlidersHorizontal}
            id={group.group.toLowerCase().replace(/\s+/g, "-")}
            isItemActive={isItemActive}
            items={group.items}
            key={group.group}
            label={group.group}
            onToggle={() =>
              setOpenGroup((prev) => (prev === group.group ? null : group.group))
            }
            open={openGroup === group.group}
          />
        ) : (
          group.items.map((item) => (
            <NavDrawerLink active={isItemActive(item.href)} item={item} key={item.href} />
          ))
        )
      )}
    </NavDrawer>
  );
}

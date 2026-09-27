"use client";

import { SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { NavDrawer, NavDrawerAccordion, NavDrawerLink } from "@/components/layout/Sidebar";
import { getAdminNavGroups } from "@/components/layout/navItems";
import { useAuthStore } from "@/stores/authStore";

export function AdminSidebar() {
  const pathname = usePathname();
  const role = useAuthStore((state) => state.user?.role);
  const groups = useMemo(() => getAdminNavGroups(role), [role]);

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
      subtitle={role === "SUPER_ADMIN" ? "Super Admin Console" : "Admin Console"}
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

"use client";

import { usePathname } from "next/navigation";
import { NavDrawer, NavDrawerLink } from "@/components/layout/Sidebar";
import { coachNavItems } from "@/components/layout/navItems";

export function CoachSidebar() {
  const pathname = usePathname();

  return (
    <NavDrawer subtitle="Coach" title="Nexa Chess">
      {coachNavItems.map((item) => (
        <NavDrawerLink active={pathname === item.href} item={item} key={item.href} />
      ))}
    </NavDrawer>
  );
}

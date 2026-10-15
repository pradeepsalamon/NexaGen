"use client";

import { usePathname } from "next/navigation";
import { NavDrawer, NavDrawerLink } from "@/components/layout/Sidebar";
import { coachNavItems } from "@/components/layout/navItems";
import { useChatNavBadge } from "@/features/chat/hooks/useChat";

export function CoachSidebar() {
  const pathname = usePathname();
  const chatBadge = useChatNavBadge();

  return (
    <NavDrawer subtitle="Coach" title="Nexa Chess">
      {coachNavItems.map((item) => (
        <NavDrawerLink
          active={pathname === item.href}
          item={item.href === "/messages" && chatBadge ? { ...item, badge: chatBadge } : item}
          key={item.href}
        />
      ))}
    </NavDrawer>
  );
}

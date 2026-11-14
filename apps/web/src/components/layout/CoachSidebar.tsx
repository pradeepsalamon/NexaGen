"use client";

import { usePathname } from "next/navigation";
import { NavDrawer, NavDrawerLink } from "@/components/layout/Sidebar";
import { coachNavItems, filterNavByPlan } from "@/components/layout/navItems";
import { useChatNavBadge } from "@/features/chat/hooks/useChat";
import { useCurrentEntitlements } from "@/features/subscription/hooks/useSubscription";

export function CoachSidebar() {
  const pathname = usePathname();
  const chatBadge = useChatNavBadge();
  const planFeatures = useCurrentEntitlements().data?.features;

  return (
    <NavDrawer subtitle="Coach" title="Nexa Chess">
      {filterNavByPlan(coachNavItems, planFeatures).map((item) => (
        <NavDrawerLink
          active={pathname === item.href}
          item={item.href === "/messages" && chatBadge ? { ...item, badge: chatBadge } : item}
          key={item.href}
        />
      ))}
    </NavDrawer>
  );
}

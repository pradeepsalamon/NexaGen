"use client";

import { useBrandName } from "@/features/branding/context/TenantBrandProvider";
import { usePathname } from "next/navigation";
import { NavDrawer, NavDrawerLink } from "@/components/layout/Sidebar";
import { activeNavHref, coachNavItems, filterNavByPlan } from "@/components/layout/navItems";
import { useChatNavBadge } from "@/features/chat/hooks/useChat";
import { useCurrentEntitlements } from "@/features/subscription/hooks/useSubscription";

export function CoachSidebar() {
  const brandName = useBrandName();
  const pathname = usePathname();
  const chatBadge = useChatNavBadge();
  const planFeatures = useCurrentEntitlements().data?.features;
  const items = filterNavByPlan(coachNavItems, planFeatures);
  const activeHref = activeNavHref(items.map((item) => item.href), pathname);

  return (
    <NavDrawer subtitle="Coach" title={brandName}>
      {items.map((item) => (
        <NavDrawerLink
          active={item.href === activeHref}
          item={item.href === "/messages" && chatBadge ? { ...item, badge: chatBadge } : item}
          key={item.href}
        />
      ))}
    </NavDrawer>
  );
}

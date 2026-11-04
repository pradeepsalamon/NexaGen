"use client";

import { usePathname } from "next/navigation";
import { NavDrawer, NavDrawerLink } from "@/components/layout/Sidebar";
import { activeNavHref, filterNavByPlan, salesNavItems } from "@/components/layout/navItems";
import { useCurrentEntitlements } from "@/features/subscription/hooks/useSubscription";

/** SALES accounts: the referral board and their profile, nothing else. */
export function SalesSidebar() {
  const pathname = usePathname();
  const planFeatures = useCurrentEntitlements().data?.features;
  const items = filterNavByPlan(salesNavItems, planFeatures);
  const activeHref = activeNavHref(items.map((item) => item.href), pathname);

  return (
    <NavDrawer subtitle="Sales" title="Nexa Chess">
      {items.map((item) => (
        <NavDrawerLink active={item.href === activeHref} item={item} key={item.href} />
      ))}
    </NavDrawer>
  );
}

"use client";

import { usePathname } from "next/navigation";
import { NavDrawer, NavDrawerLink } from "@/components/layout/Sidebar";
import { filterNavByPlan, salesNavItems } from "@/components/layout/navItems";
import { useCurrentEntitlements } from "@/features/subscription/hooks/useSubscription";

/** SALES accounts: the referral board and their profile, nothing else. */
export function SalesSidebar() {
  const pathname = usePathname();
  const planFeatures = useCurrentEntitlements().data?.features;

  return (
    <NavDrawer subtitle="Sales" title="Nexa Chess">
      {filterNavByPlan(salesNavItems, planFeatures).map((item) => (
        <NavDrawerLink active={pathname === item.href} item={item} key={item.href} />
      ))}
    </NavDrawer>
  );
}

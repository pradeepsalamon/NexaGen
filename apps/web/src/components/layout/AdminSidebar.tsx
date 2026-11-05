"use client";

import { useBrandName } from "@/features/branding/context/TenantBrandProvider";
import { SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { NavDrawer, NavDrawerAccordion, NavDrawerLink } from "@/components/layout/Sidebar";
import { activeNavHref, getAdminNavGroups } from "@/components/layout/navItems";
import { useChatNavBadge } from "@/features/chat/hooks/useChat";
import { useLiveClassesMonitor } from "@/features/live-monitor/hooks/useLiveMonitor";
import { useCurrentEntitlements } from "@/features/subscription/hooks/useSubscription";
import { useAuthStore } from "@/stores/authStore";

export function AdminSidebar() {
  const brandName = useBrandName();
  const pathname = usePathname();
  const role = useAuthStore((state) => state.user?.role);
  const isPlatformOperator = useAuthStore((state) => state.user?.isPlatformOperator === true);
  // Slow poll for the "Live Now" chip; the page itself shares this query and polls faster.
  const { data: live } = useLiveClassesMonitor({
    enabled: role === "ADMIN" || role === "SUPER_ADMIN",
    refetchIntervalMs: 60_000
  });
  const liveCount = live?.classes.length ?? 0;
  const chatBadge = useChatNavBadge(role === "ADMIN" || role === "SUPER_ADMIN");
  const planFeatures = useCurrentEntitlements().data?.features;
  const groups = useMemo(
    () =>
      getAdminNavGroups(role, planFeatures, isPlatformOperator).map((group) => ({
        ...group,
        items: group.items.map((item) =>
          item.href === "/admin/live-classes" && liveCount > 0
            ? { ...item, badge: { label: String(liveCount), pulse: true, tone: "danger" as const } }
            : item.href === "/messages" && chatBadge
              ? { ...item, badge: chatBadge }
              : item
        )
      })),
    [role, liveCount, chatBadge, planFeatures, isPlatformOperator]
  );

  // Only the most specific match is active, so a nested link and its parent
  // never both light up (e.g. /admin/classes and /admin/classes/requests).
  const activeHref = useMemo(
    () => activeNavHref(groups.flatMap((group) => group.items.map((item) => item.href)), pathname),
    [groups, pathname]
  );

  const isItemActive = (href: string) => href === activeHref;

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
      title={brandName}
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

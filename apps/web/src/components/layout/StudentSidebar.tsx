"use client";

import { usePathname } from "next/navigation";
import {
  SidebarContainer,
  SidebarLink,
  SidebarToggle
} from "@/components/layout/Sidebar";
import { studentNavItems } from "@/components/layout/navItems";
import { useSidebarCollapse } from "@/components/layout/useSidebarCollapse";

export function StudentSidebar() {
  const pathname = usePathname();
  const { collapse, collapsed, toggle } = useSidebarCollapse();

  return (
    <SidebarContainer collapsed={collapsed} onDismiss={collapse}>
      <SidebarToggle collapsed={collapsed} onToggle={toggle} />
      <div className="space-y-1">
        {studentNavItems.map((item) => (
          <SidebarLink
            active={pathname === item.href}
            collapsed={collapsed}
            item={item}
            key={item.href}
          />
        ))}
      </div>
    </SidebarContainer>
  );
}

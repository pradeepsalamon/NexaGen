"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getAdminNavGroups } from "@/components/layout/navItems";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/lib/utils";

export function AdminSidebar() {
  const pathname = usePathname();
  const role = useAuthStore((state) => state.user?.role);
  const groups = getAdminNavGroups(role);

  return (
    <aside className="hidden w-60 flex-shrink-0 border-r border-app-border bg-app-surface md:block">
      <nav className="space-y-4 p-3">
        {groups.map((group) => (
          <div key={group.group || "top"}>
            {group.group ? (
              <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-app-muted">
                {group.group}
              </p>
            ) : null}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive =
                  pathname === item.href ||
                  (item.href !== "/admin" && pathname.startsWith(item.href));
                return (
                  <Link
                    className={cn(
                      "flex items-center gap-2.5 rounded-control px-3 py-2 text-sm font-semibold transition",
                      isActive
                        ? "bg-secondary text-black shadow-card"
                        : "text-app-muted hover:bg-app-soft hover:text-primary"
                    )}
                    href={item.href}
                    key={item.href}
                  >
                    <Icon className="size-4 shrink-0" strokeWidth={2.25} />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}

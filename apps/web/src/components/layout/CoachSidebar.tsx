"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  Layers3, 
  CalendarDays, 
  Users, 
  History, 
  Settings,
  UserCheck
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/coach", label: "Dashboard", icon: LayoutDashboard },
  { href: "/coach/batches", label: "My Batches", icon: Layers3 },
  { href: "/coach/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/coach/students", label: "Students", icon: Users },
  { href: "/coach/history", label: "Class History", icon: History },
  { href: "/coach/attendance", label: "Attendance", icon: UserCheck },
  { href: "/profile", label: "Settings", icon: Settings },
];

export function CoachSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 flex-shrink-0 border-r border-app-border bg-app-surface hidden md:block">
      <nav className="p-4 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-control px-4 py-3 text-sm font-bold transition",
                isActive 
                  ? "bg-secondary text-black shadow-card" 
                  : "text-app-muted hover:bg-app-soft hover:text-primary"
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

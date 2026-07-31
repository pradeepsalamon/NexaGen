"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  BookOpen, 
  Layers3, 
  Video, 
  CalendarDays, 
  Target, 
  TrendingUp,
  UserCheck,
  Settings 
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/student", label: "Dashboard", icon: LayoutDashboard },
  { href: "/student/courses", label: "My Courses", icon: BookOpen },
  { href: "/student/batches", label: "My Batches", icon: Layers3 },
  { href: "/student/live-classes", label: "Live Classes", icon: Video },
  { href: "/student/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/student/practice", label: "Practice", icon: Target },
  { href: "/student/progress", label: "Progress", icon: TrendingUp },
  { href: "/student/attendance", label: "Attendance", icon: UserCheck },
  { href: "/profile", label: "Profile & Settings", icon: Settings },
];

export function StudentSidebar() {
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


import {
  BookOpen,
  CalendarDays,
  History,
  Layers3,
  LayoutDashboard,
  Settings,
  Target,
  Trash2,
  TrendingUp,
  UserCheck,
  UserRoundCheck,
  Users,
  Video
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /**
   * Marks a destination whose API requires `SUPER_ADMIN`. Hidden from plain
   * ADMIN users so they never navigate into a guaranteed 401.
   * See AUDIT.md H1.
   */
  superAdminOnly?: boolean;
};

export const studentNavItems: NavItem[] = [
  { href: "/student", label: "Dashboard", icon: LayoutDashboard },
  { href: "/student/courses", label: "My Courses", icon: BookOpen },
  { href: "/student/batches", label: "My Batches", icon: Layers3 },
  { href: "/student/live-classes", label: "Live Classes", icon: Video },
  { href: "/student/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/student/practice", label: "Practice", icon: Target },
  { href: "/student/progress", label: "Progress", icon: TrendingUp },
  { href: "/student/attendance", label: "Attendance", icon: UserCheck },
  { href: "/profile", label: "Profile & Settings", icon: Settings }
];

export const coachNavItems: NavItem[] = [
  { href: "/coach", label: "Dashboard", icon: LayoutDashboard },
  { href: "/coach/batches", label: "My Batches", icon: Layers3 },
  { href: "/coach/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/coach/students", label: "Students", icon: Users },
  { href: "/coach/history", label: "Class History", icon: History },
  { href: "/coach/attendance", label: "Attendance", icon: UserCheck },
  { href: "/profile", label: "Settings", icon: Settings }
];

export const adminNavItems: NavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/batches", label: "Batches", icon: Layers3 },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/attendance", label: "Attendance", icon: UserRoundCheck },
  { href: "/admin/trash", label: "Trash", icon: Trash2, superAdminOnly: true },
  { href: "/admin/coaches", label: "Coach Apps", icon: Users, superAdminOnly: true },
  { href: "/admin/demo-classes", label: "Demo Classes", icon: Video, superAdminOnly: true },
  { href: "/admin/classes", label: "Batch Classes", icon: Video, superAdminOnly: true }
];

/** Admin nav filtered to what the given role's API access actually permits. */
export function getAdminNavItems(role?: string): NavItem[] {
  if (role === "SUPER_ADMIN") {
    return adminNavItems;
  }

  return adminNavItems.filter((item) => !item.superAdminOnly);
}

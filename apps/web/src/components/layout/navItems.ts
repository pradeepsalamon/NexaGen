import {
  Activity,
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardList,
  Clock,
  Database,
  History,
  Layers3,
  LayoutDashboard,
  LineChart,
  Puzzle,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  TrendingUp,
  Trash2,
  UserCheck,
  UserRoundCheck,
  Users,
  Video
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/** Trailing status chip on a sidebar link. `dot` is a bare unread marker. */
export type NavBadge = {
  label?: string;
  pulse?: boolean;
  tone: "accent" | "danger" | "primary" | "secondary" | "warm";
  variant?: "chip" | "dot";
};

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Live status chip; supplied per-render by the role sidebar, not static. */
  badge?: NavBadge;
  /** Sidebar group heading. Items without one render before the first group. */
  group?: string;
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
  { href: "/student/practice", label: "Assignments", icon: Target },
  { href: "/student/puzzles", label: "Puzzles", icon: Puzzle },
  { href: "/student/progress", label: "Progress", icon: TrendingUp },
  { href: "/student/attendance", label: "Attendance", icon: UserCheck },
  { href: "/profile", label: "Profile & Settings", icon: Settings }
];

export const coachNavItems: NavItem[] = [
  { href: "/coach", label: "Dashboard", icon: LayoutDashboard },
  { href: "/coach/batches", label: "My Batches", icon: Layers3 },
  { href: "/coach/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/coach/assignments", label: "Assignments", icon: ClipboardList },
  { href: "/coach/puzzles", label: "Puzzles", icon: Puzzle },
  { href: "/coach/students", label: "Students", icon: Users },
  { href: "/coach/history", label: "Class History", icon: History },
  { href: "/coach/attendance", label: "Attendance", icon: UserCheck },
  { href: "/coach/presets", label: "Class Presets", icon: SlidersHorizontal },
  { href: "/profile", label: "Settings", icon: Settings }
];

export const adminNavItems: NavItem[] = [
  // Analytics
  { href: "/admin", label: "Overview", icon: LayoutDashboard, group: "Analytics" },
  { href: "/admin/analytics/users", label: "Users", icon: Users, group: "Analytics" },
  { href: "/admin/analytics/acquisition", label: "Acquisition", icon: TrendingUp, group: "Analytics" },
  { href: "/admin/analytics/coaches", label: "Coaches", icon: UserRoundCheck, group: "Analytics" },
  { href: "/admin/analytics/classes", label: "Classes", icon: Video, group: "Analytics" },
  { href: "/admin/analytics/attendance", label: "Attendance", icon: UserCheck, group: "Analytics" },
  { href: "/admin/analytics/batches", label: "Batches", icon: Layers3, group: "Analytics" },
  { href: "/admin/analytics/recordings", label: "Recordings & Storage", icon: Database, group: "Analytics" },
  { href: "/admin/analytics/engagement", label: "Engagement", icon: Activity, group: "Analytics" },
  { href: "/admin/analytics/operations", label: "Operations", icon: Clock, group: "Analytics" },
  // Manage
  { href: "/admin/batches", label: "Batches", icon: Layers3, group: "Manage" },
  { href: "/admin/schedule", label: "Class Scheduler", icon: CalendarDays, group: "Manage" },
  { href: "/admin/assignments", label: "Assignments", icon: ClipboardList, group: "Manage" },
  { href: "/admin/puzzles", label: "Puzzle Library", icon: Puzzle, group: "Manage" },
  { href: "/admin/users", label: "Users", icon: Users, group: "Manage" },
  { href: "/admin/attendance", label: "Attendance Reports", icon: BarChart3, group: "Manage" },
  { href: "/admin/live-class", label: "Live Class Settings", icon: SlidersHorizontal, group: "Manage" },
  // Super Admin
  { href: "/admin/backups", label: "DB Backups", icon: Database, group: "Super Admin", superAdminOnly: true },
  { href: "/admin/trash", label: "Trash", icon: Trash2, group: "Super Admin", superAdminOnly: true },
  { href: "/admin/coaches", label: "Coach Apps", icon: Users, group: "Super Admin", superAdminOnly: true },
  { href: "/admin/demo-classes", label: "Demo Classes", icon: Video, group: "Super Admin", superAdminOnly: true },
  { href: "/admin/classes", label: "Batch Classes", icon: LineChart, group: "Super Admin", superAdminOnly: true }
];

/** Admin nav filtered to what the given role's API access actually permits. */
export function getAdminNavItems(role?: string): NavItem[] {
  if (role === "SUPER_ADMIN") {
    return adminNavItems;
  }

  return adminNavItems.filter((item) => !item.superAdminOnly);
}

export type NavGroup = { group: string; icon?: LucideIcon; items: NavItem[] };

/** Icon shown on each admin sidebar group box. */
const ADMIN_GROUP_ICONS: Record<string, LucideIcon> = {
  Analytics: BarChart3,
  Manage: SlidersHorizontal,
  "Super Admin": ShieldCheck
};

/** Admin nav bucketed by `group`, preserving declaration order. */
export function getAdminNavGroups(role?: string): NavGroup[] {
  const groups: NavGroup[] = [];
  for (const item of getAdminNavItems(role)) {
    const key = item.group ?? "";
    let bucket = groups.find((g) => g.group === key);
    if (!bucket) {
      bucket = { group: key, icon: ADMIN_GROUP_ICONS[key], items: [] };
      groups.push(bucket);
    }
    bucket.items.push(item);
  }
  return groups;
}

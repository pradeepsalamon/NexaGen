import {
  Activity,
  BarChart3,
  BookOpen,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  Clock,
  CreditCard,
  Database,
  History,
  Layers3,
  LayoutDashboard,
  LineChart,
  MessageSquare,
  MessageSquareHeart,
  Palette,
  Puzzle,
  ReceiptText,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  TrendingUp,
  Trash2,
  Type,
  UserCheck,
  UserPlus,
  UserRoundCheck,
  Users,
  Video,
  Wallet,
  Wifi
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
  { href: "/student/billing", label: "Billing", icon: CreditCard },
  { href: "/chess-board", label: "Chess Board", icon: Palette },
  { href: "/profile", label: "Profile & Settings", icon: Settings }
];

export const coachNavItems: NavItem[] = [
  { href: "/coach", label: "Dashboard", icon: LayoutDashboard },
  { href: "/coach/batches", label: "My Batches", icon: Layers3 },
  { href: "/coach/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/coach/assignments", label: "Assignments", icon: ClipboardList },
  { href: "/coach/puzzles", label: "Puzzles", icon: Puzzle },
  { href: "/coach/students", label: "Students", icon: Users },
  { href: "/coach/feedback", label: "My Feedback", icon: MessageSquareHeart },
  { href: "/coach/history", label: "Class History", icon: History },
  { href: "/coach/attendance", label: "Attendance", icon: UserCheck },
  { href: "/coach/presets", label: "Class Presets", icon: SlidersHorizontal },
  { href: "/coach/earnings", label: "Earnings", icon: Wallet },
  { href: "/coach/payments", label: "Payments", icon: CreditCard },
  { href: "/chess-board", label: "Chess Board", icon: Palette },
  { href: "/profile", label: "Settings", icon: Settings }
];

export const adminNavItems: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  // Analytics
  { href: "/admin/analytics/users", label: "Users", icon: Users, group: "Analytics" },
  { href: "/admin/analytics/acquisition", label: "Acquisition", icon: TrendingUp, group: "Analytics" },
  { href: "/admin/analytics/coaches", label: "Coaches", icon: UserRoundCheck, group: "Analytics" },
  { href: "/admin/analytics/classes", label: "Classes", icon: Video, group: "Analytics" },
  { href: "/admin/analytics/attendance", label: "Attendance", icon: UserCheck, group: "Analytics" },
  { href: "/admin/analytics/batches", label: "Batches", icon: Layers3, group: "Analytics" },
  { href: "/admin/analytics/recordings", label: "Recordings & Storage", icon: Database, group: "Analytics" },
  { href: "/admin/analytics/engagement", label: "Engagement", icon: Activity, group: "Analytics" },
  { href: "/admin/analytics/operations", label: "Operations", icon: Clock, group: "Analytics" },
  // People & communication
  { href: "/admin/users", label: "Users", icon: Users, group: "People" },
  { href: "/admin/students", label: "Student Approvals", icon: UserRoundCheck, group: "People" },
  { href: "/admin/leads", label: "Leads", icon: UserPlus, group: "People" },
  { href: "/admin/messaging", label: "Messages", icon: MessageSquare, group: "People" },
  { href: "/admin/feedback", label: "Coach Feedback", icon: MessageSquareHeart, group: "People" },
  // Classes & scheduling
  { href: "/admin/batches", label: "Batches", icon: Layers3, group: "Classes" },
  { href: "/admin/schedule", label: "Class Scheduler", icon: CalendarDays, group: "Classes" },
  { href: "/admin/class-requests", label: "Class Requests", icon: CalendarClock, group: "Classes" },
  { href: "/admin/attendance", label: "Attendance Reports", icon: BarChart3, group: "Classes" },
  { href: "/admin/reliability", label: "Live Reliability", icon: Wifi, group: "Classes" },
  // Learning content
  { href: "/admin/courses", label: "Courses", icon: BookOpen, group: "Learning" },
  { href: "/admin/assignments", label: "Assignments", icon: ClipboardList, group: "Learning" },
  { href: "/admin/puzzles", label: "Puzzle Library", icon: Puzzle, group: "Learning" },
  // Finance
  { href: "/admin/payments", label: "Payments", icon: CreditCard, group: "Finance" },
  { href: "/admin/finance/invoices", label: "Invoices", icon: ReceiptText, group: "Finance" },
  { href: "/admin/finance/coach-payroll", label: "Coach Payroll", icon: Wallet, group: "Finance" },
  // Platform settings
  { href: "/admin/live-class", label: "Live Class Settings", icon: SlidersHorizontal, group: "Settings" },
  { href: "/admin/chess-appearance", label: "Chess Appearance", icon: Palette, group: "Settings" },
  { href: "/admin/typography", label: "Fonts & Text", icon: Type, group: "Settings" },
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

/** `group: ""` holds the top-level direct links; every other group is a sidebar section. */
export type NavGroup = { group: string; icon?: LucideIcon; items: NavItem[] };

/** Icon shown on each admin sidebar group box. */
const ADMIN_GROUP_ICONS: Record<string, LucideIcon> = {
  Analytics: BarChart3,
  Classes: CalendarDays,
  Finance: Wallet,
  Learning: BookOpen,
  People: Users,
  Settings: Settings,
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

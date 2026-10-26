import {
  Activity,
  BarChart3,
  BookOpen,
  Brain,
  CalendarClock,
  CalendarDays,
  Captions,
  ClipboardCheck,
  ClipboardList,
  Clock,
  CreditCard,
  Database,
  Gem,
  History,
  Layers3,
  LayoutDashboard,
  Library,
  LineChart,
  MessageSquare,
  MessageSquareHeart,
  MessagesSquare,
  Palette,
  Puzzle,
  Radio,
  ReceiptText,
  ScanSearch,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  Trash2,
  TrendingUp,
  Trophy,
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
import type { PlanFeatureKey } from "@nexa-chess/types";

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
  /** The SaaS plan feature this page belongs to; hidden when the plan lacks it. */
  feature?: PlanFeatureKey;
};

export const studentNavItems: NavItem[] = [
  { href: "/student", label: "Dashboard", icon: LayoutDashboard },
  { href: "/student/courses", label: "My courses", icon: BookOpen, feature: "courses" },
  { href: "/student/batches", label: "My batches", icon: Layers3 },
  { href: "/student/live-classes", label: "Live classes", icon: Video },
  { href: "/student/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/student/practice", label: "Assignments", icon: Target },
  { href: "/student/training", label: "Puzzle training", icon: Puzzle },
  { href: "/student/revision", label: "Smart revision", icon: Brain, feature: "smartRevision" },
  { href: "/student/progress", label: "Progress", icon: TrendingUp },
  { href: "/student/insights", label: "Game insights", icon: ScanSearch, feature: "gameAnalysis" },
  { href: "/games", label: "Game library", icon: Library, feature: "gameLibrary" },
  { href: "/messages", label: "Messages", icon: MessagesSquare, feature: "directChat" },
  { href: "/student/attendance", label: "Attendance", icon: UserCheck },
  { href: "/student/billing", label: "Billing", icon: CreditCard, feature: "studentPayments" },
  { href: "/chess-board", label: "Chess board", icon: Palette },
  { href: "/profile", label: "Profile & settings", icon: Settings }
];

export const coachNavItems: NavItem[] = [
  { href: "/coach", label: "Dashboard", icon: LayoutDashboard },
  { href: "/coach/batches", label: "My batches", icon: Layers3 },
  { href: "/coach/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/coach/assignments", label: "Assignments", icon: ClipboardList },
  { href: "/coach/puzzles", label: "Puzzle library", icon: Puzzle },
  { href: "/coach/students", label: "Students", icon: Users },
  { href: "/messages", label: "Messages", icon: MessagesSquare, feature: "directChat" },
  { href: "/games", label: "Game library", icon: Library, feature: "gameLibrary" },
  { href: "/coach/feedback", label: "My feedback", icon: MessageSquareHeart, feature: "coachFeedback" },
  { href: "/coach/history", label: "Class history", icon: History },
  { href: "/coach/attendance", label: "Attendance", icon: UserCheck },
  { href: "/coach/presets", label: "Class presets", icon: SlidersHorizontal },
  { href: "/coach/earnings", label: "Earnings", icon: Wallet, feature: "coachPayroll" },
  { href: "/coach/payments", label: "Payments", icon: CreditCard, feature: "studentPayments" },
  { href: "/chess-board", label: "Chess board", icon: Palette },
  { href: "/profile", label: "Profile & settings", icon: Settings }
];

export const adminNavItems: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  // Every class running right now, each one open to watch silently.
  { href: "/admin/live-classes", label: "Live now", icon: Radio },
  // Analytics
  { href: "/admin/analytics/users", label: "Users", icon: Users, group: "Analytics", feature: "advancedAnalytics" },
  { href: "/admin/analytics/acquisition", label: "Acquisition", icon: TrendingUp, group: "Analytics", feature: "advancedAnalytics" },
  { href: "/admin/analytics/coaches", label: "Coaches", icon: UserRoundCheck, group: "Analytics", feature: "advancedAnalytics" },
  { href: "/admin/analytics/classes", label: "Classes", icon: Video, group: "Analytics", feature: "advancedAnalytics" },
  { href: "/admin/analytics/attendance", label: "Attendance", icon: UserCheck, group: "Analytics", feature: "advancedAnalytics" },
  { href: "/admin/analytics/batches", label: "Batches", icon: Layers3, group: "Analytics", feature: "advancedAnalytics" },
  { href: "/admin/analytics/recordings", label: "Recordings & storage", icon: Database, group: "Analytics", feature: "advancedAnalytics" },
  { href: "/admin/analytics/engagement", label: "Engagement", icon: Activity, group: "Analytics", feature: "advancedAnalytics" },
  { href: "/admin/analytics/operations", label: "Operations", icon: Clock, group: "Analytics", feature: "advancedAnalytics" },
  // People & communication
  { href: "/admin/users", label: "Users", icon: Users, group: "People" },
  { href: "/admin/approvals", label: "Approvals", icon: UserRoundCheck, group: "People" },
  { href: "/admin/leads", label: "Leads", icon: UserPlus, group: "People", feature: "leadsCrm" },
  { href: "/admin/messaging", label: "Messaging rules", icon: MessageSquare, group: "People", feature: "messagingAutomation" },
  { href: "/messages", label: "Chats", icon: MessagesSquare, group: "People", feature: "directChat" },
  { href: "/admin/feedback", label: "Coach feedback", icon: MessageSquareHeart, group: "People", feature: "coachFeedback" },
  { href: "/admin/privacy", label: "Privacy requests", icon: ShieldCheck, group: "People" },
  // Classes & scheduling
  { href: "/admin/batches", label: "Batches", icon: Layers3, group: "Classes" },
  { href: "/admin/schedule", label: "Class scheduler", icon: CalendarDays, group: "Classes" },
  { href: "/admin/class-requests", label: "Class requests", icon: CalendarClock, group: "Classes" },
  { href: "/admin/attendance", label: "Attendance reports", icon: BarChart3, group: "Classes" },
  { href: "/admin/attendance/policy", label: "Attendance policy", icon: ClipboardCheck, group: "Classes" },
  { href: "/admin/reliability", label: "Live reliability", icon: Wifi, group: "Classes" },
  { href: "/admin/caption-test", label: "Caption test", icon: Captions, group: "Classes" },
  // Learning content
  { href: "/admin/courses", label: "Courses", icon: BookOpen, group: "Learning", feature: "courses" },
  { href: "/admin/assignments", label: "Assignments", icon: ClipboardList, group: "Learning" },
  { href: "/admin/puzzles", label: "Puzzle library", icon: Puzzle, group: "Learning" },
  { href: "/admin/puzzles/scoring", label: "Puzzle points", icon: Trophy, group: "Learning" },
  { href: "/games", label: "Game library", icon: Library, group: "Learning", feature: "gameLibrary" },
  // Finance
  { href: "/admin/payments", label: "Payments", icon: CreditCard, group: "Finance", feature: "studentPayments" },
  { href: "/admin/finance/invoices", label: "Invoices", icon: ReceiptText, group: "Finance", feature: "studentPayments" },
  { href: "/admin/finance/coach-payroll", label: "Coach payroll", icon: Wallet, group: "Finance", feature: "coachPayroll" },
  // Platform settings
  { href: "/admin/live-class", label: "Live class settings", icon: SlidersHorizontal, group: "Settings" },
  { href: "/admin/chess-appearance", label: "Chess appearance", icon: Palette, group: "Settings", feature: "customBranding" },
  { href: "/admin/typography", label: "Fonts & text", icon: Type, group: "Settings", feature: "customBranding" },
  { href: "/admin/subscription", label: "Subscription", icon: Gem, group: "Settings" },
  // Super Admin
  { href: "/admin/backups", label: "Database backups", icon: Database, group: "Super Admin", superAdminOnly: true },
  { href: "/admin/trash", label: "Trash", icon: Trash2, group: "Super Admin", superAdminOnly: true },
  { href: "/admin/demo-classes", label: "Demo classes", icon: Video, group: "Super Admin", superAdminOnly: true, feature: "demoClasses" },
  { href: "/admin/classes", label: "Batch classes", icon: LineChart, group: "Super Admin", superAdminOnly: true }
];

/**
 * Drops items whose plan feature the academy lacks. `features` undefined (plan
 * still loading) keeps everything, so the nav doesn't jump on every load.
 */
export function filterNavByPlan(items: NavItem[], features?: readonly PlanFeatureKey[]): NavItem[] {
  if (!features) return items;
  return items.filter((item) => !item.feature || features.includes(item.feature));
}

/** Admin nav filtered to what the given role's API access and the plan actually permit. */
export function getAdminNavItems(role?: string, features?: readonly PlanFeatureKey[]): NavItem[] {
  const items = role === "SUPER_ADMIN" ? adminNavItems : adminNavItems.filter((item) => !item.superAdminOnly);
  return filterNavByPlan(items, features);
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
export function getAdminNavGroups(role?: string, features?: readonly PlanFeatureKey[]): NavGroup[] {
  const groups: NavGroup[] = [];
  for (const item of getAdminNavItems(role, features)) {
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

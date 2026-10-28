import { SITE_NAME } from "@/lib/site";

/**
 * The one name for every signed-in page: the browser tab (`metadata.title`,
 * expanded by the root layout's "%s | Nexa Chess" template) and the header
 * label both read it, so they can't drift apart. Keys are the route pattern as
 * it appears under `app/` (`[id]` segments included). Nav labels in
 * `components/layout/navItems.ts` use the same wording.
 */
export const PAGE_TITLES = {
  "/admin": "Dashboard",
  "/admin/analytics/acquisition": "Acquisition analytics",
  "/admin/analytics/attendance": "Attendance analytics",
  "/admin/analytics/batches": "Batch analytics",
  "/admin/analytics/batches/[id]": "Batch analytics",
  "/admin/analytics/classes": "Class analytics",
  "/admin/analytics/coaches": "Coach analytics",
  "/admin/analytics/coaches/[id]": "Coach analytics",
  "/admin/analytics/engagement": "Engagement analytics",
  "/admin/analytics/operations": "Operations",
  "/admin/analytics/recordings": "Recordings & storage",
  "/admin/analytics/students": "Student analytics",
  "/admin/analytics/users": "User analytics",
  "/admin/approvals": "Approvals",
  "/admin/assignments": "Assignments",
  "/admin/attendance": "Attendance reports",
  "/admin/attendance/coaches": "Coach teaching report",
  "/admin/attendance/completed-classes": "Completed classes",
  "/admin/attendance/completed-classes/[id]": "Completed class",
  "/admin/attendance/policy": "Attendance policy",
  "/admin/backups": "Database backups",
  "/admin/batches": "Batches",
  "/admin/caption-test": "Caption test",
  "/admin/chess-appearance": "Chess appearance",
  "/admin/class-requests": "Class requests",
  "/admin/classes": "Batch classes",
  "/admin/courses": "Courses",
  "/admin/courses/[id]": "Course",
  "/admin/courses/new": "New course",
  "/admin/demo-classes": "Demo classes",
  "/admin/feedback": "Coach feedback",
  "/admin/finance/coach-payroll": "Coach payroll",
  "/admin/finance/coach-payroll/periods/[id]": "Payroll period",
  "/admin/finance/invoices": "Invoices",
  "/admin/finance/invoices/[id]": "Invoice",
  "/admin/knowledge": "Knowledge base",
  "/admin/knowledge/[id]": "Edit help article",
  "/admin/knowledge/new": "New help article",
  "/admin/leads": "Leads",
  "/admin/live-class": "Live class settings",
  "/admin/live-classes": "Live now",
  "/admin/live-classes/[classId]": "Live class",
  "/admin/messaging": "Messaging rules",
  "/admin/payments": "Payments",
  "/admin/privacy": "Privacy requests",
  "/admin/puzzles": "Puzzle library",
  "/admin/puzzles/[id]": "Puzzle",
  "/admin/puzzles/[id]/edit": "Edit puzzle",
  "/admin/puzzles/import-pdf": "Import from PDF",
  "/admin/puzzles/new": "New puzzle",
  "/admin/puzzles/scoring": "Puzzle points",
  "/admin/reliability": "Live reliability",
  "/admin/schedule": "Class scheduler",
  "/admin/schedule/[id]": "Class schedule",
  "/admin/schedule/new": "New schedule",
  "/admin/students/[studentId]": "Student progress",
  "/admin/subscription": "Subscription",
  "/admin/trash": "Trash",
  "/admin/typography": "Fonts & text",
  "/admin/users": "Users",
  "/checkout/[planId]": "Checkout",
  "/chess-board": "Chess board",
  "/classes/[id]": "Class details",
  "/coach": "Dashboard",
  "/coach/assignments": "Assignments",
  "/coach/attendance": "Attendance",
  "/coach/batches": "My batches",
  "/coach/earnings": "Earnings",
  "/coach/feedback": "My feedback",
  "/coach/history": "Class history",
  "/coach/payments": "Payments",
  "/coach/presets": "Class presets",
  "/coach/puzzles": "Puzzle library",
  "/coach/puzzles/[id]": "Puzzle",
  "/coach/puzzles/[id]/edit": "Edit puzzle",
  "/coach/puzzles/import-pdf": "Import from PDF",
  "/coach/puzzles/new": "New puzzle",
  "/coach/schedule": "Schedule",
  "/coach/students": "Students",
  "/coach/students/[studentId]": "Student progress",
  "/demo/[classId]": "Demo class",
  "/forgot-password": "Forgot password",
  "/games": "Game library",
  "/games/[id]": "Game",
  "/help": "Help centre",
  "/help/[slug]": "Help article",
  "/live-class/[roomId]": "Live class",
  "/live-class/[roomId]/board": "Shared board",
  "/login": "Log in",
  "/messages": "Messages",
  "/plans": "Plans",
  "/privacy": "Privacy policy",
  "/profile": "Profile & settings",
  "/register": "Create account",
  "/reset-password": "Reset password",
  "/student": "Dashboard",
  "/student/attendance": "Attendance",
  "/student/batches": "My batches",
  "/student/billing": "Billing",
  "/student/billing/invoices/[id]": "Invoice",
  "/student/courses": "My courses",
  "/student/courses/[id]": "Course",
  "/student/insights": "Game insights",
  "/student/live-classes": "Live classes",
  "/student/practice": "Assignments",
  "/student/practice/[id]": "Assignment",
  "/student/progress": "Progress",
  "/student/puzzles/[id]": "Solve puzzle",
  "/student/revision": "Smart revision",
  "/student/schedule": "Schedule",
  "/student/training": "Puzzle training",
  "/terms": "Terms of service",
  "/verify-email": "Verify email"
} as const;

export type PageRoute = keyof typeof PAGE_TITLES;

export function pageTitle(route: PageRoute): string {
  return PAGE_TITLES[route];
}

/**
 * Title for a `layout.tsx` that names a client-component page. A plain string
 * there would stop the root "%s | Nexa Chess" template reaching child routes,
 * so the layout sets its own full title and hands the template on.
 */
export function layoutTitle(route: PageRoute) {
  return { absolute: `${PAGE_TITLES[route]} | ${SITE_NAME}`, template: `%s | ${SITE_NAME}` };
}

const PATTERNS = (Object.keys(PAGE_TITLES) as PageRoute[])
  .filter((route) => route.includes("["))
  .map((route) => ({
    regex: new RegExp(`^${route.replace(/\[[^\]]+\]/g, "[^/]+")}$`),
    route
  }));

/** Header label for a live pathname; unknown routes fall back to the site name. */
export function resolvePageTitle(pathname: string): string {
  const path = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  if (path in PAGE_TITLES) return PAGE_TITLES[path as PageRoute];
  const match = PATTERNS.find(({ regex }) => regex.test(path));
  return match ? PAGE_TITLES[match.route] : "Nexa Chess";
}

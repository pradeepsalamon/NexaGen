import type { PlanFeatureKey } from "@nexa-chess/types";

/**
 * Pages that belong to one plan feature. Mirrors the API's `@RequireFeature`
 * gates (which are the real enforcement); here it only decides whether a page
 * shows its content or an upgrade notice. Longest prefix wins.
 */
const FEATURE_ROUTES: { prefix: string; feature: PlanFeatureKey }[] = [
  { feature: "advancedAnalytics", prefix: "/admin/analytics" },
  { feature: "coachFeedback", prefix: "/admin/feedback" },
  { feature: "coachFeedback", prefix: "/coach/feedback" },
  { feature: "coachPayroll", prefix: "/admin/finance/coach-payroll" },
  { feature: "coachPayroll", prefix: "/coach/earnings" },
  { feature: "courses", prefix: "/admin/courses" },
  { feature: "courses", prefix: "/student/courses" },
  { feature: "customBranding", prefix: "/admin/chess-appearance" },
  { feature: "customBranding", prefix: "/admin/typography" },
  { feature: "demoClasses", prefix: "/admin/demo-classes" },
  { feature: "directChat", prefix: "/messages" },
  { feature: "gameAnalysis", prefix: "/student/insights" },
  { feature: "gameLibrary", prefix: "/games" },
  { feature: "leadsCrm", prefix: "/admin/leads" },
  { feature: "messagingAutomation", prefix: "/admin/messaging" },
  { feature: "smartRevision", prefix: "/student/revision" },
  { feature: "studentPayments", prefix: "/admin/finance/invoices" },
  { feature: "studentPayments", prefix: "/admin/payments" },
  { feature: "studentPayments", prefix: "/checkout" },
  { feature: "studentPayments", prefix: "/coach/payments" },
  { feature: "studentPayments", prefix: "/plans" },
  { feature: "studentPayments", prefix: "/student/billing" },
];

const matches = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);

export function featureForPath(path: string): PlanFeatureKey | null {
  let best: { prefix: string; feature: PlanFeatureKey } | null = null;
  for (const route of FEATURE_ROUTES) {
    if (matches(path, route.prefix) && (!best || route.prefix.length > best.prefix.length)) best = route;
  }
  return best?.feature ?? null;
}

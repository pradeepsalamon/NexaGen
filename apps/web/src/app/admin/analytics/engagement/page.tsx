import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { EngagementAnalyticsPageClient } from "./EngagementAnalyticsPageClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/analytics/engagement") };

export default async function EngagementAnalyticsPage() {
  await assertAnalyticsCookie();
  return <EngagementAnalyticsPageClient />;
}

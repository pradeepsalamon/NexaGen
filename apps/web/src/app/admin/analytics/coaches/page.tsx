import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { CoachesAnalyticsPageClient } from "./CoachesAnalyticsPageClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/analytics/coaches") };

export default async function CoachAnalyticsPage() {
  await assertAnalyticsCookie();
  return <CoachesAnalyticsPageClient />;
}

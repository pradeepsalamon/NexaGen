import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { CoachesAnalyticsPageClient } from "./CoachesAnalyticsPageClient";

export default async function CoachAnalyticsPage() {
  await assertAnalyticsCookie();
  return <CoachesAnalyticsPageClient />;
}

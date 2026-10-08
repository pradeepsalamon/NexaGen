import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { EngagementAnalyticsPageClient } from "./EngagementAnalyticsPageClient";

export default async function EngagementAnalyticsPage() {
  await assertAnalyticsCookie();
  return <EngagementAnalyticsPageClient />;
}

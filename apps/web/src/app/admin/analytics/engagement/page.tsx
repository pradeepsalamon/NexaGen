import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { EngagementAnalyticsPageClient } from "./EngagementAnalyticsPageClient";

export default function EngagementAnalyticsPage() {
  assertAnalyticsCookie();
  return <EngagementAnalyticsPageClient />;
}

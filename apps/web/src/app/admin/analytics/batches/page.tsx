import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { BatchAnalyticsPageClient } from "./BatchAnalyticsPageClient";

export default function BatchAnalyticsPage() {
  assertAnalyticsCookie();
  return <BatchAnalyticsPageClient />;
}

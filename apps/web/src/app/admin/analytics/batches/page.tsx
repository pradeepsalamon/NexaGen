import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { BatchAnalyticsPageClient } from "./BatchAnalyticsPageClient";

export default async function BatchAnalyticsPage() {
  await assertAnalyticsCookie();
  return <BatchAnalyticsPageClient />;
}

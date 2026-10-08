import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { OperationsAnalyticsPageClient } from "./OperationsAnalyticsPageClient";

export default async function OperationsAnalyticsPage() {
  await assertAnalyticsCookie();
  return <OperationsAnalyticsPageClient />;
}

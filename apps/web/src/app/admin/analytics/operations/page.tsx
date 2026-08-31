import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { OperationsAnalyticsPageClient } from "./OperationsAnalyticsPageClient";

export default function OperationsAnalyticsPage() {
  assertAnalyticsCookie();
  return <OperationsAnalyticsPageClient />;
}

import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { RecordingsAnalyticsPageClient } from "./RecordingsAnalyticsPageClient";

export default function RecordingsAnalyticsPage() {
  assertAnalyticsCookie();
  return <RecordingsAnalyticsPageClient />;
}

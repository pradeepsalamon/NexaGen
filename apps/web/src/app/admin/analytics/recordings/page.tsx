import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { RecordingsAnalyticsPageClient } from "./RecordingsAnalyticsPageClient";

export default async function RecordingsAnalyticsPage() {
  await assertAnalyticsCookie();
  return <RecordingsAnalyticsPageClient />;
}

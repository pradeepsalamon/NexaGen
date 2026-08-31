import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { BatchDetailPageClient } from "./BatchDetailPageClient";

export default function BatchDetailAnalyticsPage({
  params
}: {
  params: { id: string };
}) {
  assertAnalyticsCookie();
  return <BatchDetailPageClient batchId={params.id} />;
}

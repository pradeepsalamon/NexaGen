import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { BatchDetailPageClient } from "./BatchDetailPageClient";

export default async function BatchDetailAnalyticsPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  await assertAnalyticsCookie();
  return <BatchDetailPageClient batchId={params.id} />;
}

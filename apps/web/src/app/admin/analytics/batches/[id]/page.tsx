import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { BatchDetailPageClient } from "./BatchDetailPageClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/analytics/batches/[id]") };

export default async function BatchDetailAnalyticsPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  await assertAnalyticsCookie();
  return <BatchDetailPageClient batchId={params.id} />;
}

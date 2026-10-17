import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { BatchAnalyticsPageClient } from "./BatchAnalyticsPageClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/analytics/batches") };

export default async function BatchAnalyticsPage() {
  await assertAnalyticsCookie();
  return <BatchAnalyticsPageClient />;
}

import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { OperationsAnalyticsPageClient } from "./OperationsAnalyticsPageClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/analytics/operations") };

export default async function OperationsAnalyticsPage() {
  await assertAnalyticsCookie();
  return <OperationsAnalyticsPageClient />;
}

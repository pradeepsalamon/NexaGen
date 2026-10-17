import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { AcquisitionAnalyticsPageClient } from "./AcquisitionAnalyticsPageClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/analytics/acquisition") };

export default async function AcquisitionAnalyticsPage() {
  await assertAnalyticsCookie();
  return <AcquisitionAnalyticsPageClient />;
}

import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { AcquisitionAnalyticsPageClient } from "./AcquisitionAnalyticsPageClient";

export default async function AcquisitionAnalyticsPage() {
  await assertAnalyticsCookie();
  return <AcquisitionAnalyticsPageClient />;
}

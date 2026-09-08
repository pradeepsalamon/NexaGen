import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { AcquisitionAnalyticsPageClient } from "./AcquisitionAnalyticsPageClient";

export default function AcquisitionAnalyticsPage() {
  assertAnalyticsCookie();
  return <AcquisitionAnalyticsPageClient />;
}

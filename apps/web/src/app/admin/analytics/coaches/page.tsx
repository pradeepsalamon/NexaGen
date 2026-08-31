import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { CoachesAnalyticsPageClient } from "./CoachesAnalyticsPageClient";

export default function CoachAnalyticsPage() {
  assertAnalyticsCookie();
  return <CoachesAnalyticsPageClient />;
}

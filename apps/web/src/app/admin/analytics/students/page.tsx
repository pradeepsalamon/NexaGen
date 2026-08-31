import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { StudentAnalyticsPageClient } from "./StudentAnalyticsPageClient";

export default function StudentAnalyticsPage() {
  assertAnalyticsCookie();
  return <StudentAnalyticsPageClient />;
}

import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { StudentAnalyticsPageClient } from "./StudentAnalyticsPageClient";

export default async function StudentAnalyticsPage() {
  await assertAnalyticsCookie();
  return <StudentAnalyticsPageClient />;
}

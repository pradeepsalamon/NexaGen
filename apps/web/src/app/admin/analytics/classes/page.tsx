import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { ClassesAnalyticsPageClient } from "./ClassesAnalyticsPageClient";

export default async function ClassAnalyticsPage() {
  await assertAnalyticsCookie();
  return <ClassesAnalyticsPageClient />;
}

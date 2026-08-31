import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { ClassesAnalyticsPageClient } from "./ClassesAnalyticsPageClient";

export default function ClassAnalyticsPage() {
  assertAnalyticsCookie();
  return <ClassesAnalyticsPageClient />;
}

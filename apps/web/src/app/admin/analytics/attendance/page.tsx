import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { AttendanceAnalyticsPageClient } from "./AttendanceAnalyticsPageClient";

export default async function AttendanceAnalyticsPage() {
  await assertAnalyticsCookie();
  return <AttendanceAnalyticsPageClient />;
}

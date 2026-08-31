import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { AttendanceAnalyticsPageClient } from "./AttendanceAnalyticsPageClient";

export default function AttendanceAnalyticsPage() {
  assertAnalyticsCookie();
  return <AttendanceAnalyticsPageClient />;
}

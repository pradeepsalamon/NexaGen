import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { AttendanceAnalyticsPageClient } from "./AttendanceAnalyticsPageClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/analytics/attendance") };

export default async function AttendanceAnalyticsPage() {
  await assertAnalyticsCookie();
  return <AttendanceAnalyticsPageClient />;
}

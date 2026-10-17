import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { StudentAnalyticsPageClient } from "./StudentAnalyticsPageClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/analytics/students") };

export default async function StudentAnalyticsPage() {
  await assertAnalyticsCookie();
  return <StudentAnalyticsPageClient />;
}

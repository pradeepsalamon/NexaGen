import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { ClassesAnalyticsPageClient } from "./ClassesAnalyticsPageClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/analytics/classes") };

export default async function ClassAnalyticsPage() {
  await assertAnalyticsCookie();
  return <ClassesAnalyticsPageClient />;
}

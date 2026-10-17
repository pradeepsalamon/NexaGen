import { AnalyticsDashboardClient } from "@/features/analytics/components/AnalyticsDashboardClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin") };

export default function AdminOverviewPage() {
  return <AnalyticsDashboardClient />;
}

import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { UsersAnalyticsPageClient } from "./UsersAnalyticsPageClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/analytics/users") };

export default async function UserAnalyticsPage() {
  await assertAnalyticsCookie();
  return <UsersAnalyticsPageClient />;
}

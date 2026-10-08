import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { UsersAnalyticsPageClient } from "./UsersAnalyticsPageClient";

export default async function UserAnalyticsPage() {
  await assertAnalyticsCookie();
  return <UsersAnalyticsPageClient />;
}

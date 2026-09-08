import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { UsersAnalyticsPageClient } from "./UsersAnalyticsPageClient";

export default function UserAnalyticsPage() {
  assertAnalyticsCookie();
  return <UsersAnalyticsPageClient />;
}

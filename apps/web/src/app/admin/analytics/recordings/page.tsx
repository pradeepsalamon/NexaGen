import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { RecordingsAnalyticsPageClient } from "./RecordingsAnalyticsPageClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/analytics/recordings") };

export default async function RecordingsAnalyticsPage() {
  await assertAnalyticsCookie();
  return <RecordingsAnalyticsPageClient />;
}

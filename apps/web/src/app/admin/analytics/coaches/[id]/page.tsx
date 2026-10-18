import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { CoachDetailPageClient } from "./CoachDetailPageClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/analytics/coaches/[id]") };

export default async function CoachDetailAnalyticsPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  await assertAnalyticsCookie();
  return <CoachDetailPageClient coachId={params.id} />;
}

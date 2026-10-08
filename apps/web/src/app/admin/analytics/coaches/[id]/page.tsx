import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { CoachDetailPageClient } from "./CoachDetailPageClient";

export default async function CoachDetailAnalyticsPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = await props.params;
  await assertAnalyticsCookie();
  return <CoachDetailPageClient coachId={params.id} />;
}

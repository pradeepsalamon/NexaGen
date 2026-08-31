import { assertAnalyticsCookie } from "@/features/analytics/components/AnalyticsGate";
import { CoachDetailPageClient } from "./CoachDetailPageClient";

export default function CoachDetailAnalyticsPage({
  params
}: {
  params: { id: string };
}) {
  assertAnalyticsCookie();
  return <CoachDetailPageClient coachId={params.id} />;
}

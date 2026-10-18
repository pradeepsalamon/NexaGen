import { ScheduleDetailClient } from "@/features/batch-schedules/components/ScheduleDetailClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/schedule/[id]") };

export default async function ScheduleDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <ScheduleDetailClient scheduleId={params.id} />;
}

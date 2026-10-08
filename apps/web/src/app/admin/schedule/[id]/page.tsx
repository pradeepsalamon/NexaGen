import { ScheduleDetailClient } from "@/features/batch-schedules/components/ScheduleDetailClient";

export const metadata = { title: "Class Schedule - Admin" };

export default async function ScheduleDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <ScheduleDetailClient scheduleId={params.id} />;
}

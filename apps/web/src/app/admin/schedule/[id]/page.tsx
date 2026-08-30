import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ScheduleDetailClient } from "@/features/batch-schedules/components/ScheduleDetailClient";

export const metadata = { title: "Class Schedule - Admin" };

export default function ScheduleDetailPage({ params }: { params: { id: string } }) {
  const hasAccessToken = Boolean(cookies().get("nexa_access_token")?.value);
  const hasRefreshToken = Boolean(cookies().get("nexa_refresh_token")?.value);
  if (!hasAccessToken && !hasRefreshToken) {
    redirect("/login?reason=unauthorized");
  }
  return <ScheduleDetailClient scheduleId={params.id} />;
}

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ScheduleListClient } from "@/features/batch-schedules/components/ScheduleListClient";

export const metadata = { title: "Class Scheduler - Admin" };

export default function AdminSchedulePage() {
  const hasAccessToken = Boolean(cookies().get("nexa_access_token")?.value);
  const hasRefreshToken = Boolean(cookies().get("nexa_refresh_token")?.value);
  if (!hasAccessToken && !hasRefreshToken) {
    redirect("/login?reason=unauthorized");
  }
  return <ScheduleListClient />;
}

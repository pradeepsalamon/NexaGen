import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ScheduleBuilderClient } from "@/features/batch-schedules/components/ScheduleBuilderClient";

export const metadata = { title: "New Class Schedule - Admin" };

export default function NewSchedulePage() {
  const hasAccessToken = Boolean(cookies().get("nexa_access_token")?.value);
  const hasRefreshToken = Boolean(cookies().get("nexa_refresh_token")?.value);
  if (!hasAccessToken && !hasRefreshToken) {
    redirect("/login?reason=unauthorized");
  }
  return <ScheduleBuilderClient />;
}

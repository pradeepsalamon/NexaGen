import { ScheduleListClient } from "@/features/batch-schedules/components/ScheduleListClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/schedule") };

export default function AdminSchedulePage() {
  return <ScheduleListClient />;
}

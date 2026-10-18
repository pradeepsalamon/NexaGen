import { ScheduleBuilderClient } from "@/features/batch-schedules/components/ScheduleBuilderClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/schedule/new") };

export default function NewSchedulePage() {
  return <ScheduleBuilderClient />;
}

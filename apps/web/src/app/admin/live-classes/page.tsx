import { LiveClassesMonitorClient } from "@/features/live-monitor/components/LiveClassesMonitorClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/live-classes") };

export default function AdminLiveClassesPage() {
  return <LiveClassesMonitorClient />;
}

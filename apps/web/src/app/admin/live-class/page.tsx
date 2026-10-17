import { AdminLiveClassSettingsClient } from "@/features/live-class/settings/AdminLiveClassSettingsClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/admin/live-class"),
};

export default function AdminLiveClassSettingsPage() {
  return <AdminLiveClassSettingsClient />;
}

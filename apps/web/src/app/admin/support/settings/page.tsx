import { SupportSettingsClient } from "@/features/support/components/SupportSettingsClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/support/settings") };

export default function AdminSupportSettingsPage() {
  return <SupportSettingsClient />;
}

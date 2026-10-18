import { AdminPrivacyClient } from "@/features/privacy/components/AdminPrivacyClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/admin/privacy")
};

export default function AdminPrivacyPage() {
  return <AdminPrivacyClient />;
}

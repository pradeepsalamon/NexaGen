import { AdminClassRequestsClient } from "@/features/class-requests/components/AdminClassRequestsClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/class-requests") };

export default function AdminClassRequestsPage() {
  return <AdminClassRequestsClient />;
}

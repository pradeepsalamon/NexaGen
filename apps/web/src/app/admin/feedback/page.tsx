import { AdminFeedbackClient } from "@/features/feedback/components/admin/AdminFeedbackClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/feedback") };

export default function AdminFeedbackPage() {
  return <AdminFeedbackClient />;
}

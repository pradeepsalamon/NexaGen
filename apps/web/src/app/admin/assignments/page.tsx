import { AdminAssignmentsClient } from "@/features/assignments/components/AdminAssignmentsClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/admin/assignments")
};

export default function AdminAssignmentsPage() {
  return <AdminAssignmentsClient />;
}

import { LeadsManagementClient } from "@/features/leads/components/LeadsManagementClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/leads") };

export default function AdminLeadsPage() {
  return <LeadsManagementClient />;
}

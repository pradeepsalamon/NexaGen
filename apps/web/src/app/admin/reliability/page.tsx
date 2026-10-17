import { AdminLiveReliabilityClient } from "@/features/attendance/components/AdminLiveReliabilityClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/admin/reliability"),
};

export default function AdminLiveReliabilityPage() {
  return <AdminLiveReliabilityClient />;
}

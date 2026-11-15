import { AdminReferralsClient } from "@/features/referrals/components/admin/AdminReferralsClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/referrals") };

export default function AdminReferralsPage() {
  return <AdminReferralsClient />;
}

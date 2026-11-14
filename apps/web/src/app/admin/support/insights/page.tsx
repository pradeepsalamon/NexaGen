import { SupportInsightsClient } from "@/features/support/components/SupportInsightsClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/support/insights") };

export default function AdminSupportInsightsPage() {
  return <SupportInsightsClient />;
}

import { PaymentsAdminClient } from "@/features/payments/components/PaymentsAdminClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/admin/payments"),
};

export default function Page() {
  return <PaymentsAdminClient />;
}

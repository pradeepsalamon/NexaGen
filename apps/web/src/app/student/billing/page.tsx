import { BillingClient } from "@/features/payments/components/BillingClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/student/billing"),
};

export default function Page() {
  return <BillingClient />;
}

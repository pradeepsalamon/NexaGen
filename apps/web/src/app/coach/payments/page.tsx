import { CoachManualPaymentsClient } from "@/features/payments/components/CoachManualPaymentsClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/coach/payments"),
};

export default function CoachPaymentsPage() {
  return <CoachManualPaymentsClient />;
}

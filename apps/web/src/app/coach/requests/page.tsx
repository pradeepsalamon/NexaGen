import { CoachRequestsClient } from "@/features/approvals/components/CoachRequestsClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/coach/requests") };

export default function CoachRequestsPage() {
  return <CoachRequestsClient />;
}

import { CoachEarningsClient } from "@/features/payroll/components/CoachEarningsClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/coach/earnings"),
};

export default function CoachEarningsPage() {
  return <CoachEarningsClient />;
}

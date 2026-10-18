import { CoachDashboardClient } from "../../features/coach/components/CoachDashboardClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/coach")
};

export default function CoachDashboardPage() {
  return <CoachDashboardClient />;
}

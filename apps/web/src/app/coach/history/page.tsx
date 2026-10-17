import { CoachHistoryClient } from "../../../features/coach/components/CoachHistoryClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/coach/history")
};

export default function CoachHistoryPage() {
  return <CoachHistoryClient />;
}

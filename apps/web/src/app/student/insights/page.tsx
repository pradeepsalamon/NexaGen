import { StudentInsightsClient } from "@/features/game-analysis/components/StudentInsightsClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/student/insights")
};

export default function StudentInsightsPage() {
  return <StudentInsightsClient />;
}

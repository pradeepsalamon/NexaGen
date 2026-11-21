import { DailyPuzzleClient } from "@/features/daily-puzzle/components/DailyPuzzleClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/student/daily-puzzle")
};

export default function StudentDailyPuzzlePage() {
  return <DailyPuzzleClient />;
}

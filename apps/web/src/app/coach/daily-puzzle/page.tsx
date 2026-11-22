import { DailyPuzzleCoachClient } from "@/features/daily-puzzle/components/DailyPuzzleCoachClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/coach/daily-puzzle")
};

export default function CoachDailyPuzzlePage() {
  return <DailyPuzzleCoachClient />;
}

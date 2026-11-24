import { DailyPuzzleAdminClient } from "@/features/daily-puzzle/components/DailyPuzzleAdminClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/admin/daily-puzzle")
};

export default function AdminDailyPuzzlePage() {
  return <DailyPuzzleAdminClient />;
}

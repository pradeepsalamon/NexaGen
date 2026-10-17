import { PuzzleScoringDefaultsClient } from "@/features/puzzles/components/scoring/PuzzleScoringDefaultsClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/puzzles/scoring") };

export default function AdminPuzzleScoringPage() {
  return <PuzzleScoringDefaultsClient />;
}

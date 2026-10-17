import { PuzzleForm } from "@/features/puzzles/components/PuzzleForm";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/coach/puzzles/new") };

export default function CoachNewPuzzlePage() {
  return <PuzzleForm mode="create" basePath="/coach/puzzles" role="coach" />;
}

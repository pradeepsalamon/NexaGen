import { PuzzleLibraryClient } from "@/features/puzzles/components/PuzzleLibraryClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/coach/puzzles") };

export default function CoachPuzzlesPage() {
  return <PuzzleLibraryClient role="coach" basePath="/coach/puzzles" />;
}

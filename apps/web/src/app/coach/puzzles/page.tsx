import { PuzzleLibraryClient } from "@/features/puzzles/components/PuzzleLibraryClient";

export const metadata = { title: "Puzzles - Coach Workspace" };

export default function CoachPuzzlesPage() {
  return <PuzzleLibraryClient role="coach" basePath="/coach/puzzles" />;
}

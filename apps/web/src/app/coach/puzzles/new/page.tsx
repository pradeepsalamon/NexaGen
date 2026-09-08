import { PuzzleForm } from "@/features/puzzles/components/PuzzleForm";

export const metadata = { title: "New puzzle - Coach Workspace" };

export default function CoachNewPuzzlePage() {
  return <PuzzleForm mode="create" basePath="/coach/puzzles" role="coach" />;
}

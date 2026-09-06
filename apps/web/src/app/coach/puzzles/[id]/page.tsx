import { PuzzlePreviewClient } from "@/features/puzzles/components/PuzzlePreviewClient";

export const metadata = { title: "Puzzle - Coach Workspace" };

export default function CoachPuzzlePreviewPage({ params }: { params: { id: string } }) {
  return <PuzzlePreviewClient id={params.id} basePath="/coach/puzzles" />;
}

import { PuzzleEditClient } from "@/features/puzzles/components/PuzzleEditClient";

export const metadata = { title: "Edit puzzle - Coach Workspace" };

export default function CoachEditPuzzlePage({ params }: { params: { id: string } }) {
  return <PuzzleEditClient id={params.id} basePath="/coach/puzzles" role="coach" />;
}

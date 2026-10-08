import { PuzzlePreviewClient } from "@/features/puzzles/components/PuzzlePreviewClient";

export const metadata = { title: "Puzzle - Coach Workspace" };

export default async function CoachPuzzlePreviewPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <PuzzlePreviewClient id={params.id} basePath="/coach/puzzles" />;
}

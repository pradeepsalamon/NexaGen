import { PuzzleEditClient } from "@/features/puzzles/components/PuzzleEditClient";

export const metadata = { title: "Edit puzzle - Coach Workspace" };

export default async function CoachEditPuzzlePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <PuzzleEditClient id={params.id} basePath="/coach/puzzles" role="coach" />;
}

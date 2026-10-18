import { PuzzleEditClient } from "@/features/puzzles/components/PuzzleEditClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/coach/puzzles/[id]/edit") };

export default async function CoachEditPuzzlePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <PuzzleEditClient id={params.id} basePath="/coach/puzzles" role="coach" />;
}

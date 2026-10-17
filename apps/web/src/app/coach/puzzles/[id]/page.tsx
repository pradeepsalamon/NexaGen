import { PuzzlePreviewClient } from "@/features/puzzles/components/PuzzlePreviewClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/coach/puzzles/[id]") };

export default async function CoachPuzzlePreviewPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <PuzzlePreviewClient id={params.id} basePath="/coach/puzzles" />;
}

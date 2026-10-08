import { PuzzlePreviewClient } from "@/features/puzzles/components/PuzzlePreviewClient";

export const metadata = { title: "Puzzle - Admin" };

export default async function AdminPuzzlePreviewPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <PuzzlePreviewClient id={params.id} basePath="/admin/puzzles" />;
}

import { PuzzlePreviewClient } from "@/features/puzzles/components/PuzzlePreviewClient";

export const metadata = { title: "Puzzle - Admin" };

export default function AdminPuzzlePreviewPage({ params }: { params: { id: string } }) {
  return <PuzzlePreviewClient id={params.id} basePath="/admin/puzzles" />;
}

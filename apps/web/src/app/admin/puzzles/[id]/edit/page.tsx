import { PuzzleEditClient } from "@/features/puzzles/components/PuzzleEditClient";

export const metadata = { title: "Edit puzzle - Admin" };

export default function AdminEditPuzzlePage({ params }: { params: { id: string } }) {
  return <PuzzleEditClient id={params.id} basePath="/admin/puzzles" role="admin" />;
}

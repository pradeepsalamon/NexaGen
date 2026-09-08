import { PuzzleForm } from "@/features/puzzles/components/PuzzleForm";

export const metadata = { title: "New puzzle - Admin" };

export default function AdminNewPuzzlePage() {
  return <PuzzleForm mode="create" basePath="/admin/puzzles" role="admin" />;
}

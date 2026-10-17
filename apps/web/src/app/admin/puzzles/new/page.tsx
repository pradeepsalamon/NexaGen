import { PuzzleForm } from "@/features/puzzles/components/PuzzleForm";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/puzzles/new") };

export default function AdminNewPuzzlePage() {
  return <PuzzleForm mode="create" basePath="/admin/puzzles" role="admin" />;
}

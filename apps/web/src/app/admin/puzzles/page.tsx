import { PuzzleLibraryClient } from "@/features/puzzles/components/PuzzleLibraryClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/puzzles") };

export default function AdminPuzzlesPage() {
  return <PuzzleLibraryClient role="admin" basePath="/admin/puzzles" />;
}

import { PuzzleLibraryClient } from "@/features/puzzles/components/PuzzleLibraryClient";

export const metadata = { title: "Puzzle Library - Admin" };

export default function AdminPuzzlesPage() {
  return <PuzzleLibraryClient role="admin" basePath="/admin/puzzles" />;
}

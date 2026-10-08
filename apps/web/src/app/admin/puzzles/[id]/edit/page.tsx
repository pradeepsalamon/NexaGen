import { PuzzleEditClient } from "@/features/puzzles/components/PuzzleEditClient";

export const metadata = { title: "Edit puzzle - Admin" };

export default async function AdminEditPuzzlePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <PuzzleEditClient id={params.id} basePath="/admin/puzzles" role="admin" />;
}

import { PuzzleEditClient } from "@/features/puzzles/components/PuzzleEditClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/puzzles/[id]/edit") };

export default async function AdminEditPuzzlePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <PuzzleEditClient id={params.id} basePath="/admin/puzzles" role="admin" />;
}

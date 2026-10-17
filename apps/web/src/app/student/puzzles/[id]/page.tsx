import { StudentPuzzleSolveClient } from "@/features/puzzles/components/StudentPuzzleSolveClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/student/puzzles/[id]") };

export default async function StudentPuzzleSolvePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <StudentPuzzleSolveClient id={params.id} />;
}

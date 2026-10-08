import { StudentPuzzleSolveClient } from "@/features/puzzles/components/StudentPuzzleSolveClient";

export const metadata = { title: "Solve puzzle" };

export default async function StudentPuzzleSolvePage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <StudentPuzzleSolveClient id={params.id} />;
}

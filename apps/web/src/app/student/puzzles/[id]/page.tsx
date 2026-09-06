import { StudentPuzzleSolveClient } from "@/features/puzzles/components/StudentPuzzleSolveClient";

export const metadata = { title: "Solve puzzle" };

export default function StudentPuzzleSolvePage({ params }: { params: { id: string } }) {
  return <StudentPuzzleSolveClient id={params.id} />;
}

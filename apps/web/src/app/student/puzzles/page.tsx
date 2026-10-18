import { redirect } from "next/navigation";

// Puzzles are classroom material: students only get one when a coach shares it
// in class (or it is part of a course), so there is no student library.
export default function StudentPuzzlesPage() {
  redirect("/student/practice");
}

import { StudentTrainingClient } from "@/features/puzzles/components/training/StudentTrainingClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/student/training")
};

export default function StudentTrainingPage() {
  return <StudentTrainingClient />;
}

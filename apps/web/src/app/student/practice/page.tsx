import { StudentAssignmentsClient } from "@/features/assignments/components/StudentAssignmentsClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/student/practice")
};

export default function StudentPracticePage() {
  return <StudentAssignmentsClient />;
}

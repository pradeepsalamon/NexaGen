import { StudentBatchesClient } from "@/features/student-batches/components/StudentBatchesClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/student/batches")
};

export default function StudentBatchesPage() {
  return <StudentBatchesClient />;
}

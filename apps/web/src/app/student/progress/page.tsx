import { StudentProgressClient } from "@/features/progress/components/StudentProgressClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/student/progress") };

export default function StudentProgressPage() {
  return <StudentProgressClient />;
}

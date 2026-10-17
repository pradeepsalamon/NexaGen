import { StudentDashboardClient } from "@/features/student-dashboard/components/StudentDashboardClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/student") };

export default function StudentDashboardPage() {
  return <StudentDashboardClient />;
}

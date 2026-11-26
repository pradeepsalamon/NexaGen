import { StudentReportsClient } from "@/features/weekly-reports/components/StudentReportsClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/student/reports")
};

export default function StudentReportsPage() {
  return <StudentReportsClient />;
}

import { StudentClassRecapsClient } from "@/features/class-recap/components/StudentClassRecapsClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/student/class-recaps") };

export default function StudentClassRecapsPage() {
  return <StudentClassRecapsClient />;
}

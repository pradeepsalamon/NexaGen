import { StudentCoursesClient } from "@/features/courses/components/StudentCoursesClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/student/courses") };

export default function StudentCoursesPage() {
  return <StudentCoursesClient />;
}

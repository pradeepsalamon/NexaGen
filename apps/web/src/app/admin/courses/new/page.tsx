import { CourseCreateClient } from "@/features/courses/components/CourseEditClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/courses/new") };

export default function AdminNewCoursePage() {
  return <CourseCreateClient />;
}

import { AdminCoursesClient } from "@/features/courses/components/AdminCoursesClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/courses") };

export default function AdminCoursesPage() {
  return <AdminCoursesClient />;
}

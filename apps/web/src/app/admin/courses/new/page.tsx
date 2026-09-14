import { CourseCreateClient } from "@/features/courses/components/CourseEditClient";

export const metadata = { title: "New course - Admin" };

export default function AdminNewCoursePage() {
  return <CourseCreateClient />;
}

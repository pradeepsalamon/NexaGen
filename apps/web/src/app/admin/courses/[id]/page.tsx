import { CourseEditClient } from "@/features/courses/components/CourseEditClient";

export const metadata = { title: "Course - Admin" };

export default function AdminCourseEditPage({ params }: { params: { id: string } }) {
  return <CourseEditClient id={params.id} />;
}

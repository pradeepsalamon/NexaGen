import { CourseEditClient } from "@/features/courses/components/CourseEditClient";

export const metadata = { title: "Course - Admin" };

export default async function AdminCourseEditPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <CourseEditClient id={params.id} />;
}

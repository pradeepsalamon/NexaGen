import { StudentCourseDetailClient } from "@/features/courses/components/StudentCourseDetailClient";

export const metadata = { title: "Course" };

export default async function StudentCourseDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <StudentCourseDetailClient id={params.id} />;
}

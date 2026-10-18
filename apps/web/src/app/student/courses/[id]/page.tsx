import { StudentCourseDetailClient } from "@/features/courses/components/StudentCourseDetailClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/student/courses/[id]") };

export default async function StudentCourseDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <StudentCourseDetailClient id={params.id} />;
}

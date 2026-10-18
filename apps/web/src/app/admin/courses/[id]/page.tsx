import { CourseEditClient } from "@/features/courses/components/CourseEditClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = { title: pageTitle("/admin/courses/[id]") };

export default async function AdminCourseEditPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <CourseEditClient id={params.id} />;
}

import { StudentCourseDetailClient } from "@/features/courses/components/StudentCourseDetailClient";

export const metadata = { title: "Course" };

export default function StudentCourseDetailPage({ params }: { params: { id: string } }) {
  return <StudentCourseDetailClient id={params.id} />;
}

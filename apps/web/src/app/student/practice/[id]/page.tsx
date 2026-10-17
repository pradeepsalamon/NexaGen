import { StudentAssignmentDetailClient } from "@/features/assignments/components/StudentAssignmentDetailClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/student/practice/[id]")
};

export default async function StudentAssignmentPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <StudentAssignmentDetailClient id={params.id} />;
}

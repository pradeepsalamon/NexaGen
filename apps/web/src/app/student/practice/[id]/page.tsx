import { StudentAssignmentDetailClient } from "@/features/assignments/components/StudentAssignmentDetailClient";

export const metadata = {
  title: "Assignment"
};

export default async function StudentAssignmentPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  return <StudentAssignmentDetailClient id={params.id} />;
}

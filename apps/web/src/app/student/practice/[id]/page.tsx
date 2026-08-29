import { StudentAssignmentDetailClient } from "@/features/assignments/components/StudentAssignmentDetailClient";

export const metadata = {
  title: "Assignment"
};

export default function StudentAssignmentPage({ params }: { params: { id: string } }) {
  return <StudentAssignmentDetailClient id={params.id} />;
}

import { StaffStudentProgressClient } from "@/features/progress/components/StaffStudentProgressClient";

export const metadata = {
  title: "Student progress - Coach Workspace"
};

export default async function CoachStudentProgressPage(props: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await props.params;
  return <StaffStudentProgressClient backHref="/coach/students" backLabel="Students" studentId={studentId} />;
}

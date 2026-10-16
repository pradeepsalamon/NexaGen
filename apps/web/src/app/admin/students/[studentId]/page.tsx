import { StaffStudentProgressClient } from "@/features/progress/components/StaffStudentProgressClient";

export const metadata = {
  title: "Student progress - Admin | Nexa Chess"
};

export default async function AdminStudentProgressPage(props: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await props.params;
  return <StaffStudentProgressClient backHref="/admin/users" backLabel="Users" studentId={studentId} />;
}

import { StaffStudentProgressClient } from "@/features/progress/components/StaffStudentProgressClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/admin/students/[studentId]")
};

export default async function AdminStudentProgressPage(props: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await props.params;
  return <StaffStudentProgressClient backHref="/admin/users" backLabel="Users" studentId={studentId} />;
}

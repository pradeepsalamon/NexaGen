import { StaffStudentProgressClient } from "@/features/progress/components/StaffStudentProgressClient";
import { WhatsAppLinkCodeButton } from "@/features/support/components/WhatsAppLinkCodeButton";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/admin/students/[studentId]")
};

export default async function AdminStudentProgressPage(props: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await props.params;
  return (
    <StaffStudentProgressClient
      actions={<WhatsAppLinkCodeButton studentId={studentId} />}
      backHref="/admin/users"
      backLabel="Users"
      studentId={studentId}
    />
  );
}

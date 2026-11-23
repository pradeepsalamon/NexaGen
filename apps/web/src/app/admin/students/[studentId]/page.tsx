import { StaffStudentProgressClient } from "@/features/progress/components/StaffStudentProgressClient";
import { StudentPlayingProfileButton } from "@/features/progress/components/StudentPlayingProfileButton";
import { WhatsAppLinkCodeButton } from "@/features/support/components/WhatsAppLinkCodeButton";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/admin/students/[studentId]")
};

export default async function AdminStudentProgressPage(props: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await props.params;
  return (
    <StaffStudentProgressClient
      actions={
        <>
          <StudentPlayingProfileButton studentId={studentId} />
          <WhatsAppLinkCodeButton studentId={studentId} />
        </>
      }
      backHref="/admin/users"
      backLabel="Users"
      studentId={studentId}
    />
  );
}

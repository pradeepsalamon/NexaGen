import { StaffStudentProgressClient } from "@/features/progress/components/StaffStudentProgressClient";
import { StudentPlayingProfileButton } from "@/features/progress/components/StudentPlayingProfileButton";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/coach/students/[studentId]")
};

export default async function CoachStudentProgressPage(props: { params: Promise<{ studentId: string }> }) {
  const { studentId } = await props.params;
  return (
    <StaffStudentProgressClient
      actions={<StudentPlayingProfileButton studentId={studentId} />}
      backHref="/coach/students"
      backLabel="Students"
      studentId={studentId}
    />
  );
}

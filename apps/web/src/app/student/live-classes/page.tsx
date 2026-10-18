import { StudentLiveClassesClient } from "@/features/student-live-classes/components/StudentLiveClassesClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/student/live-classes")
};

export default function StudentLiveClassesPage() {
  return <StudentLiveClassesClient />;
}

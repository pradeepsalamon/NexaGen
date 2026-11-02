import { Suspense } from "react";
import { PageLoading } from "@/components/layout/PageLoading";
import { StudentScheduleClient } from "@/features/student-schedule/components/StudentScheduleClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/student/schedule")
};

export default function StudentSchedulePage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <StudentScheduleClient />
    </Suspense>
  );
}

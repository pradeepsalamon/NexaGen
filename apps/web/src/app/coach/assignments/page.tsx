import { Suspense } from "react";
import { PageLoading } from "@/components/layout/PageLoading";
import { CoachAssignmentsClient } from "@/features/assignments/components/CoachAssignmentsClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/coach/assignments")
};

export default function CoachAssignmentsPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <CoachAssignmentsClient />
    </Suspense>
  );
}

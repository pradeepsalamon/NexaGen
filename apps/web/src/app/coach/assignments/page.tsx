import { Suspense } from "react";
import { CoachAssignmentsClient } from "@/features/assignments/components/CoachAssignmentsClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/coach/assignments")
};

export default function CoachAssignmentsPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading assignments...</div>}>
      <CoachAssignmentsClient />
    </Suspense>
  );
}

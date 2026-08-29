import { Suspense } from "react";
import { CoachAssignmentsClient } from "@/features/assignments/components/CoachAssignmentsClient";

export const metadata = {
  title: "Assignments - Coach Workspace"
};

export default function CoachAssignmentsPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading assignments...</div>}>
      <CoachAssignmentsClient />
    </Suspense>
  );
}

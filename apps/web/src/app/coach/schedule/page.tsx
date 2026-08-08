import { Suspense } from "react";
import { CoachScheduleClient } from "../../../features/coach/components/CoachScheduleClient";

export const metadata = {
  title: "Schedule - Coach Workspace"
};

export default function CoachSchedulePage() {
  return (
    <Suspense fallback={<div className="p-8">Loading schedule...</div>}>
      <CoachScheduleClient />
    </Suspense>
  );
}


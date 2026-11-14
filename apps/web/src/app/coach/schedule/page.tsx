import { Suspense } from "react";
import { CoachScheduleClient } from "../../../features/coach/components/CoachScheduleClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/coach/schedule")
};

export default function CoachSchedulePage() {
  return (
    <Suspense fallback={<div className="p-8">Loading schedule...</div>}>
      <CoachScheduleClient />
    </Suspense>
  );
}


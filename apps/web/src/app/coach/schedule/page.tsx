import { Suspense } from "react";
import { PageLoading } from "@/components/layout/PageLoading";
import { CoachScheduleClient } from "../../../features/coach/components/CoachScheduleClient";
import { pageTitle } from "@/lib/pageTitles";

export const metadata = {
  title: pageTitle("/coach/schedule")
};

export default function CoachSchedulePage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <CoachScheduleClient />
    </Suspense>
  );
}


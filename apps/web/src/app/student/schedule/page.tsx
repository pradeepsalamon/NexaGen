import { Suspense } from "react";
import { StudentScheduleClient } from "@/features/student-schedule/components/StudentScheduleClient";
import { Skeleton } from "@/components/ui/Skeleton";

export const metadata = {
  title: "Class Schedule - Nexa Chess"
};

export default function StudentSchedulePage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6 animate-fade-in p-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-96 w-full rounded-app" />
        </div>
      }
    >
      <StudentScheduleClient />
    </Suspense>
  );
}

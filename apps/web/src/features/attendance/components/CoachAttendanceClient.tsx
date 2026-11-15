"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useMyTeaching } from "../hooks/useMyTeaching";
import { CoachAttendanceView } from "./CoachAttendanceView";

export function CoachAttendanceClient() {
  const { data, error, isLoading, refetch } = useMyTeaching();

  return (
    <div className="animate-fade-in pb-10">
      <PageHeader
        description="Your teaching attendance: time taught, classes completed and late starts."
        title="Attendance"
      />
      {isLoading ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton className="h-32 rounded-app" key={i} />
            ))}
          </div>
          <Skeleton className="h-80 rounded-app" />
        </div>
      ) : error || !data ? (
        <WidgetError
          message="Couldn't load your teaching attendance. Check your connection and try again."
          onRetry={() => refetch()}
        />
      ) : (
        <CoachAttendanceView data={data} />
      )}
    </div>
  );
}

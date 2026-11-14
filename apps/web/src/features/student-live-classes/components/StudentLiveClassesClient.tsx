"use client";

import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { NextClassCard } from "@/features/student-dashboard/components/NextClassCard";
import { PastClasses } from "@/features/student-dashboard/components/PastClasses";
import { UpcomingClasses } from "@/features/student-dashboard/components/UpcomingClasses";
import { useStudentDashboard } from "@/features/student-dashboard/hooks/useStudentApi";

/** The class on now (or next), the next few, and past classes with their recordings. */
export function StudentLiveClassesClient() {
  const { data, error, isLoading, refetch } = useStudentDashboard();

  const header = (
    <PageHeader
      actions={
        <Button asChild variant="neutral">
          <Link href="/student/schedule">
            <CalendarDays aria-hidden="true" className="size-4" strokeWidth={2.5} />
            Schedule
          </Link>
        </Button>
      }
      description="Join a class when your coach starts it, and rewatch past ones."
      title="Live classes"
    />
  );

  if (isLoading) {
    return (
      <div className="pb-10">
        {header}
        <div className="space-y-5">
          <Skeleton className="h-32 rounded-panel" />
          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
            <Skeleton className="h-64 rounded-app" />
            <Skeleton className="h-64 rounded-app" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pb-10">
        {header}
        <WidgetError
          message="Couldn't load your classes. Check your connection and try again."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-10">
      {header}

      <div className="space-y-5">
        <NextClassCard liveClass={data?.liveClass} nextClass={data?.todaysClass} />

        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-2">
          <UpcomingClasses classes={data?.nextClasses ?? []} />
          <PastClasses classes={data?.pastClasses ?? []} />
        </div>
      </div>
    </div>
  );
}

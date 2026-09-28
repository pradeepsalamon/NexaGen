"use client";

import { TrendingUp } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { DashboardFeedback } from "@/features/feedback/components/DashboardFeedback";
import { useAuthStore } from "@/stores/authStore";
import { useStudentDashboard } from "../hooks/useStudentApi";
import { Announcements } from "./Announcements";
import { ContinueLearning } from "./ContinueLearning";
import { NextClassCard } from "./NextClassCard";
import { PastClasses } from "./PastClasses";
import { PracticeSection } from "./PracticeSection";
import { ProgressOverview } from "./ProgressOverview";
import { UpcomingClasses } from "./UpcomingClasses";

export function StudentDashboardClient() {
  const { user } = useAuthStore();
  const { data, error, isLoading, refetch } = useStudentDashboard();

  const header = (
    <PageHeader
      actions={
        <Button asChild variant="outline">
          <Link href="/student/progress">
            <TrendingUp aria-hidden="true" className="size-4" strokeWidth={2.5} />
            My progress
          </Link>
        </Button>
      }
      description={data?.batchName || "Here's what's next on your chess journey."}
      title={user?.firstName ? `Welcome back, ${user.firstName}` : "Welcome back"}
    />
  );

  if (isLoading) {
    return (
      <div className="pb-10">
        {header}
        <div className="space-y-6">
          <Skeleton className="h-32 rounded-app" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton className="h-32 rounded-app" key={i} />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
          message="Couldn't load your dashboard. Check your connection and try again."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  const courses = data?.courses ?? [];
  const announcements = data?.announcements ?? [];
  const pastClasses = data?.pastClasses ?? [];

  return (
    <div className="animate-fade-in pb-10">
      {header}

      <div className="space-y-6">
        <DashboardFeedback />

        <NextClassCard liveClass={data?.liveClass} nextClass={data?.todaysClass} />

        <ProgressOverview metrics={data?.progressMetrics} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <UpcomingClasses classes={data?.upcomingClasses ?? []} />
          <PracticeSection practices={data?.practices ?? []} />
          {courses.length > 0 ? <ContinueLearning courses={courses} /> : null}
          {announcements.length > 0 ? <Announcements announcements={announcements} /> : null}
        </div>

        {pastClasses.length > 0 ? <PastClasses classes={pastClasses} /> : null}
      </div>
    </div>
  );
}

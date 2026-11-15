"use client";

import { TrendingUp } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { AssignmentReminderBanner } from "@/features/assignments/components/reminders/AssignmentReminderBanner";
import { AssignmentReminderPopup } from "@/features/assignments/components/reminders/AssignmentReminderPopup";
import { DashboardFeedback } from "@/features/feedback/components/DashboardFeedback";
import { RevisionDashboardCard } from "@/features/revision/components/RevisionDashboardCard";
import { cn } from "@/lib/utils";
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

  const firstName = user?.firstName?.trim();

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
      description={
        data?.batchName ||
        "Keep learning, keep improving. Chess is a journey, and you're on the right track!"
      }
      title={firstName ? `Welcome back, ${firstName}!` : "Welcome back!"}
    />
  );

  if (isLoading) {
    return (
      <div className="pb-10">
        {header}
        <div className="space-y-5">
          <Skeleton className="h-32 rounded-panel" />
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton className="h-32 rounded-app" key={i} />
            ))}
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Skeleton className="h-80 rounded-app" />
            <Skeleton className="h-80 rounded-app" />
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
  const hasPastClasses = pastClasses.length > 0;

  return (
    <div className="animate-fade-in pb-10">
      {header}

      <div className="space-y-5">
        <AssignmentReminderPopup />
        <AssignmentReminderBanner />

        <DashboardFeedback />

        <NextClassCard liveClass={data?.liveClass} nextClass={data?.todaysClass} />

        <ProgressOverview
          chessRating={data?.chessRating}
          metrics={data?.progressMetrics}
        />

        {/* Three blocks so a phone reads: what's next, then today's revision
            and announcements, then history. From `lg` the side rail spans both
            rows, and the `1fr` row keeps the left column packed when the rail
            is the taller one. */}
        <div
          className={cn(
            "grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]",
            hasPastClasses && "lg:grid-rows-[auto_1fr]"
          )}
        >
          <div className="min-w-0 space-y-5">
            <UpcomingClasses classes={data?.nextClasses ?? []} />
            <PracticeSection practices={data?.practices ?? []} />
          </div>

          <div className={cn("min-w-0 space-y-5", hasPastClasses && "lg:row-span-2")}>
            <RevisionDashboardCard />
            {courses.length > 0 ? <ContinueLearning courses={courses} /> : null}
            {announcements.length > 0 ? (
              <Announcements announcements={announcements} />
            ) : null}
          </div>

          {hasPastClasses ? (
            <div className="min-w-0 lg:col-start-1 lg:row-start-2">
              <PastClasses classes={pastClasses} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

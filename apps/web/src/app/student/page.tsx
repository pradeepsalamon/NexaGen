"use client";

import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Announcements } from "@/features/student-dashboard/components/Announcements";
import { ContinueLearning } from "@/features/student-dashboard/components/ContinueLearning";
import { PastClasses } from "@/features/student-dashboard/components/PastClasses";
import { PracticeSection } from "@/features/student-dashboard/components/PracticeSection";
import { ProgressOverview } from "@/features/student-dashboard/components/ProgressOverview";
import { RecentActivity } from "@/features/student-dashboard/components/RecentActivity";
import { TodaysClass } from "@/features/student-dashboard/components/TodaysClass";
import { UpcomingClasses } from "@/features/student-dashboard/components/UpcomingClasses";
import { WelcomeCard } from "@/features/student-dashboard/components/WelcomeCard";
import { DashboardFeedback } from "@/features/feedback/components/DashboardFeedback";
import { useStudentDashboard } from "@/features/student-dashboard/hooks/useStudentApi";
import { useAuthStore } from "@/stores/authStore";

/** Rows fade in one after another so the page assembles rather than snapping in. */
function Row({ children, delay }: { children: ReactNode; delay: number }) {
  return (
    <div className="animate-slide-up" style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

export default function StudentDashboardPage() {
  const { user } = useAuthStore();
  const { data, error, isLoading, refetch } = useStudentDashboard();

  if (isLoading) {
    return (
      <div className="space-y-6 pb-10">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Skeleton className="h-60 rounded-panel lg:col-span-2" />
          <Skeleton className="h-60 rounded-panel" />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton className="h-44 rounded-app" key={i} />
          ))}
        </div>
        <Skeleton className="h-64 rounded-panel" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Skeleton className="h-72 rounded-panel" />
          <Skeleton className="h-72 rounded-panel" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pb-10">
        <div className="flex flex-col items-center justify-center rounded-panel border border-app-danger/30 bg-app-danger/5 px-6 py-16 text-center">
          <span className="mb-4 flex size-16 items-center justify-center rounded-full bg-app-danger/[0.12]">
            <AlertTriangle
              aria-hidden="true"
              className="size-7 text-app-danger-ink"
              strokeWidth={2.5}
            />
          </span>
          <h1 className="text-lg font-extrabold text-app-text">
            Couldn&apos;t load your dashboard
          </h1>
          <p className="mt-1 max-w-sm text-sm text-app-muted">
            Something went wrong while fetching your classes and progress.
          </p>
          <Button className="mt-6" onClick={() => refetch()} variant="outline">
            Try again
          </Button>
        </div>
      </div>
    );
  }

  const todaysClass = data?.todaysClass;

  return (
    <div className="space-y-6 pb-10">
      <DashboardFeedback />

      <Row delay={0}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <WelcomeCard
              studentName={user?.firstName || "Student"}
              courseName={data?.courses?.[0]?.title || "Explore Courses"}
              batchName={data?.batchName || "Your Batch"}
              memberSince="Recently"
              liveClass={data?.liveClass}
            />
          </div>
          <TodaysClass
            id={todaysClass?.id}
            topic={todaysClass?.topic}
            coachName={todaysClass?.coachName}
            startsAt={todaysClass?.startsAt}
            durationMinutes={todaysClass?.durationMinutes}
            status={todaysClass?.status}
          />
        </div>
      </Row>

      <Row delay={70}>
        <ProgressOverview metrics={data?.progressMetrics} />
      </Row>

      <Row delay={140}>
        <UpcomingClasses classes={data?.upcomingClasses || []} />
      </Row>

      <Row delay={210}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ContinueLearning courses={data?.courses || []} />
          <PracticeSection practices={data?.practices || []} />
        </div>
      </Row>

      <Row delay={280}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <RecentActivity activities={data?.activities || []} />
          <Announcements announcements={data?.announcements || []} />
        </div>
      </Row>

      <Row delay={350}>
        <PastClasses classes={data?.pastClasses || []} />
      </Row>
    </div>
  );
}

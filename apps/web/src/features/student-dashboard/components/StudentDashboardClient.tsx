"use client";

import { TrendingUp, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { AssignmentReminderBanner } from "@/features/assignments/components/reminders/AssignmentReminderBanner";
import { AssignmentReminderPopup } from "@/features/assignments/components/reminders/AssignmentReminderPopup";
import { DashboardFeedback } from "@/features/feedback/components/DashboardFeedback";
import { RevisionDashboardCard } from "@/features/revision/components/RevisionDashboardCard";
import { useAuthStore } from "@/stores/authStore";
import { useTheme } from "@/providers/ThemeProvider";
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
  const { mode, isHydrated } = useTheme();
  const isDark = isHydrated && mode === "dark";
  const { data, error, isLoading, refetch } = useStudentDashboard();

  const displayName = user?.firstName || "Test";

  const header = (
    <div className="mb-5 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5">
      <div>
        <h1
          className={`font-display text-2xl sm:text-3xl font-bold tracking-tight ${isDark ? "text-white" : "text-[#071B41]"
            }`}
        >
          Welcome back, {displayName}!
        </h1>
        <p
          className={`mt-1 text-xs sm:text-sm ${isDark ? "text-[#94A3B8]" : "text-[#64748B]"
            }`}
        >
          {data?.batchName ||
            "Keep learning, keep improving. Chess is a journey, and you're on the right track!"}
        </p>
      </div>

      <Link
        href="/student/progress"
        className="
          inline-flex items-center justify-center gap-2
          h-10 px-5 rounded-full shrink-0
          bg-gradient-to-r from-[#E6B960] via-[#DCA642] to-[#CC922C]
          hover:from-[#EDC36E] hover:to-[#D89B32]
          text-[#071B41] text-xs sm:text-sm font-bold
          shadow-[0_4px_14px_rgba(212,155,53,0.3)]
          transition-all duration-200 hover:-translate-y-0.5
        "
      >
        <TrendingUp aria-hidden="true" className="size-4 stroke-[2.4]" />
        <span>My Progress</span>
        <ArrowRight aria-hidden="true" className="size-3.5 stroke-[2.4]" />
      </Link>
    </div>
  );

  if (isLoading) {
    return (
      <div className="pb-10">
        {header}
        <div className="space-y-5">
          <Skeleton className="h-24 rounded-2xl" />
          <div className="grid grid-cols-3 gap-3 sm:gap-4">
            {[0, 1, 2].map((i) => (
              <Skeleton className="h-28 sm:h-32 rounded-2xl" key={i} />
            ))}
          </div>
          <Skeleton className="h-48 rounded-2xl" />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Skeleton className="h-56 rounded-2xl" />
            <Skeleton className="h-56 rounded-2xl" />
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

      <div className="space-y-5">
        <AssignmentReminderPopup />
        <AssignmentReminderBanner />

        <DashboardFeedback />

        <NextClassCard liveClass={data?.liveClass} nextClass={data?.todaysClass} />

        <ProgressOverview metrics={data?.progressMetrics} />

        <RevisionDashboardCard />

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <UpcomingClasses classes={data?.nextClasses ?? []} />
          <PracticeSection practices={data?.practices ?? []} />
          {courses.length > 0 ? <ContinueLearning courses={courses} /> : null}
          {announcements.length > 0 ? (
            <Announcements announcements={announcements} />
          ) : null}
        </div>

        {pastClasses.length > 0 ? <PastClasses classes={pastClasses} /> : null}
      </div>
    </div>
  );
}
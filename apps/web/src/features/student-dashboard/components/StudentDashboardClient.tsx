"use client";

import { CalendarDays, ClipboardList, Puzzle, TrendingUp, Video } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { HeroBanner } from "@/components/ui/HeroBanner";
import { type QuickAction, QuickActionGrid } from "@/components/ui/QuickActionGrid";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { AssignmentReminderBanner } from "@/features/assignments/components/reminders/AssignmentReminderBanner";
import { AssignmentReminderPopup } from "@/features/assignments/components/reminders/AssignmentReminderPopup";
import { DashboardFeedback } from "@/features/feedback/components/DashboardFeedback";
import { RevisionDashboardCard } from "@/features/revision/components/RevisionDashboardCard";
import { useAuthStore } from "@/stores/authStore";
import { useStudentDashboard } from "../hooks/useStudentApi";
import { Announcements } from "./Announcements";
import { ContinueLearning } from "./ContinueLearning";
import { NextClassCard } from "./NextClassCard";
import { PastClasses } from "./PastClasses";
import { PracticeSection } from "./PracticeSection";
import { ProgressOverview } from "./ProgressOverview";
import { UpcomingClasses } from "./UpcomingClasses";

const QUICK_ACTIONS: QuickAction[] = [
  { description: "Classes this week", href: "/student/schedule", icon: CalendarDays, label: "Schedule", tone: "primary" },
  { description: "Join when it starts", href: "/student/live-classes", icon: Video, label: "Live classes", tone: "primary" },
  { description: "Homework from your coach", href: "/student/practice", icon: ClipboardList, label: "Assignments", tone: "secondary" },
  { description: "Sharpen your tactics", href: "/student/training", icon: Puzzle, label: "Puzzle training", tone: "warm" }
];

export function StudentDashboardClient() {
  const { user } = useAuthStore();
  const { data, error, isLoading, refetch } = useStudentDashboard();

  const firstName = user?.firstName?.trim();

  const header = (
    <HeroBanner
      actions={
        <Button asChild variant="primary">
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
      eyebrow="Student dashboard"
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

        <QuickActionGrid actions={QUICK_ACTIONS} />

        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="space-y-5">
            <UpcomingClasses classes={data?.nextClasses ?? []} />
            <PracticeSection practices={data?.practices ?? []} />
            {pastClasses.length > 0 ? <PastClasses classes={pastClasses} /> : null}
          </div>

          <div className="space-y-5">
            <RevisionDashboardCard />
            {courses.length > 0 ? <ContinueLearning courses={courses} /> : null}
            {announcements.length > 0 ? (
              <Announcements announcements={announcements} />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

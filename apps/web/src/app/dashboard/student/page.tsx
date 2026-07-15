"use client";

import { WelcomeCard } from "@/features/student-dashboard/components/WelcomeCard";
import { TodaysClass } from "@/features/student-dashboard/components/TodaysClass";
import { ProgressOverview } from "@/features/student-dashboard/components/ProgressOverview";
import { UpcomingClasses } from "@/features/student-dashboard/components/UpcomingClasses";
import { ContinueLearning } from "@/features/student-dashboard/components/ContinueLearning";
import { PracticeSection } from "@/features/student-dashboard/components/PracticeSection";
import { RecentActivity } from "@/features/student-dashboard/components/RecentActivity";
import { Announcements } from "@/features/student-dashboard/components/Announcements";
import { PageHeader } from "@/components/layout/PageHeader";
import { useAuthStore } from "@/stores/authStore";
import { useStudentDashboard } from "@/features/student-dashboard/hooks/useStudentApi";
import { Skeleton } from "@/components/ui/Skeleton";

export default function StudentDashboardPage() {
  const { user } = useAuthStore();
  const { data, isLoading, error } = useStudentDashboard();

  if (isLoading) {
    return (
      <div className="space-y-6 md:space-y-8 animate-pulse pb-10">
        <PageHeader title="Student Dashboard" description="Loading your dashboard..." />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="h-64 lg:col-span-2 rounded-xl" />
          <Skeleton className="h-64 lg:col-span-1 rounded-xl" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-10 text-center">
        <p className="text-red-500 font-bold">Failed to load dashboard data. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-500 pb-10">
      <PageHeader 
        title="Student Dashboard" 
        description="Track your progress and continue learning." 
      />

      {/* Row 1: Welcome & Today's Class */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <WelcomeCard 
            studentName={user?.firstName || "Student"}
            courseName={data?.courses?.[0]?.title || "Explore Courses"}
            batchName="Your Batch"
            memberSince="Recently"
            liveClassId={data?.todaysClass?.status === "IN_PROGRESS" ? data.todaysClass.id : undefined}
          />
        </div>
        <div className="lg:col-span-1">
          <TodaysClass 
            id={data?.todaysClass?.id}
            topic={data?.todaysClass?.topic}
            coachName={data?.todaysClass?.coachName}
            time={data?.todaysClass?.time}
            duration={data?.todaysClass?.duration}
            status={data?.todaysClass?.status as any}
          />
        </div>
      </div>

      {/* Row 2: Progress */}
      <ProgressOverview metrics={data?.progressMetrics} />

      {/* Row 3: Upcoming Classes */}
      <div>
        <UpcomingClasses classes={data?.upcomingClasses || []} />
      </div>

      {/* Row 4: Continue Learning & Practice */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ContinueLearning courses={data?.courses || []} />
        <PracticeSection practices={data?.practices || []} />
      </div>

      {/* Row 5: Activity & Announcements */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentActivity activities={data?.activities || []} />
        <Announcements announcements={data?.announcements || []} />
      </div>
    </div>
  );
}

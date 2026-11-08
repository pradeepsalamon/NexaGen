"use client";

import { ArrowRight, Calendar, CalendarDays, CheckCircle2, ClipboardList, Clock, Layers, Puzzle, UserCheck, Users } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ClassRowList } from "@/components/ui/ClassRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { HeroBanner, type HeroStat } from "@/components/ui/HeroBanner";
import { type QuickAction, QuickActionGrid } from "@/components/ui/QuickActionGrid";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useCoachClassCancel } from "@/features/approvals/hooks/useCoachClassCancel";
import { CoachEarningsSummaryCard } from "@/features/payroll/components/CoachEarningsSummaryCard";
import { useAuthStore } from "@/stores/authStore";
import { useCoachDashboard, useTodayClasses } from "../hooks/useCoachApi";
import { CoachClassRow } from "./CoachClassRow";
import { LatestUpcomingClasses } from "./upcoming/LatestUpcomingClasses";

export function CoachDashboardClient() {
  const { user } = useAuthStore();
  const { data: dashboardData, isLoading: dashboardLoading } = useCoachDashboard();
  const today = useTodayClasses();

  // V10: direct only more than 24 h ahead; otherwise an admin request.
  const { cancel: handleCancelClass, dialog: cancelRequestDialog } = useCoachClassCancel();

  const firstName = user?.firstName?.trim();
  const todayClasses = today.data?.classes ?? [];

  const count = (value: number | undefined) => (dashboardLoading ? undefined : value ?? 0);
  // Real figures from the dashboard endpoint; each opens the page behind it.
  const stats: HeroStat[] = [
    { href: "/coach/schedule", icon: Calendar, label: "Today's classes", value: count(dashboardData?.todayClasses) },
    { href: "/coach/schedule", icon: Clock, label: "Upcoming classes", value: count(dashboardData?.upcomingClasses) },
    { href: "/coach/history", icon: CheckCircle2, label: "Completed classes", value: count(dashboardData?.completedClasses) },
    { href: "/coach/batches", icon: Layers, label: "Assigned batches", value: count(dashboardData?.batchCount) },
    { href: "/coach/students", icon: Users, label: "Active students", value: count(dashboardData?.studentCount) }
  ];

  const quickActions: QuickAction[] = [
    { description: "Rosters and timetables", href: "/coach/batches", icon: Layers, label: "My batches", tone: "primary" },
    { description: "Set and review homework", href: "/coach/assignments", icon: ClipboardList, label: "Assignments", tone: "secondary" },
    { description: "Find positions to teach", href: "/coach/puzzles", icon: Puzzle, label: "Puzzle library", tone: "warm" },
    { description: "Mark and review", href: "/coach/attendance", icon: UserCheck, label: "Attendance", tone: "accent" }
  ];

  return (
    <div className="animate-fade-in pb-10">
      <HeroBanner
        actions={
          <Button asChild variant="primary">
            <Link href="/coach/schedule">
              <CalendarDays aria-hidden="true" className="size-4" strokeWidth={2.5} />
              View schedule
            </Link>
          </Button>
        }
        description="Your classes, batches and students at a glance."
        eyebrow="Coach dashboard"
        stats={stats}
        title={firstName ? `Welcome back, ${firstName}!` : "Welcome back!"}
      />

      <div className="space-y-5">
        <QuickActionGrid actions={quickActions} />

        <SectionCard
          actions={
            <Button asChild className="-mr-3" size="sm" variant="ghost">
              <Link href="/coach/schedule">
                View all
                <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
              </Link>
            </Button>
          }
          description="Start a class from here once its start window opens."
          icon={Calendar}
          title="Today's schedule"
        >
          {today.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-14 rounded-app" />
              <Skeleton className="h-14 rounded-app" />
            </div>
          ) : today.isError ? (
            <WidgetError
              message="Couldn't load today's classes. Check your connection and try again."
              onRetry={() => today.refetch()}
            />
          ) : todayClasses.length === 0 ? (
            <EmptyState illustration="schedule" title="No classes today" variant="inline" />
          ) : (
            <ClassRowList>
              {todayClasses.map((cls) => (
                <CoachClassRow cls={cls} key={cls.id} onCancel={handleCancelClass} showDate={false} />
              ))}
            </ClassRowList>
          )}
        </SectionCard>

        <LatestUpcomingClasses />

        <CoachEarningsSummaryCard />
      </div>
      {cancelRequestDialog}
    </div>
  );
}

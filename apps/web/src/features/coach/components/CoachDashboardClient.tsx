"use client";

import { ArrowRight, Calendar, CalendarDays, CheckCircle2, Clock, Layers, type LucideIcon, Users } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { ClassRowList } from "@/components/ui/ClassRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatTile } from "@/components/ui/StatTile";
import { WidgetError } from "@/components/ui/WidgetError";
import { useCoachClassCancel } from "@/features/approvals/hooks/useCoachClassCancel";
import { CoachEarningsSummaryCard } from "@/features/payroll/components/CoachEarningsSummaryCard";
import type { Tone } from "@/lib/tone";
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

  // Classes are blue (scheduling), finished ones green (done); people stay neutral blue too.
  const summaryCards: { href: string; icon: LucideIcon; label: string; tone: Tone; value: number }[] = [
    { href: "/coach/schedule", icon: Calendar, label: "Today's classes", tone: "primary", value: dashboardData?.todayClasses || 0 },
    { href: "/coach/schedule", icon: Clock, label: "Upcoming classes", tone: "primary", value: dashboardData?.upcomingClasses || 0 },
    { href: "/coach/history", icon: CheckCircle2, label: "Completed classes", tone: "accent", value: dashboardData?.completedClasses || 0 },
    { href: "/coach/batches", icon: Layers, label: "Assigned batches", tone: "primary", value: dashboardData?.batchCount || 0 },
    { href: "/coach/students", icon: Users, label: "Active students", tone: "primary", value: dashboardData?.studentCount || 0 }
  ];

  return (
    <div className="animate-fade-in pb-10">
      <PageHeader
        actions={
          <Button asChild variant="outline">
            <Link href="/coach/schedule">
              <CalendarDays aria-hidden="true" className="size-4" strokeWidth={2.5} />
              View schedule
            </Link>
          </Button>
        }
        description="Your classes, batches and students at a glance."
        title={firstName ? `Welcome back, ${firstName}!` : "Welcome back!"}
      />

      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5 [&>*:last-child]:col-span-2 lg:[&>*:last-child]:col-span-1">
          {dashboardLoading
            ? Array.from({ length: 5 }).map((_, i) => <Skeleton className="h-32 rounded-app" key={i} />)
            : summaryCards.map((card) => (
                <Link
                  className="block rounded-app transition-transform focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus motion-safe:hover:-translate-y-0.5"
                  href={card.href}
                  key={card.label}
                >
                  <StatTile icon={card.icon} label={card.label} tone={card.tone} value={String(card.value)} />
                </Link>
              ))}
        </div>

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
            <EmptyState icon={Calendar} title="No classes today" variant="inline" />
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

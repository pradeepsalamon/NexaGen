"use client";

import { ArrowRight, Calendar, CheckCircle2, Clock, Layers, type LucideIcon, Users } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatTile } from "@/components/ui/StatTile";
import { EmptyState } from "@/components/ui/EmptyState";
import { useCoachDashboard, useTodayClasses } from "../hooks/useCoachApi";
import { cancelClass } from "../api/coachApi";
import { CoachEarningsSummaryCard } from "@/features/payroll/components/CoachEarningsSummaryCard";
import { ClassCard } from "./ClassCard";
import { LatestUpcomingClasses } from "./upcoming/LatestUpcomingClasses";
import type { CoachClass } from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import type { Tone } from "@/lib/tone";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { useRouter } from "next/navigation";

export function CoachDashboardClient() {
  const router = useRouter();
  const { data: dashboardData, isLoading: dashboardLoading } = useCoachDashboard();
  const { data: todayData, isLoading: todayLoading } = useTodayClasses();

  const { run: handleCancelClass } = useUndoableMutation({
    strategy: "defer",
    mutationFn: (classItem: CoachClass) => cancelClass(classItem.id),
    undo: async () => {},
    toast: (classItem) => ({ title: `Cancelling class for ${classItem.batchName}` }),
    invalidates: [
      queryKeys.coach.dashboard,
      queryKeys.coach.classes,
      queryKeys.coach.upcomingClasses,
      queryKeys.coach.classHistory
    ]
  });

  const summaryCards: { href: string; icon: LucideIcon; label: string; tone: Tone; value: number }[] = [
    { href: "/coach/batches", icon: Layers, label: "Assigned batches", tone: "primary", value: dashboardData?.batchCount || 0 },
    { href: "/coach/students", icon: Users, label: "Active students", tone: "accent", value: dashboardData?.studentCount || 0 },
    { href: "/coach/schedule", icon: Calendar, label: "Today's classes", tone: "secondary", value: dashboardData?.todayClasses || 0 },
    { href: "/coach/schedule", icon: Clock, label: "Upcoming classes", tone: "primary", value: dashboardData?.upcomingClasses || 0 },
    { href: "/coach/history", icon: CheckCircle2, label: "Completed classes", tone: "warm", value: dashboardData?.completedClasses || 0 }
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">Dashboard</h1>
          <p className="text-app-muted mt-1">Overview of your classes, batches, and students.</p>
        </div>
        <Button asChild>
          <Link href="/coach/schedule">View schedule</Link>
        </Button>
      </div>


      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {dashboardLoading
          ? Array.from({ length: 5 }).map((_, i) => <Skeleton className="h-36 rounded-[20px]" key={i} />)
          : summaryCards.map((card) => (
            <Link
              className="block rounded-[20px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
              href={card.href}
              key={card.label}
            >
              <StatTile icon={card.icon} label={card.label} tone={card.tone} value={String(card.value)} />
            </Link>
          ))}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-app-text">Today&apos;s schedule</h2>
          <Button variant="ghost" asChild>
            <Link className="text-primary-ink" href="/coach/schedule">
            View all
            <ArrowRight className="ml-1 size-4" strokeWidth={2.5} aria-hidden="true" />
          </Link>
          </Button>
        </div>

        {todayLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="p-4 h-48">
                <Skeleton className="h-full w-full" />
              </Card>
            ))}
          </div>
        ) : todayData?.classes && todayData.classes.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {todayData.classes.map((cls) => (
              <ClassCard
                key={cls.id}
                classItem={cls}
                onCancel={handleCancelClass}
              />
            ))}
          </div>
        ) : (
          <Card>
            <EmptyState variant="inline"
              icon={Calendar}
              title="No classes today"
              description="You have no classes scheduled for today."
              action={{
                label: "View schedule",
                onClick: () => router.push("/coach/schedule")
              }}
            />
          </Card>
        )}
      </div>

      <LatestUpcomingClasses />

      <CoachEarningsSummaryCard />
    </div>
  );
}

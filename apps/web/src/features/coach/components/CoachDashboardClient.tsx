"use client";

import { Calendar, CheckCircle2, Clock, Users, BookOpen, Layers } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useCoachDashboard, useTodayClasses } from "../hooks/useCoachApi";
import { cancelClass } from "../api/coachApi";
import { ClassCard } from "./ClassCard";
import type { CoachClass } from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
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

  const summaryCards = [
    {
      label: "Assigned Batches",
      value: dashboardData?.batchCount || 0,
      icon: Layers,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      href: "/coach/batches"
    },
    {
      label: "Active Students",
      value: dashboardData?.studentCount || 0,
      icon: Users,
      color: "text-green-500",
      bg: "bg-green-500/10",
      href: "/coach/students"
    },
    {
      label: "Today's Classes",
      value: dashboardData?.todayClasses || 0,
      icon: Calendar,
      color: "text-purple-500",
      bg: "bg-purple-500/10",
      href: "/coach/schedule"
    },
    {
      label: "Upcoming Classes",
      value: dashboardData?.upcomingClasses || 0,
      icon: Clock,
      color: "text-orange-500",
      bg: "bg-orange-500/10",
      href: "/coach/schedule"
    },
    {
      label: "Completed Classes",
      value: dashboardData?.completedClasses || 0,
      icon: CheckCircle2,
      color: "text-teal-500",
      bg: "bg-teal-500/10",
      href: "/coach/history"
    },
    {
      label: "Pending Reviews",
      value: "0", // Placeholder for future feature
      icon: BookOpen,
      color: "text-pink-500",
      bg: "bg-pink-500/10",
      href: "#"
    }
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-app-text tracking-tight">Coach Dashboard</h1>
          <p className="text-app-muted mt-1">Overview of your classes, batches, and students.</p>
        </div>
        <Button asChild>
          <Link href="/coach/schedule?openModal=true">Schedule Class</Link>
        </Button>
      </div>


      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {dashboardLoading
          ? Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-6">
              <div className="flex items-center gap-4">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-6 w-12" />
                </div>
              </div>
            </Card>
          ))
          : summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <Link key={card.label} href={card.href} className="block group">
                <Card className="p-6 transition-all hover:border-primary/50 hover:shadow-md">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-xl ${card.bg}`}>
                      <Icon className={`h-6 w-6 ${card.color}`} strokeWidth={2.5} />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-app-muted group-hover:text-app-text transition-colors">
                        {card.label}
                      </p>
                      <h3 className="text-2xl font-extrabold text-app-text mt-1">
                        {card.value}
                      </h3>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-app-text">Today&apos;s Schedule</h2>
          <Button variant="ghost" asChild>
            <Link href="/coach/schedule">View All</Link>
          </Button>
        </div>

        {todayLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="p-4 h-48">
                <Skeleton className="h-full w-full" />
              </Card>
            ))}
          </div>
        ) : todayData?.classes && todayData.classes.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {todayData.classes.map((cls) => (
              <ClassCard
                key={cls.id}
                classItem={cls}
                onCancel={handleCancelClass}
              />
            ))}
          </div>
        ) : (
          <Card className="p-6 sm:p-12">
            <EmptyState
              icon={Calendar}
              title="No classes today"
              description="You have no classes scheduled for today. Enjoy your day or schedule a new class."
              action={{
                label: "Schedule Class",
                onClick: () => router.push("/coach/schedule?openModal=true")
              }}

            />
          </Card>
        )}
      </div>
    </div>
  );
}

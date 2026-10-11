"use client";

import Link from "next/link";
import { CalendarPlus, CalendarRange } from "lucide-react";
import type { BatchScheduleStatus } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useBatchSchedulesQuery } from "../hooks/useBatchScheduleApi";

const STATUS_VARIANT: Record<BatchScheduleStatus, "success" | "warning" | "secondary"> = {
  ACTIVE: "success",
  PAUSED: "warning",
  ENDED: "secondary"
};

export function ScheduleListClient() {
  const { data, isLoading } = useBatchSchedulesQuery();
  const schedules = data?.schedules ?? [];

  return (
    <main className="min-h-[calc(100dvh-64px)] bg-app-background px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase text-primary-ink">Class Scheduler</p>
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight mt-2 text-app-text">Batch class plans</h1>
          </div>
          <Button asChild>
            <Link href="/admin/schedule/new">
              <CalendarPlus className="size-4" aria-hidden="true" />
              New schedule
            </Link>
          </Button>
        </header>

        {isLoading ? (
          <div className="grid gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : schedules.length === 0 ? (
          <Card className="p-10">
            <EmptyState
              icon={CalendarRange}
              title="No schedules yet"
              description="Create a recurring weekly schedule to auto-generate a batch's classes."
            />
          </Card>
        ) : (
          <div className="grid gap-3">
            {schedules.map((s) => (
              <Link key={s.id} href={`/admin/schedule/${s.id}`}>
                <Card className="grid gap-2 p-4 transition hover:border-primary">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-extrabold text-app-text">
                        {s.batchName} — {s.title}
                      </p>
                      <p className="text-xs text-app-muted">
                        {s.startDate} → {s.endDate} · {s.timezone}
                      </p>
                    </div>
                    <Badge variant={STATUS_VARIANT[s.status]}>{s.status}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-app-muted">
                    <span>
                      <strong className="text-app-text">{s.totalClasses}</strong> total
                    </span>
                    <span>
                      <strong className="text-app-text">{s.upcomingClasses}</strong> upcoming
                    </span>
                    <span>
                      <strong className="text-app-text">{s.completedClasses}</strong> completed
                    </span>
                    <span>
                      <strong className="text-app-text">{s.cancelledClasses}</strong> cancelled
                    </span>
                    <span>
                      {s.ruleCount} weekly slot{s.ruleCount === 1 ? "" : "s"}
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

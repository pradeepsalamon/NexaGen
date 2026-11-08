"use client";

import Link from "next/link";
import { CalendarPlus, CalendarRange, ChevronRight } from "lucide-react";
import type { BatchScheduleStatus } from "@nexa-chess/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { formatFullDate } from "@/lib/datetime";
import { useBatchSchedulesQuery } from "../hooks/useBatchScheduleApi";
import { enumLabel } from "@/lib/utils";

const STATUS_VARIANT: Record<BatchScheduleStatus, "success" | "warning" | "secondary"> = {
  ACTIVE: "success",
  PAUSED: "warning",
  ENDED: "secondary"
};

export function ScheduleListClient() {
  const { data, error, isLoading, refetch } = useBatchSchedulesQuery();
  const schedules = data?.schedules ?? [];

  return (
    <div className="animate-fade-in pb-10">
      <PageHeader
        actions={
          <Button asChild>
            <Link href="/admin/schedule/new">
              <CalendarPlus aria-hidden="true" className="size-4" strokeWidth={2.5} />
              New schedule
            </Link>
          </Button>
        }
        description="Recurring weekly schedules that generate each batch's classes."
        title="Class scheduler"
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton className="h-20 rounded-app" key={i} />
          ))}
        </div>
      ) : error ? (
        <WidgetError
          message="Couldn't load the schedules. Check your connection and try again."
          onRetry={() => refetch()}
        />
      ) : schedules.length === 0 ? (
        <EmptyState
          description="Create a recurring weekly schedule to auto-generate a batch's classes."
          illustration="schedule"
          title="No schedules yet"
        />
      ) : (
        <ul className="divide-y divide-app-border overflow-hidden rounded-app border border-app-border bg-app-surface shadow-card">
          {schedules.map((s) => (
            <li key={s.id}>
              <Link
                className="flex flex-wrap items-start gap-3 p-4 transition-colors hover:bg-app-soft focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-app-focus"
                href={`/admin/schedule/${s.id}`}
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-control bg-app-soft text-app-muted">
                  <CalendarRange aria-hidden="true" className="size-5" strokeWidth={2.25} />
                </span>
                <div className="min-w-0 flex-1 basis-56">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="min-w-0 break-words text-sm font-semibold text-app-text">
                      {s.batchName} — {s.title}
                    </span>
                    <Badge variant={STATUS_VARIANT[s.status]}>{enumLabel(s.status)}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-app-muted">
                    {/* Schedule dates are calendar days, so they format in UTC. */}
                    {formatFullDate(s.startDate, "UTC")} – {formatFullDate(s.endDate, "UTC")} · {s.timezone} ·{" "}
                    {s.ruleCount} weekly slot{s.ruleCount === 1 ? "" : "s"}
                  </p>
                  <p className="mt-1 text-xs text-app-muted">
                    <span className="font-semibold tabular-nums text-app-text">{s.totalClasses}</span> total ·{" "}
                    <span className="font-semibold tabular-nums text-app-text">{s.upcomingClasses}</span> upcoming ·{" "}
                    <span className="font-semibold tabular-nums text-app-text">{s.completedClasses}</span> completed ·{" "}
                    <span className="font-semibold tabular-nums text-app-text">{s.cancelledClasses}</span> cancelled
                  </p>
                </div>
                <ChevronRight aria-hidden="true" className="mt-3 size-4 shrink-0 text-app-muted" strokeWidth={2.5} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

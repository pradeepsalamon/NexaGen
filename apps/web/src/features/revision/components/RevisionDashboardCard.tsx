"use client";

import {
  Brain,
  Clock,
  Flame,
  CalendarClock,
  AlertCircle,
  Sparkles,
  CheckCircle2
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatNextDue } from "../lib/revisionFormat";
import { useRevisionSummary } from "../hooks/useRevisionApi";

export function RevisionDashboardCard() {
  const tz = useUserTimeZone();
  const { data, error, isLoading, refetch } = useRevisionSummary();

  if (isLoading) return <Skeleton className="h-48 w-full rounded-app" />;
  if (error || !data) {
    return (
      <WidgetError
        message="Couldn't load your revision."
        onRetry={() => void refetch()}
      />
    );
  }

  const s = data.summary;
  const counts = [
    {
      label: "Due today",
      value: s.dueToday,
      Icon: CalendarClock,
      iconClass: "bg-warning-soft text-warning-ink"
    },
    {
      label: "Overdue",
      value: s.overdue,
      Icon: AlertCircle,
      iconClass: "bg-app-danger-soft text-app-danger-ink"
    },
    {
      label: "New",
      value: s.newAvailable,
      Icon: Sparkles,
      iconClass: "bg-info-soft text-info-ink"
    },
    {
      label: "Done today",
      value: s.completedToday,
      Icon: CheckCircle2,
      iconClass: "bg-success-soft text-success-ink"
    }
  ];

  return (
    <SectionCard
      actions={
        s.activeItems > 0 ? (
          <Button asChild className="-mr-3" size="sm" variant="ghost">
            <Link href="/student/revision">Open</Link>
          </Button>
        ) : null
      }
      description="Puzzles you missed and topics your coach picked, brought back just before you'd forget them."
      title="Smart Revision"
    >
      {s.activeItems === 0 ? (
        <p className="py-4 text-center text-sm text-app-muted">
          Nothing to revise yet. Puzzles you get wrong, and ones your coach
          recommends, will appear here.
        </p>
      ) : (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
            {counts.map(({ label, value, Icon, iconClass }) => (
              <div
                className="rounded-control border border-app-border bg-app-soft p-3"
                key={label}
              >
                <dt className="text-xs font-medium text-app-muted">{label}</dt>
                <dd className="mt-1.5 flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`flex size-6 shrink-0 items-center justify-center rounded-control ${iconClass}`}
                  >
                    <Icon className="size-3.5" strokeWidth={2.5} />
                  </span>
                  <span className="font-display text-xl font-bold leading-none tabular-nums text-app-text">
                    {value}
                  </span>
                </dd>
              </div>
            ))}
          </dl>

          {s.streakDays > 0 ? (
            <Badge variant="accent">
              <Flame aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
              {s.streakDays}-day revision streak
            </Badge>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            {s.sessionSize > 0 ? (
              <p className="inline-flex items-center gap-1.5 text-xs text-app-muted">
                <Clock aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
                {s.sessionSize} {s.sessionSize === 1 ? "item" : "items"} · about{" "}
                {Math.max(1, s.estimatedMinutes)} min
              </p>
            ) : (
              <p className="text-xs text-app-muted">
                All caught up
                {s.nextDueAt ? ` — next one ${formatNextDue(s.nextDueAt, tz)}` : ""}.
              </p>
            )}

            {s.sessionSize > 0 ? (
              <Button asChild size="sm" variant="outline">
                <Link href="/student/revision?start=1">
                  <Brain aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
                  Start revision
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

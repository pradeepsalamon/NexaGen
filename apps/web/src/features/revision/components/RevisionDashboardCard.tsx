"use client";

import { Brain, Clock, Flame } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatNextDue } from "../lib/revisionFormat";
import { useRevisionSummary } from "../hooks/useRevisionApi";

/** Student dashboard: what is due for revision today and a way in. */
export function RevisionDashboardCard() {
  const tz = useUserTimeZone();
  const { data, error, isLoading, refetch } = useRevisionSummary();

  if (isLoading) return <Skeleton className="h-44 w-full rounded-app" />;
  if (error || !data) {
    return <WidgetError message="Couldn't load your revision." onRetry={() => void refetch()} />;
  }
  const s = data.summary;
  const counts = [
    { label: "Due today", value: s.dueToday },
    { label: "Overdue", value: s.overdue },
    { label: "New", value: s.newAvailable },
    { label: "Done today", value: s.completedToday }
  ];

  return (
    <SectionCard
      actions={
        s.activeItems > 0 ? (
          <Button asChild size="sm" variant="ghost">
            <Link href="/student/revision">Open</Link>
          </Button>
        ) : null
      }
      description="Puzzles you missed and topics your coach picked, brought back just before you'd forget them."
      title="Smart Revision"
    >
      {s.activeItems === 0 ? (
        <p className="py-4 text-center text-sm text-app-muted">
          Nothing to revise yet. Puzzles you get wrong, and ones your coach recommends, will appear here.
        </p>
      ) : (
        <div className="space-y-4">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {counts.map((c) => (
              <div className="rounded-control border border-app-border bg-app-background px-3 py-2" key={c.label}>
                <dt className="text-xs font-semibold text-app-muted">{c.label}</dt>
                <dd className="text-2xl font-extrabold tabular-nums text-app-text">{c.value}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-app-muted">
              {s.sessionSize > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <Clock aria-hidden="true" className="size-4" strokeWidth={2.5} />
                  {s.sessionSize} {s.sessionSize === 1 ? "item" : "items"} · about {Math.max(1, s.estimatedMinutes)} min
                </span>
              ) : (
                <span>All caught up{s.nextDueAt ? ` — next one ${formatNextDue(s.nextDueAt, tz)}` : ""}.</span>
              )}
              {s.streakDays > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <Flame aria-hidden="true" className="size-4" strokeWidth={2.5} />
                  {s.streakDays}-day revision streak
                </span>
              ) : null}
            </p>
            {s.sessionSize > 0 ? (
              <Button asChild size="sm">
                <Link href="/student/revision?start=1">
                  <Brain aria-hidden="true" className="mr-1.5 size-4" strokeWidth={2.5} />
                  Start Revision
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </SectionCard>
  );
}

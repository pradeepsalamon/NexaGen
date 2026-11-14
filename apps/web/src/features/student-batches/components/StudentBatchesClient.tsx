"use client";

import Link from "next/link";
import { CalendarDays, Clock, Layers3, Video } from "lucide-react";
import { resolveBatchType, type Batch, type BatchUserSummary } from "@nexa-chess/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { WidgetError } from "@/components/ui/WidgetError";
import { BatchStatusBadge } from "@/features/batches/components/BatchStatusBadge";
import { BatchSummaryCard, BatchSummaryCardSkeleton, type BatchSummaryFact } from "@/features/batches/components/BatchSummaryCard";
import { BatchTypeBadge } from "@/features/batches/components/BatchTypeBadge";
import { useBatchesQuery } from "@/features/batches/hooks/useBatchesApi";
import { formatFullDate } from "@/lib/datetime";
import { useAuthStore } from "@/stores/authStore";

const CLASSMATES_SHOWN = 8;

// Active batches first, then what is coming, then what is over.
const STATUS_ORDER: Record<Batch["status"], number> = { ACTIVE: 0, ARCHIVED: 3, COMPLETED: 2, UPCOMING: 1 };

export function StudentBatchesClient() {
  const { data, error, isLoading, refetch } = useBatchesQuery();
  const batches = [...(data?.batches ?? [])].sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);

  return (
    <div className="animate-fade-in pb-10">
      <PageHeader
        actions={
          <Button asChild variant="neutral">
            <Link href="/student/live-classes">
              <Video aria-hidden="true" className="size-4" strokeWidth={2.5} />
              Live classes
            </Link>
          </Button>
        }
        description="The batches you're in, with your coaches and classmates."
        title="My batches"
      />

      {isLoading ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1].map((i) => (
            <BatchSummaryCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <WidgetError
          message="Couldn't load your batches. Check your connection and try again."
          onRetry={() => refetch()}
        />
      ) : batches.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            description="Your academy will add you to a batch. It will show up here."
            icon={Layers3}
            title="You're not in a batch yet"
            variant="inline"
          />
        </Card>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 xl:grid-cols-3">
          {batches.map((batch) => (
            <BatchCard batch={batch} key={batch.id} />
          ))}
        </div>
      )}
    </div>
  );
}

function BatchCard({ batch }: { batch: Batch }) {
  const userId = useAuthStore((state) => state.user?.id);

  const type = resolveBatchType({ batchDefault: batch.batchType, studentCount: batch.studentCount }).type;
  // Batch dates are date-only columns, so they format in UTC, never the viewer's zone.
  const starts = batch.startsAt ? formatFullDate(batch.startsAt, "UTC") : null;
  const ends = batch.endsAt ? formatFullDate(batch.endsAt, "UTC") : null;
  const dates = [starts ? `Starts ${starts}` : null, ends ? `ends ${ends}` : null].filter(Boolean).join(" · ");
  const classmates = batch.students.filter((student) => student.id !== userId);
  const hidden = classmates.length - CLASSMATES_SHOWN;
  const classmateNames = classmates
    .slice(0, CLASSMATES_SHOWN)
    .map((student) => `${student.firstName}${student.lastName ? ` ${student.lastName.trim().charAt(0)}.` : ""}`)
    .join(", ");

  const facts: BatchSummaryFact[] = [
    ...(dates ? [{ icon: CalendarDays, key: "dates", label: dates }] : []),
    ...(batch.scheduleNotes ? [{ icon: Clock, key: "schedule", label: batch.scheduleNotes }] : []),
  ];

  return (
    <BatchSummaryCard
      actions={
        <Button asChild size="sm" variant="outline">
          <Link href={`/student/schedule?batchId=${batch.id}`}>
            <CalendarDays aria-hidden="true" className="size-4" strokeWidth={2.5} />
            Schedule
          </Link>
        </Button>
      }
      badges={
        <>
          <BatchTypeBadge type={type} />
          {batch.status !== "ACTIVE" ? <BatchStatusBadge status={batch.status} /> : null}
        </>
      }
      description={batch.description}
      facts={facts}
      people={
        batch.coaches.length > 0 || classmates.length > 0 ? (
          <div className="flex min-w-0 items-center gap-2">
            {batch.coaches.length > 0 ? (
              <span aria-hidden="true" className="flex shrink-0 -space-x-1.5">
                {batch.coaches.slice(0, 3).map((coach) => (
                  <span
                    className="flex size-7 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-ink ring-2 ring-app-surface"
                    key={coach.id}
                  >
                    {initials(coach)}
                  </span>
                ))}
              </span>
            ) : null}
            <div className="min-w-0 text-sm leading-tight">
              {batch.coaches.length > 0 ? (
                <p className="truncate font-medium text-app-text">
                  <span className="sr-only">{batch.coaches.length === 1 ? "Coach: " : "Coaches: "}</span>
                  {batch.coaches.map(fullName).join(", ")}
                </p>
              ) : null}
              {classmates.length > 0 ? (
                <p className="truncate text-xs text-app-muted">
                  {classmates.length} {classmates.length === 1 ? "classmate" : "classmates"}: {classmateNames}
                  {hidden > 0 ? ` +${hidden}` : ""}
                </p>
              ) : null}
            </div>
          </div>
        ) : null
      }
      testId={`batch-card-${batch.id}`}
      title={batch.name}
    />
  );
}

function fullName(user: BatchUserSummary) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ");
}

function initials(user: BatchUserSummary) {
  return `${user.firstName.trim().charAt(0)}${user.lastName?.trim().charAt(0) ?? ""}`.toUpperCase() || "C";
}

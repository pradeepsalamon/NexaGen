"use client";

import Link from "next/link";
import { CalendarDays, Clock, Layers3, Video } from "lucide-react";
import { resolveBatchType, type Batch, type BatchUserSummary } from "@nexa-chess/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { BatchStatusBadge } from "@/features/batches/components/BatchStatusBadge";
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
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton className="h-64 rounded-app" key={i} />
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
          />
        </Card>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
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

  return (
    <Card className="flex flex-col p-4 sm:p-6" data-testid={`batch-card-${batch.id}`}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="min-w-0 break-words text-lg font-semibold leading-tight">{batch.name}</h2>
        <BatchTypeBadge type={type} />
        {batch.status !== "ACTIVE" ? <BatchStatusBadge status={batch.status} /> : null}
      </div>
      {batch.description ? (
        <p className="mt-1 line-clamp-2 text-sm text-app-muted">{batch.description}</p>
      ) : null}

      {dates || batch.scheduleNotes ? (
        <ul className="mt-4 space-y-1.5 text-sm">
          {dates ? (
            <li className="flex items-start gap-2 text-app-muted">
              <CalendarDays aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={2.25} />
              {dates}
            </li>
          ) : null}
          {batch.scheduleNotes ? (
            <li className="flex items-start gap-2 text-app-text">
              <Clock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-app-muted" strokeWidth={2.25} />
              <span className="min-w-0 break-words">{batch.scheduleNotes}</span>
            </li>
          ) : null}
        </ul>
      ) : null}

      {batch.coaches.length > 0 ? (
        <section className="mt-4">
          <h3 className="text-xs font-semibold text-app-muted">
            {batch.coaches.length === 1 ? "Coach" : "Coaches"}
          </h3>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
            {batch.coaches.map((coach) => (
              <li className="flex min-w-0 items-center gap-2 text-sm font-medium" key={coach.id}>
                <span
                  aria-hidden="true"
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-ink"
                >
                  {initials(coach)}
                </span>
                <span className="min-w-0 break-words">{fullName(coach)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {classmates.length > 0 ? (
        <section className="mt-4">
          <h3 className="text-xs font-semibold text-app-muted">Classmates ({classmates.length})</h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {classmates.slice(0, CLASSMATES_SHOWN).map((student) => (
              <li className="rounded-full bg-app-soft px-2.5 py-0.5 text-xs font-medium" key={student.id}>
                {student.firstName}
                {student.lastName ? ` ${student.lastName.trim().charAt(0)}.` : ""}
              </li>
            ))}
            {hidden > 0 ? (
              <li className="rounded-full bg-app-soft px-2.5 py-0.5 text-xs text-app-muted">+{hidden} more</li>
            ) : null}
          </ul>
        </section>
      ) : null}

      <div className="mt-auto pt-5">
        <div className="flex border-t border-app-border pt-4">
          <Button asChild size="sm" variant="outline">
            <Link href={`/student/schedule?batchId=${batch.id}`}>
              <CalendarDays aria-hidden="true" className="size-4" strokeWidth={2.5} />
              View schedule
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}

function fullName(user: BatchUserSummary) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ");
}

function initials(user: BatchUserSummary) {
  return `${user.firstName.trim().charAt(0)}${user.lastName?.trim().charAt(0) ?? ""}`.toUpperCase() || "C";
}

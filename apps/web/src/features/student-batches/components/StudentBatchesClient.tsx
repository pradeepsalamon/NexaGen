"use client";

import Link from "next/link";
import {
  CalendarDays,
  Clock,
  GraduationCap,
  Layers3,
  Users,
  Video
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { BatchStatusBadge } from "@/features/batches/components/BatchStatusBadge";
import { useBatchesQuery } from "@/features/batches/hooks/useBatchesApi";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";

export function StudentBatchesClient() {
  const { data, isLoading, error, refetch } = useBatchesQuery();
  const timeZone = useUserTimeZone();

  const batches = data?.batches ?? [];

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <PageHeader
        title="My batches"
        description="Batches and coaching groups you are currently enrolled in at Nexa Chess Academy."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/student/schedule">
                <CalendarDays aria-hidden="true" className="size-4" strokeWidth={2.5} />
                View Schedule
              </Link>
            </Button>
            <Button asChild variant="primary">
              <Link href="/student/live-classes">
                <Video aria-hidden="true" className="size-4" strokeWidth={2.5} />
                Live Classes
              </Link>
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-6 w-44" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-4 w-3/4" />
                <div className="space-y-2 pt-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
                <div className="pt-4 border-t border-app-border flex gap-3">
                  <Skeleton className="h-9 flex-1" />
                  <Skeleton className="h-9 flex-1" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : error ? (
        <WidgetError
          message="Couldn't load your enrolled batches. Please check your connection and try again."
          onRetry={() => refetch()}
        />
      ) : batches.length === 0 ? (
        <Card className="p-8 sm:p-12">
          <EmptyState
            icon={Layers3}
            title="No batches assigned yet"
            description="You have not been assigned to any learning batches yet. Your academy administrator will enroll you into a batch soon."
          />
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {batches.map((batch) => {
            const startDateStr = batch.startsAt ? formatFullDate(batch.startsAt, timeZone) : null;
            const endDateStr = batch.endsAt ? formatFullDate(batch.endsAt, timeZone) : null;

            return (
              <Card
                key={batch.id}
                className="flex flex-col justify-between p-6 shadow-card hover:border-primary/40 transition-colors"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-xl font-bold text-app-text truncate">{batch.name}</h2>
                      {batch.description && (
                        <p className="mt-1 text-sm text-app-muted line-clamp-2">
                          {batch.description}
                        </p>
                      )}
                    </div>
                    <BatchStatusBadge status={batch.status} />
                  </div>

                  <div className="space-y-2 rounded-control bg-app-soft/60 p-3 text-xs text-app-muted">
                    {(startDateStr || endDateStr) && (
                      <div className="flex items-center gap-2">
                        <CalendarDays aria-hidden="true" className="size-4 shrink-0 text-primary" strokeWidth={2.25} />
                        <span>
                          {startDateStr ? `Starts ${startDateStr}` : "Ongoing"}
                          {endDateStr ? ` · Ends ${endDateStr}` : ""}
                        </span>
                      </div>
                    )}
                    {batch.scheduleNotes && (
                      <div className="flex items-start gap-2">
                        <Clock aria-hidden="true" className="size-4 shrink-0 text-accent mt-0.5" strokeWidth={2.25} />
                        <span className="text-app-text font-medium">{batch.scheduleNotes}</span>
                      </div>
                    )}
                  </div>

                  {batch.coaches && batch.coaches.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2 text-xs font-bold text-app-muted">
                        <GraduationCap aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
                        Coaches ({batch.coaches.length})
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {batch.coaches.map((c) => (
                          <div
                            key={c.id}
                            className="flex items-center gap-2 rounded-full border border-app-border bg-app-surface px-2.5 py-1 text-xs font-semibold text-app-text shadow-sm"
                          >
                            <span className="flex size-5 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold text-primary-ink">
                              {c.firstName?.[0] ?? "C"}
                            </span>
                            <span>
                              {c.firstName} {c.lastName ?? ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {batch.students && batch.students.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2 text-xs font-bold text-app-muted">
                        <Users aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
                        Classmates ({batch.studentCount})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {batch.students.slice(0, 8).map((s) => (
                          <span
                            key={s.id}
                            className="inline-flex items-center rounded-md bg-app-soft px-2 py-0.5 text-xs text-app-text font-medium"
                          >
                            {s.firstName} {s.lastName ? `${s.lastName[0]}.` : ""}
                          </span>
                        ))}
                        {batch.students.length > 8 && (
                          <span className="inline-flex items-center rounded-md bg-app-soft px-2 py-0.5 text-xs text-app-muted font-medium">
                            +{batch.students.length - 8} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-6 pt-4 border-t border-app-border flex flex-wrap gap-2">
                  <Button asChild variant="outline" className="flex-1">
                    <Link href={`/student/schedule?batchId=${batch.id}`}>
                      <CalendarDays aria-hidden="true" className="size-4" strokeWidth={2.5} />
                      Batch Schedule
                    </Link>
                  </Button>
                  <Button asChild variant="primary" className="flex-1">
                    <Link href="/student/live-classes">
                      <Video aria-hidden="true" className="size-4" strokeWidth={2.5} />
                      Live Classes
                    </Link>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

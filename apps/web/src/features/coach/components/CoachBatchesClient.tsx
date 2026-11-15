"use client";

import { useState } from "react";
import { CalendarDays, Clock, Layers, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import type { CoachBatch } from "@nexa-chess/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { WidgetError } from "@/components/ui/WidgetError";
import { AddStudentRequestDialog } from "@/features/approvals/components/BatchStudentRequestDialogs";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatRelativeDay, formatTime } from "@/lib/datetime";
import { BatchStatusBadge } from "../../batches/components/BatchStatusBadge";
import { BatchSummaryCard, BatchSummaryCardSkeleton } from "../../batches/components/BatchSummaryCard";
import { useCoachBatches } from "../hooks/useCoachApi";

/** Archived and completed batches sort after the ones still being taught. */
function isClosed(status: string) {
  return status === "ARCHIVED" || status === "COMPLETED";
}

function BatchCard({ batch, onAddStudent }: { batch: CoachBatch; onAddStudent: (batch: CoachBatch) => void }) {
  const timeZone = useUserTimeZone();
  const closed = isClosed(batch.status);
  const nextClass = batch.nextClass
    ? `${formatRelativeDay(batch.nextClass, timeZone)} at ${formatTime(batch.nextClass, timeZone)}`
    : "Not scheduled";

  return (
    <BatchSummaryCard
      actions={
        <>
          {batch.status === "ARCHIVED" ? null : (
            <SimpleTooltip label="Ask to add a student">
              <Button
                aria-label={`Ask to add a student to ${batch.name}`}
                className="size-8"
                onClick={() => onAddStudent(batch)}
                size="icon"
                type="button"
                variant="neutral"
              >
                <UserPlus aria-hidden="true" className="size-4" strokeWidth={2.5} />
              </Button>
            </SimpleTooltip>
          )}
          {closed ? null : (
            <Button asChild size="sm" variant="ghost">
              <Link href="/coach/schedule">Schedule</Link>
            </Button>
          )}
          <Button asChild size="sm" variant="outline">
            <Link href={`/coach/students?batchId=${batch.id}`}>
              <Users aria-hidden="true" className="size-4" strokeWidth={2.5} />
              Students
            </Link>
          </Button>
        </>
      }
      badges={batch.status !== "ACTIVE" ? <BatchStatusBadge status={batch.status} /> : null}
      facts={[
        { icon: Users, key: "students", label: `${batch.studentCount} ${batch.studentCount === 1 ? "student" : "students"}` },
        { icon: CalendarDays, key: "next", label: `Next: ${nextClass}` },
        ...(batch.scheduleNotes ? [{ icon: Clock, key: "schedule", label: batch.scheduleNotes }] : []),
      ]}
      testId={`coach-batch-card-${batch.id}`}
      title={batch.name}
    />
  );
}

export function CoachBatchesClient() {
  const { data, error, isLoading, refetch } = useCoachBatches();
  const [addingTo, setAddingTo] = useState<CoachBatch | null>(null);
  const batches = [...(data?.batches ?? [])].sort((a, b) => Number(isClosed(a.status)) - Number(isClosed(b.status)));

  return (
    <div className="animate-fade-in pb-10">
      <PageHeader description="The batches you teach, their students and their next class." title="My batches" />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <BatchSummaryCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <WidgetError
          message="Couldn't load your batches. Check your connection and try again."
          onRetry={() => refetch()}
        />
      ) : batches.length === 0 ? (
        <EmptyState
          description="An admin assigns batches to coaches. Ask them if you expected to see one here."
          icon={Layers}
          title="No batches assigned yet"
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {batches.map((batch) => (
            <BatchCard batch={batch} key={batch.id} onAddStudent={setAddingTo} />
          ))}
        </div>
      )}

      <AddStudentRequestDialog batch={addingTo} onClose={() => setAddingTo(null)} />
    </div>
  );
}

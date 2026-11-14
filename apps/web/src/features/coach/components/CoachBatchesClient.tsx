"use client";

import { useState } from "react";
import { Calendar, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import type { CoachBatch } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AddStudentRequestDialog } from "@/features/approvals/components/BatchStudentRequestDialogs";
import { BatchStatusBadge } from "../../batches/components/BatchStatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCoachBatches } from "../hooks/useCoachApi";
import { formatDayMonth, formatTime } from "@/lib/datetime";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";

/** Archived and completed batches sort after the ones still being taught. */
function isClosed(status: string) {
  return status === "ARCHIVED" || status === "COMPLETED";
}

export function CoachBatchesClient() {
  const { data, isLoading } = useCoachBatches();
  const tz = useUserTimeZone();
  const [addingTo, setAddingTo] = useState<CoachBatch | null>(null);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">My batches</h1>
        <p className="text-app-muted mt-1">Manage your assigned batches and their students.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-5 h-48">
              <Skeleton className="h-full w-full" />
            </Card>
          ))}
        </div>
      ) : data?.batches && data.batches.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[...data.batches].sort((a, b) => Number(isClosed(a.status)) - Number(isClosed(b.status))).map((batch) => {
            const closed = isClosed(batch.status);
            const nextClassStr = batch.nextClass
              ? `${formatDayMonth(batch.nextClass, tz)} at ${formatTime(batch.nextClass, tz)}`
              : "Not scheduled";

            return (
              <Card key={batch.id} className="flex flex-col p-5 shadow-card hover:border-primary/30 transition-colors">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-lg text-app-text mb-1">{batch.name}</h3>
                    <BatchStatusBadge status={batch.status} />
                  </div>
                </div>

                <div className="grid gap-3 mb-6">
                  <div className="flex items-center gap-2 text-sm text-app-muted">
                    <Users aria-hidden="true" className="size-4" />
                    <span className="font-medium">
                      {batch.studentCount} {batch.studentCount === 1 ? "student" : "students"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-app-muted">
                    <Calendar aria-hidden="true" className="size-4" />
                    <span className="font-medium">Next class</span>
                    <span className="ml-auto font-semibold text-app-text">{nextClassStr}</span>
                  </div>
                </div>

                <div className={`mt-auto grid gap-2 border-t border-app-border pt-4 ${closed ? "" : "grid-cols-2"}`}>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/coach/students?batchId=${batch.id}`}>View students</Link>
                  </Button>
                  {closed ? null : (
                    <Button asChild variant="primary" size="sm">
                      <Link href="/coach/schedule">Schedule</Link>
                    </Button>
                  )}
                  {batch.status === "ARCHIVED" ? null : (
                    <Button
                      className={closed ? "" : "col-span-2"}
                      onClick={() => setAddingTo(batch)}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <UserPlus aria-hidden="true" className="mr-1.5 size-4" strokeWidth={2.5} />
                      Ask to add a student
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <EmptyState variant="inline"
            icon={Users}
            title="No batches assigned"
            description="You have not been assigned to any batches yet. Contact an administrator for assignments."
          />
        </Card>
      )}

      <AddStudentRequestDialog batch={addingTo} onClose={() => setAddingTo(null)} />
    </div>
  );
}

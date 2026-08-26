"use client";

import { Calendar, Users } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { BatchStatusBadge } from "../../batches/components/BatchStatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCoachBatches } from "../hooks/useCoachApi";

export function CoachBatchesClient() {
  const { data, isLoading } = useCoachBatches();

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-extrabold text-app-text tracking-tight">My Batches</h1>
        <p className="text-app-muted mt-1">Manage your assigned batches and their students.</p>
      </div>

      {isLoading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-5 h-48">
              <Skeleton className="h-full w-full" />
            </Card>
          ))}
        </div>
      ) : data?.batches && data.batches.length > 0 ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {data.batches.map((batch) => {
            const nextClass = batch.nextClass ? new Date(batch.nextClass) : null;
            const nextClassStr = nextClass
              ? `${nextClass.toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${nextClass.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
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
                    <Users className="h-4 w-4" />
                    <span className="font-medium">{batch.studentCount} Students</span>
                  </div>
                  <div className="flex flex-col gap-1 text-sm">
                    <div className="flex items-center gap-2 text-app-muted">
                      <Calendar className="h-4 w-4" />
                      <span className="font-medium">Next Class:</span>
                    </div>
                    <span className="ml-6 font-semibold text-app-text">{nextClassStr}</span>
                  </div>
                </div>

                <div className="mt-auto grid grid-cols-2 gap-2 pt-4 border-t border-app-border">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/coach/students?batchId=${batch.id}`}>View Students</Link>
                  </Button>
                  <Button asChild variant="primary" size="sm">
                    <Link href={`/coach/schedule?batchId=${batch.id}`}>Schedule</Link>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="p-6 sm:p-12">
          <EmptyState
            icon={Users}
            title="No batches assigned"
            description="You have not been assigned to any batches yet. Contact an administrator for assignments."
          />
        </Card>
      )}
    </div>
  );
}

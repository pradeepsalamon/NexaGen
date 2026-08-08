"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import type { CoachClass } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { useUpcomingClasses, useCoachBatches, useCancelClass } from "../hooks/useCoachApi";
import { ClassCard } from "./ClassCard";
import { ScheduleClassDialog } from "./ScheduleClassDialog";

export function CoachScheduleClient() {
  const searchParams = useSearchParams();
  const openQuery = searchParams.get("openModal") === "true" || searchParams.has("batchId");
  const batchIdQuery = searchParams.get("batchId") || undefined;

  const { data: upcomingData, isLoading: upcomingLoading } = useUpcomingClasses();
  const { data: batchesData, isLoading: batchesLoading } = useCoachBatches();

  const [dialogOpen, setDialogOpen] = useState(openQuery);
  const [classToEdit, setClassToEdit] = useState<CoachClass | null>(null);
  const [classToCancel, setClassToCancel] = useState<CoachClass | null>(null);
  const cancelClassMutation = useCancelClass(classToCancel?.id || "");

  useEffect(() => {
    if (openQuery) {
      setDialogOpen(true);
    }
  }, [openQuery]);


  const handleEdit = (classItem: CoachClass) => {
    setClassToEdit(classItem);
    setDialogOpen(true);
  };

  const handleCancel = (classItem: CoachClass) => {
    if (confirm(`Are you sure you want to cancel the class for ${classItem.batchName}?`)) {
      setClassToCancel(classItem);
      cancelClassMutation.mutate(undefined, {
        onSuccess: () => setClassToCancel(null)
      });
    }
  };

  const openNewClassDialog = () => {
    setClassToEdit(null);
    setDialogOpen(true);
  };

  const batches = batchesData?.batches || [];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-app-text tracking-tight">Schedule</h1>
          <p className="text-app-muted mt-1">Manage your upcoming classes and schedules.</p>
        </div>
        <Button onClick={openNewClassDialog} disabled={batchesLoading || batches.length === 0}>
          <Plus className="mr-2 h-4 w-4" />
          Schedule Class
        </Button>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-bold text-app-text">Upcoming Classes</h2>

        {upcomingLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="p-4 h-48">
                <Skeleton className="h-full w-full" />
              </Card>
            ))}
          </div>
        ) : upcomingData?.classes && upcomingData.classes.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingData.classes.map((cls) => (
              <ClassCard
                key={cls.id}
                classItem={cls}
                onEdit={handleEdit}
                onCancel={handleCancel}
              />
            ))}
          </div>
        ) : (
          <Card className="p-12">
            <EmptyState
              icon={Plus}
              title="No upcoming classes"
              description={batches.length === 0 ? "You need to be assigned to a batch before you can schedule classes." : "You have no upcoming classes. Click 'Schedule Class' to add one."}
              action={
                batches.length > 0
                  ? { label: "Schedule Class", onClick: openNewClassDialog }
                  : undefined
              }
            />
          </Card>
        )}
      </div>

      <ScheduleClassDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        classToEdit={classToEdit}
        batches={batches}
        defaultBatchId={batchIdQuery}
      />

    </div>
  );
}

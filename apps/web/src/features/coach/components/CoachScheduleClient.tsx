"use client";

import { useState } from "react";
import { CalendarClock, CalendarDays, CalendarPlus, CalendarRange, List } from "lucide-react";
import type { CoachClass } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ClassRequestDialog } from "@/features/approvals/components/ClassRequestDialog";
import { CoachScheduleRequests } from "@/features/approvals/components/CoachScheduleRequests";
import { useCoachBatches, useUpcomingClasses } from "../hooks/useCoachApi";
import { useCoachClassCancel } from "@/features/approvals/hooks/useCoachClassCancel";
import { ClassCard } from "./ClassCard";
import { ClassNotesDialog } from "./ClassNotesDialog";
import { CoachScheduleCalendar } from "./CoachScheduleCalendar";

type ScheduleView = "week" | "month" | "list";

const VIEW_OPTIONS: { icon: typeof List; label: string; value: ScheduleView }[] = [
  { icon: CalendarRange, label: "Week", value: "week" },
  { icon: CalendarDays, label: "Month", value: "month" },
  { icon: List, label: "Upcoming", value: "list" }
];

export function CoachScheduleClient() {
  const [view, setView] = useState<ScheduleView>("week");
  const { data: upcomingData, isLoading: upcomingLoading } = useUpcomingClasses();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [classToEdit, setClassToEdit] = useState<CoachClass | null>(null);
  const { data: batchesData } = useCoachBatches();
  const batches = batchesData?.batches ?? [];
  const [requestOpen, setRequestOpen] = useState(false);
  const [rescheduleClass, setRescheduleClass] = useState<CoachClass | null>(null);

  const openRequest = (cls: CoachClass | null) => {
    setRescheduleClass(cls);
    setRequestOpen(true);
  };

  // V10: direct only more than 24 h ahead; otherwise an admin request.
  const { cancel: handleCancel, dialog: cancelRequestDialog } = useCoachClassCancel();

  const handleEdit = (classItem: CoachClass) => {
    setClassToEdit(classItem);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">Schedule</h1>
          <p className="text-app-muted mt-1">
            Your batches&apos; classes, scheduled by the academy. Add notes to any of them, or ask
            for an extra class or a new time.
          </p>
        </div>
        <Button onClick={() => openRequest(null)} disabled={batches.length === 0}>
          <CalendarPlus className="mr-2 size-4" strokeWidth={2.5} />
          Request extra class
        </Button>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-app-text">
            {view === "list" ? "Upcoming classes" : "Calendar"}
          </h2>
          <div role="group" aria-label="Schedule view" className="flex items-center gap-1 rounded-control bg-app-soft p-1">
            {VIEW_OPTIONS.map(({ icon: Icon, label, value }) => (
              <Button
                key={value}
                size="sm"
                variant={view === value ? "primary" : "ghost"}
                aria-pressed={view === value}
                className="h-8 px-3 text-xs"
                onClick={() => setView(value)}
              >
                <Icon className="mr-1.5 size-3.5" strokeWidth={2.25} />
                {label}
              </Button>
            ))}
          </div>
        </div>

        {view !== "list" ? (
          <CoachScheduleCalendar
            view={view}
            onEdit={handleEdit}
            onCancel={handleCancel}
            onRequestReschedule={openRequest}
          />
        ) : upcomingLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="p-4 h-48">
                <Skeleton className="h-full w-full" />
              </Card>
            ))}
          </div>
        ) : upcomingData?.classes && upcomingData.classes.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingData.classes.map((cls) => (
              <ClassCard
                key={cls.id}
                classItem={cls}
                onEdit={handleEdit}
                onCancel={handleCancel}
                onRequestReschedule={openRequest}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={CalendarClock}
            title="No upcoming classes"
            description="Classes appear here once the academy schedules them for your batches."
          />
        )}
      </div>

      <CoachScheduleRequests />

      <ClassNotesDialog open={dialogOpen} onOpenChange={setDialogOpen} classItem={classToEdit} />
      <ClassRequestDialog
        open={requestOpen}
        onOpenChange={setRequestOpen}
        batches={batches}
        rescheduleClass={rescheduleClass}
      />
      {cancelRequestDialog}
    </div>
  );
}

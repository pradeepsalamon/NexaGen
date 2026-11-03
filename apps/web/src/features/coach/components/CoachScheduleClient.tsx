"use client";

import { useState } from "react";
import { CalendarClock, CalendarDays, CalendarPlus, CalendarRange, List } from "lucide-react";
import type { CoachClass } from "@nexa-chess/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { ClassRowList } from "@/components/ui/ClassRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { WidgetError } from "@/components/ui/WidgetError";
import { ClassRequestDialog } from "@/features/approvals/components/ClassRequestDialog";
import { CoachScheduleRequests } from "@/features/approvals/components/CoachScheduleRequests";
import { SubstituteRequestDialog } from "@/features/approvals/components/SubstituteRequestDialog";
import { useCoachClassCancel } from "@/features/approvals/hooks/useCoachClassCancel";
import { useCoachBatches, useUpcomingClasses } from "../hooks/useCoachApi";
import { ClassNotesDialog } from "./ClassNotesDialog";
import { CoachClassRow } from "./CoachClassRow";
import { CoachScheduleCalendar } from "./CoachScheduleCalendar";

type ScheduleView = "week" | "month" | "list";

export function CoachScheduleClient() {
  const [view, setView] = useState<ScheduleView>("week");
  const upcoming = useUpcomingClasses();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [classToEdit, setClassToEdit] = useState<CoachClass | null>(null);
  const { data: batchesData } = useCoachBatches();
  const batches = batchesData?.batches ?? [];
  const [requestOpen, setRequestOpen] = useState(false);
  const [rescheduleClass, setRescheduleClass] = useState<CoachClass | null>(null);
  const [substituteFor, setSubstituteFor] = useState<CoachClass | null>(null);

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

  const actions = {
    onCancel: handleCancel,
    onEdit: handleEdit,
    onRequestReschedule: openRequest,
    onRequestSubstitute: setSubstituteFor
  };
  const upcomingClasses = upcoming.data?.classes ?? [];

  return (
    <div className="animate-fade-in pb-10">
      <PageHeader
        actions={
          <Button disabled={batches.length === 0} onClick={() => openRequest(null)}>
            <CalendarPlus aria-hidden="true" className="size-4" strokeWidth={2.5} />
            Request extra class
          </Button>
        }
        description="Your batches' classes, scheduled by the academy. Add notes to any of them, or ask for an extra class or a new time."
        title="Schedule"
      />

      <div className="space-y-5">
        <Tabs onValueChange={(next) => setView(next as ScheduleView)} value={view}>
          <TabsList aria-label="Schedule view">
            <TabsTrigger value="week">
              <CalendarRange aria-hidden="true" className="size-4" strokeWidth={2.25} />
              Week
            </TabsTrigger>
            <TabsTrigger value="month">
              <CalendarDays aria-hidden="true" className="size-4" strokeWidth={2.25} />
              Month
            </TabsTrigger>
            <TabsTrigger value="list">
              <List aria-hidden="true" className="size-4" strokeWidth={2.25} />
              Upcoming
            </TabsTrigger>
          </TabsList>

          <TabsContent value="week">
            <CoachScheduleCalendar view="week" {...actions} />
          </TabsContent>
          <TabsContent value="month">
            <CoachScheduleCalendar view="month" {...actions} />
          </TabsContent>
          <TabsContent value="list">
            <SectionCard title="Upcoming classes">
              {upcoming.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-14 rounded-app" />
                  <Skeleton className="h-14 rounded-app" />
                  <Skeleton className="h-14 rounded-app" />
                </div>
              ) : upcoming.isError ? (
                <WidgetError
                  message="Couldn't load your upcoming classes. Check your connection and try again."
                  onRetry={() => upcoming.refetch()}
                />
              ) : upcomingClasses.length === 0 ? (
                <EmptyState
                  description="Classes appear here once the academy schedules them for your batches."
                  icon={CalendarClock}
                  title="No upcoming classes"
                  variant="inline"
                />
              ) : (
                <ClassRowList>
                  {upcomingClasses.map((cls) => (
                    <CoachClassRow cls={cls} key={cls.id} {...actions} />
                  ))}
                </ClassRowList>
              )}
            </SectionCard>
          </TabsContent>
        </Tabs>

        <CoachScheduleRequests />
      </div>

      <ClassNotesDialog classItem={classToEdit} onOpenChange={setDialogOpen} open={dialogOpen} />
      <SubstituteRequestDialog classItem={substituteFor} onClose={() => setSubstituteFor(null)} />
      <ClassRequestDialog
        batches={batches}
        onOpenChange={setRequestOpen}
        open={requestOpen}
        rescheduleClass={rescheduleClass}
      />
      {cancelRequestDialog}
    </div>
  );
}

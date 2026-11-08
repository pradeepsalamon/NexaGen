"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Calendar, CalendarDays, Video } from "lucide-react";
import { isUpcomingClass } from "@nexa-chess/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { ClassRow, ClassRowList } from "@/components/ui/ClassRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScheduleCalendar } from "@/components/ui/ScheduleCalendar";
import { SectionCard } from "@/components/ui/SectionCard";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { WidgetError } from "@/components/ui/WidgetError";
import { useBatchesQuery } from "@/features/batches/hooks/useBatchesApi";
import { useScheduleCalendarQuery } from "@/features/batch-schedules/hooks/useBatchScheduleApi";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatLongDate } from "@/lib/datetime";
import {
  addDays,
  addMonths,
  fetchRange,
  groupByDay,
  isSameMonth,
  startOfMonth,
  zonedDayKey
} from "@/lib/scheduleCalendar";
import { cn } from "@/lib/utils";

type ScheduleView = "calendar" | "upcoming";

const UPCOMING_DAYS = 90;

export function StudentScheduleClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const timeZone = useUserTimeZone();
  const today = zonedDayKey(Date.now(), timeZone);
  const selectedBatchId = searchParams.get("batchId") || "";

  const isPhone = useMediaQuery("(max-width: 639px)");
  const [chosenView, setChosenView] = useState<ScheduleView | null>(null);
  const view = chosenView ?? (isPhone ? "upcoming" : "calendar");

  // Opens on the month that contains "today" in the user's zone, not the
  // browser's: the two disagree near midnight on the first of a month.
  const [month, setMonth] = useState(() => startOfMonth(today));
  const [selectedDay, setSelectedDay] = useState(today);

  const { data: batchesData, isLoading: batchesLoading } = useBatchesQuery();
  const batchOptions = [
    { label: "All my batches", value: "" },
    ...(batchesData?.batches ?? []).map((batch) => ({ label: batch.name, value: batch.id }))
  ];

  // Three months at a time, so paging to a neighbour usually has its classes already.
  const calendarRange = useMemo(
    () => fetchRange([addMonths(month, -1), addDays(addMonths(month, 2), -1)]),
    [month]
  );
  const calendar = useScheduleCalendarQuery({
    ...calendarRange,
    batchId: selectedBatchId || undefined,
    enabled: view === "calendar",
    keepPrevious: true
  });
  const calendarClasses = useMemo(() => calendar.data?.classes ?? [], [calendar.data]);
  const classesByDay = useMemo(() => groupByDay(calendarClasses, timeZone), [calendarClasses, timeZone]);
  const selectedClasses = classesByDay.get(selectedDay) ?? [];

  // The upcoming list has its own window, so paging the calendar never changes it.
  const [upcomingRange] = useState(() => {
    const now = Date.now();
    return {
      from: new Date(now - 6 * 60 * 60 * 1000).toISOString(),
      to: new Date(now + UPCOMING_DAYS * 24 * 60 * 60 * 1000).toISOString()
    };
  });
  const upcoming = useScheduleCalendarQuery({ ...upcomingRange, batchId: selectedBatchId || undefined });
  // Cancelled classes stay on the calendar, marked, but are never upcoming.
  const upcomingClasses = useMemo(
    () => (upcoming.data?.classes ?? []).filter((cls) => isUpcomingClass(cls)),
    [upcoming.data]
  );

  const showMonth = (next: string) => {
    setMonth(next);
    const firstClass = calendarClasses.find((cls) => isSameMonth(zonedDayKey(cls.startsAt, timeZone), next));
    if (isSameMonth(next, today)) setSelectedDay(today);
    else setSelectedDay(firstClass ? zonedDayKey(firstClass.startsAt, timeZone) : next);
  };

  const selectDay = (day: string) => {
    setSelectedDay(day);
    setMonth(startOfMonth(day));
  };

  const changeBatch = (batchId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (batchId) params.set("batchId", batchId);
    else params.delete("batchId");
    router.replace(`/student/schedule${params.toString() ? `?${params.toString()}` : ""}`);
  };

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
        description="Every class in your batches, by month or as a list of what's next."
        title="Schedule"
      />

      <Tabs onValueChange={(next) => setChosenView(next as ScheduleView)} value={view}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <TabsList aria-label="Schedule view" className="self-end sm:self-auto">
            <TabsTrigger value="calendar">
              <Calendar aria-hidden="true" className="size-4" strokeWidth={2.25} />
              Calendar
            </TabsTrigger>
            <TabsTrigger value="upcoming">
              <CalendarDays aria-hidden="true" className="size-4" strokeWidth={2.25} />
              Upcoming{upcoming.data ? ` (${upcomingClasses.length})` : ""}
            </TabsTrigger>
          </TabsList>
          <div className="w-full sm:w-72">
            <Select
              aria-label="Filter by batch"
              disabled={batchesLoading}
              onChange={(event) => changeBatch(event.target.value)}
              options={batchOptions}
              value={selectedBatchId}
            />
          </div>
        </div>

        <TabsContent value="calendar">
          {calendar.isLoading ? (
            <Skeleton className="h-96 rounded-app" />
          ) : calendar.isError ? (
            <WidgetError
              message="Couldn't load your schedule. Check your connection and try again."
              onRetry={() => calendar.refetch()}
            />
          ) : (
            <div
              className={cn(
                "grid grid-cols-1 items-start gap-4 transition-opacity lg:grid-cols-12",
                calendar.isPlaceholderData && "opacity-60"
              )}
            >
              <div className="min-w-0 lg:col-span-7">
                <ScheduleCalendar
                  classesByDay={classesByDay}
                  month={month}
                  onMonthChange={showMonth}
                  onSelectDay={selectDay}
                  selectedDay={selectedDay}
                  today={today}
                />
              </div>
              <div className="min-w-0 lg:col-span-5">
                <SectionCard title={formatLongDate(selectedDay, "UTC")}>
                  {selectedClasses.length === 0 ? (
                    <EmptyState icon={CalendarDays} title="No classes on this day" variant="inline" />
                  ) : (
                    <ClassRowList>
                      {selectedClasses.map((cls) => (
                        <ClassRow cls={cls} key={cls.id} showDate={false} />
                      ))}
                    </ClassRowList>
                  )}
                </SectionCard>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="upcoming">
          <SectionCard description={`The next ${UPCOMING_DAYS} days.`} title="Upcoming classes">
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
                description={selectedBatchId ? "Try all your batches instead." : undefined}
                illustration="schedule"
                title={selectedBatchId ? "No upcoming classes in this batch" : "Nothing scheduled yet"}
                variant="inline"
              />
            ) : (
              <ClassRowList>
                {upcomingClasses.map((cls) => (
                  <ClassRow cls={cls} key={cls.id} />
                ))}
              </ClassRowList>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

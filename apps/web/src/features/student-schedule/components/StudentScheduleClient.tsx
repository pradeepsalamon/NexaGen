"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  GraduationCap,
  Play,
  Video
} from "lucide-react";
import {
  canJoinClass,
  isUpcomingClass,
  resolveClassDisplayStatus,
  type ScheduleCalendarClass
} from "@nexa-chess/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ClassStatusBadge } from "@/components/ui/ClassStatusBadge";
import { ClassStatusLegend } from "@/components/ui/ClassStatusLegend";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useBatchesQuery } from "@/features/batches/hooks/useBatchesApi";
import { useScheduleCalendarQuery } from "@/features/batch-schedules/hooks/useBatchScheduleApi";
import { CLASS_STATUS_DOT, getStatusLabel } from "@/constants/classes";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import {
  formatFullDate,
  formatTime
} from "@/lib/datetime";

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function zonedDayKey(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date(iso));
  } catch {
    return iso.split("T")[0] ?? "";
  }
}

export function StudentScheduleClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const timeZone = useUserTimeZone();

  const selectedBatchId = searchParams.get("batchId") || "";

  const todayKey = useMemo(() => {
    return zonedDayKey(new Date().toISOString(), timeZone);
  }, [timeZone]);

  // Open on the month that contains "today" in the user's zone, not the
  // browser's — the two disagree near midnight on the first of a month.
  const [cursor, setCursor] = useState(() => {
    const [year, month] = todayKey.split("-").map(Number);
    return { year, month: month - 1 };
  });

  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(todayKey);
  const [activeTab, setActiveTab] = useState<"calendar" | "list">("calendar");

  // Fetch student's batches for filter dropdown
  const { data: batchesData, isLoading: batchesLoading } = useBatchesQuery();
  const batches = batchesData?.batches ?? [];

  // Compute 3-month window for calendar query
  const dateRange = useMemo(() => {
    const from = new Date(Date.UTC(cursor.year, cursor.month - 1, 1)).toISOString();
    const to = new Date(Date.UTC(cursor.year, cursor.month + 2, 0, 23, 59, 59, 999)).toISOString();
    return { from, to };
  }, [cursor.year, cursor.month]);

  const {
    data: calendarData,
    isLoading: calendarLoading,
    error: calendarError,
    refetch: refetchCalendar
  } = useScheduleCalendarQuery({
    from: dateRange.from,
    to: dateRange.to,
    batchId: selectedBatchId || undefined
  });

  const classes = calendarData?.classes ?? [];

  // Group classes by local day key
  const classesByDay = useMemo(() => {
    const map = new Map<string, ScheduleCalendarClass[]>();
    for (const cls of classes) {
      const key = zonedDayKey(cls.startsAt, timeZone);
      const list = map.get(key) ?? [];
      list.push(cls);
      map.set(key, list);
    }
    return map;
  }, [classes, timeZone]);

  // Calendar cells computation
  const firstOfMonth = new Date(Date.UTC(cursor.year, cursor.month, 1));
  const startDay = firstOfMonth.getUTCDay();
  const daysInMonth = new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate();

  const calendarCells: (number | null)[] = [
    ...Array.from({ length: startDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ];
  while (calendarCells.length % 7 !== 0) calendarCells.push(null);

  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric"
  }).format(firstOfMonth);

  const shiftMonth = (delta: number) => {
    setCursor((c) => {
      const d = new Date(Date.UTC(c.year, c.month + delta, 1));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    });
  };

  const handleBatchChange = (batchId: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (batchId) {
      params.set("batchId", batchId);
    } else {
      params.delete("batchId");
    }
    router.replace(`/student/schedule${params.toString() ? `?${params.toString()}` : ""}`);
  };

  // Filtered classes for day view
  const selectedDayClasses = selectedDayKey
    ? classesByDay.get(selectedDayKey) ?? []
    : [];

  // Chronological upcoming list — live or scheduled and not over. Cancelled
  // classes stay on the calendar (marked) but are never "upcoming".
  const upcomingClassesList = useMemo(() => {
    const now = Date.now();
    return [...classes]
      .filter((c) => isUpcomingClass(c, now))
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }, [classes]);

  const batchOptions = [
    { label: "All My Batches", value: "" },
    ...batches.map((b) => ({ label: b.name, value: b.id }))
  ];

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      <PageHeader
        title="Schedule"
        description="View your upcoming batch sessions, coaching timetables, and calendar occurrences."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="primary">
              <Link href="/student/live-classes">
                <Video aria-hidden="true" className="size-4" strokeWidth={2.5} />
                Live Classes
              </Link>
            </Button>
          </div>
        }
      />

      {/* Filter and View Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:w-72">
          <Select
            value={selectedBatchId}
            options={batchOptions}
            onChange={(e) => handleBatchChange(e.target.value)}
            disabled={batchesLoading}
          />
        </div>

        <div className="flex items-center gap-1 rounded-control bg-app-soft p-1">
          <Button
            size="sm"
            variant={activeTab === "calendar" ? "primary" : "ghost"}
            className="text-xs h-8 px-3"
            onClick={() => setActiveTab("calendar")}
          >
            <Calendar className="size-3.5 mr-1.5" strokeWidth={2.25} />
            Calendar View
          </Button>
          <Button
            size="sm"
            variant={activeTab === "list" ? "primary" : "ghost"}
            className="text-xs h-8 px-3"
            onClick={() => setActiveTab("list")}
          >
            <CalendarDays className="size-3.5 mr-1.5" strokeWidth={2.25} />
            Upcoming List ({upcomingClassesList.length})
          </Button>
        </div>
      </div>

      {calendarLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-96 rounded-app" />
        </div>
      ) : calendarError ? (
        <WidgetError
          message="Could not load your schedule calendar. Please check your connection."
          onRetry={() => refetchCalendar()}
        />
      ) : activeTab === "calendar" ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          {/* Calendar Widget (7 cols on large screens) */}
          <Card className="lg:col-span-7 p-4 sm:p-6 shadow-card space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-app-text">{monthLabel}</h2>
              <div className="flex items-center gap-1">
                <Button
                  aria-label="Previous month"
                  variant="outline"
                  size="icon"
                  className="size-8 rounded-full"
                  onClick={() => shiftMonth(-1)}
                >
                  <ChevronLeft className="size-4" strokeWidth={2.5} />
                </Button>
                <Button
                  aria-label="Next month"
                  variant="outline"
                  size="icon"
                  className="size-8 rounded-full"
                  onClick={() => shiftMonth(1)}
                >
                  <ChevronRight className="size-4" strokeWidth={2.5} />
                </Button>
              </div>
            </div>

            {/* Day Header Row */}
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-app-muted">
              {DAY_SHORT.map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar Days Grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarCells.map((day, i) => {
                if (day == null) {
                  return (
                    <div
                      key={`empty-${i}`}
                      className="min-h-12 rounded-control bg-app-surface/20"
                    />
                  );
                }

                const dayKey = `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const dayClasses = classesByDay.get(dayKey) ?? [];
                const isSelected = selectedDayKey === dayKey;
                const isToday = todayKey === dayKey;

                return (
                  <button
                    key={dayKey}
                    type="button"
                    onClick={() => setSelectedDayKey(dayKey)}
                    className={`min-h-14 p-1.5 flex flex-col justify-between items-center rounded-control border text-xs transition ${
                      isSelected
                        ? "border-primary bg-primary/10 shadow-card"
                        : isToday
                        ? "border-accent bg-accent/10"
                        : "border-transparent bg-app-soft/40 hover:bg-app-soft hover:border-app-border"
                    }`}
                  >
                    <span
                      className={`size-6 flex items-center justify-center rounded-full text-xs font-bold ${
                        isToday
                          ? "bg-accent text-accent-ink"
                          : isSelected
                          ? "bg-primary text-primary-ink"
                          : "text-app-text"
                      }`}
                    >
                      {day}
                    </span>

                    {/* Dot indicators for classes */}
                    <div className="flex items-center gap-1 mt-1 flex-wrap justify-center min-h-2">
                      {dayClasses.slice(0, 3).map((c) => {
                        const shown = resolveClassDisplayStatus(c);
                        return (
                          <span
                            key={c.id}
                            className={`size-1.5 rounded-full ${CLASS_STATUS_DOT[shown]} ${
                              shown === "LIVE" ? "motion-safe:animate-pulse" : ""
                            }`}
                            title={`${c.title} (${getStatusLabel(shown)})`}
                          />
                        );
                      })}
                      {dayClasses.length > 3 && (
                        <span className="text-[9px] font-bold text-app-muted leading-none">
                          +{dayClasses.length - 3}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="pt-3 border-t border-app-border flex flex-wrap items-center justify-between text-xs text-app-muted gap-2">
              <ClassStatusLegend />
              {selectedDayKey && (
                <button
                  type="button"
                  onClick={() => setSelectedDayKey(todayKey)}
                  className="font-semibold text-primary hover:underline"
                >
                  Jump to Today
                </button>
              )}
            </div>
          </Card>

          {/* Selected Date Detail Roster (5 cols on large screens) */}
          <div className="lg:col-span-5 space-y-4">
            <Card className="p-5 shadow-card space-y-4">
              <div className="border-b border-app-border pb-3">
                <span className="text-xs font-bold text-app-muted">
                  Schedule Details
                </span>
                <h3 className="text-lg font-bold text-app-text mt-0.5">
                  {selectedDayKey ? formatFullDate(selectedDayKey, "UTC") : "Select a day"}
                </h3>
              </div>

              {selectedDayClasses.length === 0 ? (
                <div className="py-8 text-center text-sm text-app-muted">
                  No classes scheduled on this day.
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedDayClasses.map((cls) => {
                    const startStr = formatTime(cls.startsAt, timeZone);
                    const endStr = formatTime(cls.endsAt, timeZone);
                    const durationMins = Math.round(
                      (new Date(cls.endsAt).getTime() - new Date(cls.startsAt).getTime()) / 60000
                    );

                    return (
                      <div
                        key={cls.id}
                        className="rounded-app border border-app-border bg-app-surface p-4 space-y-3 hover:border-primary/40 transition-colors shadow-card"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="font-bold text-base text-app-text truncate">
                              {cls.title}
                            </h4>
                            <p className="text-xs font-medium text-app-muted truncate">
                              {cls.batchName}
                            </p>
                          </div>
                          <ClassStatusBadge endsAt={cls.endsAt} status={cls.status} />
                        </div>

                        <div className="space-y-1.5 text-xs text-app-muted">
                          <div className="flex items-center gap-2">
                            <Clock aria-hidden="true" className="size-3.5 text-primary" strokeWidth={2.5} />
                            <span>
                              {startStr} – {endStr} ({durationMins} min)
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <GraduationCap aria-hidden="true" className="size-3.5 text-accent" strokeWidth={2.5} />
                            <span>Coach: {cls.coachName}</span>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-app-border">
                          {canJoinClass(cls) ? (
                            <Button asChild size="sm" variant="destructive" className="w-full">
                              <Link href={`/live-class/${cls.id}`}>
                                <Play aria-hidden="true" className="size-3.5 fill-current" strokeWidth={2.5} />
                                Join Live Class
                              </Link>
                            </Button>
                          ) : (
                            <Button asChild size="sm" variant="outline" className="w-full">
                              <Link href={`/classes/${cls.id}`}>
                                View Details
                                <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
                              </Link>
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          </div>
        </div>
      ) : (
        /* List View */
        <Card className="p-6 shadow-card">
          {upcomingClassesList.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No upcoming classes found"
              description="No classes match your current batch filter."
            />
          ) : (
            <div className="divide-y divide-app-border">
              {upcomingClassesList.map((cls) => {
                const dateStr = formatFullDate(cls.startsAt, timeZone);
                const timeStr = `${formatTime(cls.startsAt, timeZone)} – ${formatTime(cls.endsAt, timeZone)}`;

                return (
                  <div
                    key={cls.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 py-4 first:pt-0 last:pb-0"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-base text-app-text truncate">{cls.title}</h4>
                        <ClassStatusBadge endsAt={cls.endsAt} status={cls.status} />
                      </div>
                      <p className="text-xs text-app-muted">
                        <span className="font-semibold text-app-text">{cls.batchName}</span> · Coach {cls.coachName}
                      </p>
                      <p className="text-xs text-app-muted flex items-center gap-2">
                        <Calendar className="size-3.5 text-primary" strokeWidth={2.25} />
                        <span>{dateStr}</span>
                        <span>·</span>
                        <Clock className="size-3.5 text-primary" strokeWidth={2.25} />
                        <span>{timeStr}</span>
                      </p>
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      {canJoinClass(cls) ? (
                        <Button asChild variant="destructive" size="sm">
                          <Link href={`/live-class/${cls.id}`}>
                            <Play aria-hidden="true" className="size-3.5 fill-current" strokeWidth={2.5} />
                            Join Live
                          </Link>
                        </Button>
                      ) : (
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/classes/${cls.id}`}>
                            View Details
                            <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

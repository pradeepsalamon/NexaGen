"use client";

import { useMemo, useState } from "react";
import { CalendarClock, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { resolveClassDisplayStatus, type CoachClass } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ClassStatusLegend } from "@/components/ui/ClassStatusLegend";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { CLASS_STATUS_DOT, getStatusLabel } from "@/constants/classes";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDate, formatLongDate, formatTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { useCalendarClasses } from "../hooks/useCoachApi";
import {
  fetchRange,
  isSameMonth,
  shiftAnchor,
  startOfMonth,
  startOfWeek,
  visibleDays,
  zonedDayKey,
  type CalendarView
} from "../lib/scheduleCalendar";
import { ClassCard } from "./ClassCard";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Day keys are dates, so they format in UTC (never drift a day). */
const fmtKey = (key: string, options: Intl.DateTimeFormatOptions) => formatDate(key, "UTC", options);

function rangeLabel(view: CalendarView, days: string[], anchor: string): string {
  if (view === "month") return fmtKey(anchor, { month: "long", year: "numeric" });
  const first = days[0];
  const last = days[days.length - 1];
  if (first.slice(0, 4) !== last.slice(0, 4)) {
    const full = { day: "numeric", month: "short", year: "numeric" } as const;
    return `${fmtKey(first, full)} – ${fmtKey(last, full)}`;
  }
  const year = first.slice(0, 4);
  if (isSameMonth(first, last)) {
    return `${fmtKey(first, { day: "numeric", month: "short" })} – ${fmtKey(last, { day: "numeric" })}, ${year}`;
  }
  return `${fmtKey(first, { day: "numeric", month: "short" })} – ${fmtKey(last, { day: "numeric", month: "short" })}, ${year}`;
}

function classTitle(cls: CoachClass): string {
  return cls.title || cls.topic || "Regular Session";
}

/** "Aarav S., Diya K. +3" — who is in the class, short enough for a chip. */
function studentSummary(cls: CoachClass, max = 2): string {
  if (cls.students.length === 0) return "No students";
  const names = cls.students.map((s) => (s.lastName ? `${s.firstName} ${s.lastName.charAt(0)}.` : s.firstName));
  const shown = names.slice(0, max).join(", ");
  return names.length > max ? `${shown} +${names.length - max}` : shown;
}

function StatusDot({ cls }: { cls: CoachClass }) {
  const shown = resolveClassDisplayStatus(cls);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-2 shrink-0 rounded-full",
        CLASS_STATUS_DOT[shown],
        shown === "LIVE" && "motion-safe:animate-pulse"
      )}
    />
  );
}

/** One class on the calendar. `compact` = the month grid's one-line chip. */
function ClassChip({
  cls,
  compact = false,
  onOpen,
  timeZone
}: {
  cls: CoachClass;
  compact?: boolean;
  onOpen: (cls: CoachClass) => void;
  timeZone: string;
}) {
  const shown = resolveClassDisplayStatus(cls);
  const cancelled = shown === "CANCELLED";
  const time = `${formatTime(cls.startsAt, timeZone)} – ${formatTime(cls.endsAt, timeZone)}`;
  const label = `${classTitle(cls)}, ${cls.batchName}, ${time}, ${getStatusLabel(shown)}`;

  if (compact) {
    return (
      <button
        type="button"
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation();
          onOpen(cls);
        }}
        className="flex w-full min-w-0 items-center gap-1 rounded-control bg-primary/10 px-1.5 py-0.5 text-left text-xs text-app-text transition-colors hover:bg-primary/20"
      >
        <StatusDot cls={cls} />
        <span className="shrink-0 font-semibold tabular-nums">{formatTime(cls.startsAt, timeZone)}</span>
        <span className={cn("min-w-0 truncate", cancelled && "line-through text-app-muted")}>{classTitle(cls)}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => onOpen(cls)}
      className="grid w-full min-w-0 gap-0.5 rounded-control border border-app-border bg-app-surface p-2 text-left text-xs shadow-card transition-colors hover:border-primary/50"
    >
      <span className="flex items-center gap-1.5 font-semibold tabular-nums text-app-text">
        <StatusDot cls={cls} />
        {time}
      </span>
      <span className={cn("truncate text-sm font-bold text-app-text", cancelled && "line-through text-app-muted")}>
        {classTitle(cls)}
      </span>
      <span className="truncate text-app-muted">{cls.batchName}</span>
      <span className="flex min-w-0 items-center gap-1 text-app-muted">
        <Users aria-hidden="true" className="size-3 shrink-0" strokeWidth={2.5} />
        <span className="truncate">{studentSummary(cls)}</span>
      </span>
    </button>
  );
}

interface CoachScheduleCalendarProps {
  view: CalendarView;
  onEdit: (cls: CoachClass) => void;
  onCancel: (cls: CoachClass) => void;
  onRequestReschedule: (cls: CoachClass) => void;
}

/**
 * Week / month calendar of the coach's own classes, every status, read from
 * `GET coach.calendarClasses` for the visible range. Clicking a class opens its
 * `ClassCard`, so start / notes / reschedule / cancel work exactly as in the list.
 */
export function CoachScheduleCalendar({ view, onEdit, onCancel, onRequestReschedule }: CoachScheduleCalendarProps) {
  const timeZone = useUserTimeZone();
  const todayKey = zonedDayKey(Date.now(), timeZone);

  // One anchor day for both views; each view reads its own week / month off it.
  const [anchor, setAnchor] = useState(todayKey);
  const [selectedDay, setSelectedDay] = useState(todayKey);
  const [openClass, setOpenClass] = useState<CoachClass | null>(null);

  const viewAnchor = view === "week" ? startOfWeek(anchor) : startOfMonth(anchor);
  const days = useMemo(() => visibleDays(view, viewAnchor), [view, viewAnchor]);
  const { from, to } = useMemo(() => fetchRange(days), [days]);
  const { data, isLoading, isError, isPlaceholderData, refetch } = useCalendarClasses(from, to);

  const classesByDay = useMemo(() => {
    const map = new Map<string, CoachClass[]>();
    for (const cls of data?.classes ?? []) {
      const key = zonedDayKey(cls.startsAt, timeZone);
      const list = map.get(key) ?? [];
      list.push(cls);
      map.set(key, list);
    }
    return map;
  }, [data, timeZone]);

  const showsToday = days.includes(todayKey) && (view === "week" || isSameMonth(viewAnchor, todayKey));
  const visibleCount = days.reduce(
    (n, day) => n + (view === "month" && !isSameMonth(day, viewAnchor) ? 0 : classesByDay.get(day)?.length ?? 0),
    0
  );

  const step = (delta: number) => {
    const next = shiftAnchor(view, viewAnchor, delta);
    setAnchor(next);
    // Keep the month's detail panel on a day that is actually in view.
    setSelectedDay(isSameMonth(next, todayKey) && view === "month" ? todayKey : next);
  };
  const goToday = () => {
    setAnchor(todayKey);
    setSelectedDay(todayKey);
  };

  // Close the dialog first so the action's own dialog doesn't stack on it.
  const closeThen = (fn: (cls: CoachClass) => void) => (cls: CoachClass) => {
    setOpenClass(null);
    fn(cls);
  };

  const unit = view === "week" ? "week" : "month";
  const selectedClasses = classesByDay.get(selectedDay) ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-app-text" aria-live="polite">
          {rangeLabel(view, days, viewAnchor)}
        </h2>
        <div className="flex items-center gap-1">
          <Button
            aria-label={`Previous ${unit}`}
            variant="outline"
            size="icon"
            className="size-8 rounded-full"
            onClick={() => step(-1)}
          >
            <ChevronLeft className="size-4" strokeWidth={2.5} />
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={goToday} disabled={showsToday && (view === "week" || selectedDay === todayKey)}>
            Today
          </Button>
          <Button
            aria-label={`Next ${unit}`}
            variant="outline"
            size="icon"
            className="size-8 rounded-full"
            onClick={() => step(1)}
          >
            <ChevronRight className="size-4" strokeWidth={2.5} />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-96 rounded-app" />
      ) : isError ? (
        <WidgetError message="Could not load your schedule." onRetry={() => refetch()} />
      ) : (
        <div className={cn("space-y-4 transition-opacity", isPlaceholderData && "opacity-60")}>
          {view === "week" ? (
            <div className="grid grid-cols-1 gap-2 lg:grid-cols-7">
              {days.map((day) => {
                const dayClasses = classesByDay.get(day) ?? [];
                const isToday = day === todayKey;
                return (
                  <section
                    key={day}
                    aria-label={formatLongDate(day, "UTC")}
                    className={cn(
                      "min-w-0 rounded-panel border bg-app-soft/40 p-2",
                      isToday ? "border-accent bg-accent/10" : "border-app-border"
                    )}
                  >
                    <header className="mb-2 flex items-center gap-2 lg:flex-col lg:items-start lg:gap-0.5">
                      <span className="text-xs font-bold text-app-muted">
                        {WEEKDAYS[days.indexOf(day)]}
                      </span>
                      <span
                        className={cn(
                          "flex size-7 items-center justify-center rounded-full text-sm font-bold",
                          isToday ? "bg-accent text-accent-ink" : "text-app-text"
                        )}
                      >
                        {fmtKey(day, { day: "numeric" })}
                      </span>
                      <span className="text-xs text-app-muted lg:hidden">{fmtKey(day, { month: "short" })}</span>
                    </header>
                    {dayClasses.length === 0 ? (
                      <p className="py-1 text-xs text-app-muted lg:py-4 lg:text-center">No classes</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
                        {dayClasses.map((cls) => (
                          <ClassChip key={cls.id} cls={cls} onOpen={setOpenClass} timeZone={timeZone} />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          ) : (
            <Card className="space-y-2 p-2 shadow-card sm:p-4">
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-app-muted">
                {WEEKDAYS.map((d) => (
                  <div key={d} className="py-1">
                    {d}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {days.map((day) => {
                  const dayClasses = classesByDay.get(day) ?? [];
                  const inMonth = isSameMonth(day, viewAnchor);
                  const isToday = day === todayKey;
                  const isSelected = day === selectedDay;
                  return (
                    <div
                      key={day}
                      onClick={() => setSelectedDay(day)}
                      className={cn(
                        "flex min-h-14 min-w-0 cursor-pointer flex-col gap-1 rounded-control border p-1 transition-colors sm:min-h-24",
                        isSelected
                          ? "border-primary bg-primary/10"
                          : isToday
                            ? "border-accent bg-accent/10"
                            : "border-transparent bg-app-soft/40 hover:border-app-border",
                        !inMonth && "opacity-50"
                      )}
                    >
                      <button
                        type="button"
                        aria-label={`${formatLongDate(day, "UTC")}, ${dayClasses.length} class${dayClasses.length === 1 ? "" : "es"}`}
                        aria-pressed={isSelected}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDay(day);
                        }}
                        className={cn(
                          "flex size-6 items-center justify-center self-center rounded-full text-xs font-bold sm:self-start",
                          isToday ? "bg-accent text-accent-ink" : "text-app-text"
                        )}
                      >
                        {fmtKey(day, { day: "numeric" })}
                      </button>
                      {/* Phones: dots; wider screens: the first classes as chips. */}
                      <div className="flex flex-wrap justify-center gap-0.5 sm:hidden">
                        {dayClasses.slice(0, 3).map((cls) => (
                          <StatusDot key={cls.id} cls={cls} />
                        ))}
                      </div>
                      <div className="hidden min-w-0 gap-0.5 sm:grid">
                        {dayClasses.slice(0, 2).map((cls) => (
                          <ClassChip key={cls.id} cls={cls} compact onOpen={setOpenClass} timeZone={timeZone} />
                        ))}
                      </div>
                      {dayClasses.length > 2 && (
                        <span className="hidden px-1 text-xs font-semibold text-app-muted sm:block">
                          +{dayClasses.length - 2} more
                        </span>
                      )}
                      {dayClasses.length > 3 && (
                        <span className="text-center text-xs font-semibold leading-none text-app-muted sm:hidden">
                          +{dayClasses.length - 3}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <ClassStatusLegend />

          {visibleCount === 0 && (
            <p className="flex items-center gap-2 text-sm text-app-muted">
              <CalendarClock aria-hidden="true" className="size-4" strokeWidth={2.5} />
              No classes this {unit}.
            </p>
          )}

          {view === "month" && (
            <section className="space-y-3">
              <h3 className="text-base font-bold text-app-text">{formatLongDate(selectedDay, "UTC")}</h3>
              {selectedClasses.length === 0 ? (
                <Card className="p-6 text-center text-sm text-app-muted">No classes scheduled on this day.</Card>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {selectedClasses.map((cls) => (
                    <ClassCard
                      key={cls.id}
                      classItem={cls}
                      onEdit={onEdit}
                      onCancel={onCancel}
                      onRequestReschedule={onRequestReschedule}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      <Dialog open={!!openClass} onOpenChange={(open) => !open && setOpenClass(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{openClass ? classTitle(openClass) : "Class"}</DialogTitle>
            <DialogDescription>
              {openClass ? formatLongDate(openClass.startsAt, timeZone) : null}
            </DialogDescription>
          </DialogHeader>
          {openClass && (
            <div className="space-y-4">
              <ClassCard
                classItem={openClass}
                onEdit={closeThen(onEdit)}
                onCancel={closeThen(onCancel)}
                onRequestReschedule={closeThen(onRequestReschedule)}
              />
              <div>
                <p className="mb-1.5 text-sm font-semibold text-app-text">
                  Students ({openClass.students.length})
                </p>
                {openClass.students.length === 0 ? (
                  <p className="text-sm text-app-muted">No students in this batch yet.</p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {openClass.students.map((s) => (
                      <li key={s.id} className="rounded-full bg-app-soft px-2.5 py-0.5 text-xs font-medium text-app-text">
                        {[s.firstName, s.lastName].filter(Boolean).join(" ")}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

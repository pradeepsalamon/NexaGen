"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Users } from "lucide-react";
import { resolveClassDisplayStatus, type CoachClass } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ClassRowList } from "@/components/ui/ClassRow";
import { ClassStatusLegend } from "@/components/ui/ClassStatusLegend";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScheduleCalendar } from "@/components/ui/ScheduleCalendar";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { CLASS_STATUS_DOT, getStatusLabel } from "@/constants/classes";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDate, formatLongDate, formatTime } from "@/lib/datetime";
import {
  fetchRange,
  groupByDay,
  isSameMonth,
  shiftAnchor,
  startOfMonth,
  startOfWeek,
  visibleDays,
  zonedDayKey,
  type CalendarView
} from "@/lib/scheduleCalendar";
import { cn } from "@/lib/utils";
import { useCalendarClasses } from "../hooks/useCoachApi";
import { CoachClassRow, coachClassTitle, type CoachClassActions } from "./CoachClassRow";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Day keys are dates, so they format in UTC (never drift a day). */
const fmtKey = (key: string, options: Intl.DateTimeFormatOptions) => formatDate(key, "UTC", options);

function weekLabel(days: string[]): string {
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

/** One class in a week column. */
function ClassChip({ cls, onOpen, timeZone }: { cls: CoachClass; onOpen: (cls: CoachClass) => void; timeZone: string }) {
  const shown = resolveClassDisplayStatus(cls);
  const cancelled = shown === "CANCELLED";
  const time = `${formatTime(cls.startsAt, timeZone)} – ${formatTime(cls.endsAt, timeZone)}`;
  const title = coachClassTitle(cls);

  return (
    <button
      aria-label={`${title}, ${cls.batchName}, ${time}, ${getStatusLabel(shown)}`}
      className="grid w-full min-w-0 gap-0.5 rounded-control border border-app-border bg-app-surface p-2 text-left text-xs transition-colors hover:border-primary/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
      onClick={() => onOpen(cls)}
      type="button"
    >
      <span className="flex items-center gap-1.5 font-semibold tabular-nums text-app-text">
        <StatusDot cls={cls} />
        {time}
      </span>
      <span className={cn("truncate text-sm font-semibold text-app-text", cancelled && "text-app-muted line-through")}>
        {title}
      </span>
      {title !== cls.batchName ? <span className="truncate text-app-muted">{cls.batchName}</span> : null}
      <span className="flex min-w-0 items-center gap-1 text-app-muted">
        <Users aria-hidden="true" className="size-3 shrink-0" strokeWidth={2.5} />
        <span className="truncate">{studentSummary(cls)}</span>
      </span>
    </button>
  );
}

/**
 * Week / month calendar of the coach's own classes, every status, read from
 * `GET coach.calendarClasses` for the visible range. A class opens as a
 * `CoachClassRow`, so start / notes / reschedule / cancel work exactly as in the list.
 */
export function CoachScheduleCalendar({ view, ...actions }: CoachClassActions & { view: CalendarView }) {
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
  const classesByDay = useMemo(() => groupByDay(data?.classes ?? [], timeZone), [data, timeZone]);

  const stepWeek = (delta: number) => {
    const next = shiftAnchor("week", viewAnchor, delta);
    setAnchor(next);
    setSelectedDay(next);
  };
  const showMonth = (month: string) => {
    setAnchor(month);
    setSelectedDay(isSameMonth(month, todayKey) ? todayKey : month);
  };
  const selectDay = (day: string) => {
    setSelectedDay(day);
    setAnchor(day);
  };

  // Close the dialog first so the action's own dialog doesn't stack on it.
  const closeThen = (fn?: (cls: CoachClass) => void) =>
    fn
      ? (cls: CoachClass) => {
          setOpenClass(null);
          fn(cls);
        }
      : undefined;

  const selectedClasses = classesByDay.get(selectedDay) ?? [];
  const weekCount = view === "week" ? days.reduce((n, day) => n + (classesByDay.get(day)?.length ?? 0), 0) : 0;

  if (isLoading) return <Skeleton className="h-96 rounded-app" />;
  if (isError) {
    return (
      <WidgetError
        message="Couldn't load your schedule. Check your connection and try again."
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <div className={cn("transition-opacity", isPlaceholderData && "opacity-60")}>
      {view === "week" ? (
        <Card className="space-y-3 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 aria-live="polite" className="text-base font-semibold text-app-text">
              {weekLabel(days)}
            </h2>
            <div className="flex items-center gap-1">
              <Button aria-label="Previous week" onClick={() => stepWeek(-1)} size="icon" variant="neutral">
                <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={2.5} />
              </Button>
              <Button disabled={days.includes(todayKey)} onClick={() => selectDay(todayKey)} size="sm" variant="outline">
                Today
              </Button>
              <Button aria-label="Next week" onClick={() => stepWeek(1)} size="icon" variant="neutral">
                <ChevronRight aria-hidden="true" className="size-4" strokeWidth={2.5} />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 lg:grid-cols-7">
            {days.map((day, index) => {
              const dayClasses = classesByDay.get(day) ?? [];
              const isToday = day === todayKey;
              return (
                <section
                  aria-current={isToday ? "date" : undefined}
                  aria-label={formatLongDate(day, "UTC")}
                  className={cn(
                    "min-w-0 rounded-control border p-2",
                    isToday ? "border-primary/40 bg-primary-soft" : "border-transparent bg-app-soft"
                  )}
                  key={day}
                >
                  <header className="mb-2 flex items-center gap-2 lg:flex-col lg:items-start lg:gap-0.5">
                    <span className="text-xs font-semibold text-app-muted">{WEEKDAYS[index]}</span>
                    <span
                      className={cn(
                        "flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                        isToday ? "bg-primary text-on-primary" : "text-app-text"
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
                        <ClassChip cls={cls} key={cls.id} onOpen={setOpenClass} timeZone={timeZone} />
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-app-border pt-3">
            <ClassStatusLegend />
            {weekCount === 0 ? <p className="text-xs text-app-muted">No classes this week.</p> : null}
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-7">
            <ScheduleCalendar
              classesByDay={classesByDay}
              month={viewAnchor}
              onMonthChange={showMonth}
              onSelectDay={selectDay}
              selectedDay={selectedDay}
              today={todayKey}
            />
          </div>
          <div className="min-w-0 lg:col-span-5">
            <SectionCard title={formatLongDate(selectedDay, "UTC")}>
              {selectedClasses.length === 0 ? (
                <EmptyState icon={CalendarDays} title="No classes on this day" variant="inline" />
              ) : (
                <ClassRowList>
                  {selectedClasses.map((cls) => (
                    <CoachClassRow cls={cls} key={cls.id} showDate={false} {...actions} />
                  ))}
                </ClassRowList>
              )}
            </SectionCard>
          </div>
        </div>
      )}

      <Dialog onOpenChange={(open) => !open && setOpenClass(null)} open={!!openClass}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{openClass ? coachClassTitle(openClass) : "Class"}</DialogTitle>
            <DialogDescription>{openClass ? formatLongDate(openClass.startsAt, timeZone) : null}</DialogDescription>
          </DialogHeader>
          {openClass ? (
            <div className="space-y-4">
              <ClassRowList>
                <CoachClassRow
                  cls={openClass}
                  onCancel={closeThen(actions.onCancel)}
                  onEdit={closeThen(actions.onEdit)}
                  onRequestReschedule={closeThen(actions.onRequestReschedule)}
                  onRequestSubstitute={closeThen(actions.onRequestSubstitute)}
                  showDate={false}
                />
              </ClassRowList>
              <div className="border-t border-app-border pt-4">
                <p className="mb-2 text-xs font-semibold text-app-muted">Students ({openClass.students.length})</p>
                {openClass.students.length === 0 ? (
                  <p className="text-sm text-app-muted">No students in this batch yet.</p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {openClass.students.map((s) => (
                      <li className="rounded-full bg-app-soft px-2.5 py-0.5 text-xs font-medium text-app-text" key={s.id}>
                        {[s.firstName, s.lastName].filter(Boolean).join(" ")}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

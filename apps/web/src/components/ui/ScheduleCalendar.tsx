"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { resolveClassDisplayStatus, type ClassDisplayStatus, type ClassTiming } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ClassStatusLegend } from "@/components/ui/ClassStatusLegend";
import { CLASS_STATUS_DOT } from "@/constants/classes";
import { formatDate, formatLongDate } from "@/lib/datetime";
import { addMonths, isSameMonth, monthGridDays } from "@/lib/scheduleCalendar";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_DOTS = 3;

// A day only has room for a few dots, so a live class never hides behind cancelled ones.
const DOT_ORDER: Record<ClassDisplayStatus, number> = {
  LIVE: 0,
  SCHEDULED: 1,
  NOT_HELD: 2,
  COMPLETED: 3,
  CANCELLED: 4
};

type CalendarClass = ClassTiming & { id: string };

function byImportance<T extends CalendarClass>(classes: T[]): T[] {
  return [...classes].sort(
    (a, b) => DOT_ORDER[resolveClassDisplayStatus(a)] - DOT_ORDER[resolveClassDisplayStatus(b)]
  );
}

interface ScheduleCalendarProps<T extends CalendarClass> {
  /** From `groupByDay`. */
  classesByDay: Map<string, T[]>;
  /** Any day key in the month on show. */
  month: string;
  onMonthChange: (month: string) => void;
  onSelectDay: (day: string) => void;
  selectedDay: string;
  /** Today's day key in the viewer's zone (`zonedDayKey`). */
  today: string;
}

/** Month grid of classes. The caller shows the selected day's classes beside it. */
export function ScheduleCalendar<T extends CalendarClass>({
  classesByDay,
  month,
  onMonthChange,
  onSelectDay,
  selectedDay,
  today
}: ScheduleCalendarProps<T>) {
  const days = useMemo(() => monthGridDays(month), [month]);

  return (
    <Card className="space-y-3 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 aria-live="polite" className="text-base font-semibold text-app-text">
          {formatDate(month, "UTC", { month: "long", year: "numeric" })}
        </h2>
        <div className="flex items-center gap-1">
          <Button aria-label="Previous month" onClick={() => onMonthChange(addMonths(month, -1))} size="icon" variant="neutral">
            <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={2.5} />
          </Button>
          <Button
            disabled={selectedDay === today && isSameMonth(month, today)}
            onClick={() => onSelectDay(today)}
            size="sm"
            variant="outline"
          >
            Today
          </Button>
          <Button aria-label="Next month" onClick={() => onMonthChange(addMonths(month, 1))} size="icon" variant="neutral">
            <ChevronRight aria-hidden="true" className="size-4" strokeWidth={2.5} />
          </Button>
        </div>
      </div>

      <div>
        <div aria-hidden="true" className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-app-muted">
          {WEEKDAYS.map((weekday) => (
            <div className="py-1" key={weekday}>
              {weekday}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const dayClasses = classesByDay.get(day) ?? [];
            const count = dayClasses.length;
            const inMonth = isSameMonth(day, month);
            const isSelected = day === selectedDay;
            const isToday = day === today;
            return (
              <button
                aria-current={isToday ? "date" : undefined}
                aria-label={`${formatLongDate(day, "UTC")}, ${count} class${count === 1 ? "" : "es"}`}
                aria-pressed={isSelected}
                className={cn(
                  "flex min-h-14 min-w-0 flex-col items-center gap-1 rounded-control border p-1 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus sm:min-h-16",
                  isSelected ? "border-primary bg-primary-soft" : "border-transparent hover:bg-app-soft"
                )}
                key={day}
                onClick={() => onSelectDay(day)}
                type="button"
              >
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                    isSelected
                      ? "bg-primary text-on-primary"
                      : isToday
                        ? "text-primary-ink ring-1 ring-inset ring-primary"
                        : inMonth
                          ? "text-app-text"
                          : "text-app-subtle"
                  )}
                >
                  {formatDate(day, "UTC", { day: "numeric" })}
                </span>
                <span className={cn("flex flex-wrap items-center justify-center gap-0.5", !inMonth && "opacity-50")}>
                  {byImportance(dayClasses).slice(0, MAX_DOTS).map((cls) => {
                    const shown = resolveClassDisplayStatus(cls);
                    return (
                      <span
                        className={cn(
                          "size-2 rounded-full",
                          CLASS_STATUS_DOT[shown],
                          shown === "LIVE" && "motion-safe:animate-pulse"
                        )}
                        key={cls.id}
                      />
                    );
                  })}
                  {count > MAX_DOTS ? (
                    <span className="text-xs font-semibold leading-none text-app-muted">+{count - MAX_DOTS}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <ClassStatusLegend className="border-t border-app-border pt-3" />
    </Card>
  );
}

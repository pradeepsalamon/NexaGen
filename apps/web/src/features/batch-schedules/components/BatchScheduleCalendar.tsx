"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { resolveClassDisplayStatus, type ScheduleCalendarClass } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ClassStatusLegend } from "@/components/ui/ClassStatusLegend";
import { CLASS_STATUS_DOT, getStatusLabel } from "@/constants/classes";
import { DAY_SHORT, formatInZone } from "../lib/scheduleFormat";

/** Local Y-M-D key for a class, computed in the schedule timezone. */
function zonedDayKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(iso));
}

export function BatchScheduleCalendar({
  classes,
  timezone,
  onSelectClass
}: {
  classes: ScheduleCalendarClass[];
  timezone: string;
  onSelectClass?: (cls: ScheduleCalendarClass) => void;
}) {
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const byDay = useMemo(() => {
    const map = new Map<string, ScheduleCalendarClass[]>();
    for (const cls of classes) {
      const key = zonedDayKey(cls.startsAt, timezone);
      const list = map.get(key) ?? [];
      list.push(cls);
      map.set(key, list);
    }
    return map;
  }, [classes, timezone]);

  const firstOfMonth = new Date(Date.UTC(cursor.year, cursor.month, 1));
  const startDay = firstOfMonth.getUTCDay();
  const daysInMonth = new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: startDay }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric"
  }).format(firstOfMonth);

  const shift = (delta: number) =>
    setCursor((c) => {
      const d = new Date(Date.UTC(c.year, c.month + delta, 1));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
    });

  return (
    <Card className="grid gap-3 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-extrabold text-app-text">{monthLabel}</p>
        <div className="flex gap-1">
          <Button aria-label="Previous month" variant="outline" size="icon" className="size-9" onClick={() => shift(-1)}>
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <Button aria-label="Next month" variant="outline" size="icon" className="size-9" onClick={() => shift(1)}>
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-app-muted">
        {DAY_SHORT.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          const key =
            day != null
              ? `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
              : null;
          const items = key ? byDay.get(key) ?? [] : [];
          return (
            <div
              key={i}
              className={`min-h-20 rounded-control border p-1 text-left ${
                day == null ? "border-transparent" : "border-app-border bg-app-background"
              }`}
            >
              {day != null && (
                <>
                  <div className="text-[11px] font-bold text-app-muted">{day}</div>
                  <div className="mt-0.5 grid gap-0.5">
                    {items.slice(0, 3).map((cls) => {
                      const shown = resolveClassDisplayStatus(cls);
                      return (
                      <button
                        key={cls.id}
                        onClick={() => onSelectClass?.(cls)}
                        className={`flex items-center gap-1 truncate rounded bg-app-surface px-1 py-0.5 text-left text-[10px] text-app-text hover:bg-app-soft ${
                          shown === "CANCELLED" ? "line-through decoration-app-danger/60" : ""
                        }`}
                        title={`${cls.title} · ${cls.coachName} · ${getStatusLabel(shown)}`}
                      >
                        <span
                          className={`size-1.5 shrink-0 rounded-full ${CLASS_STATUS_DOT[shown]}`}
                        />
                        <span className="truncate">
                          {formatInZone(cls.startsAt, timezone, {
                            month: undefined,
                            day: undefined,
                            hour: "numeric",
                            minute: "2-digit"
                          })}{" "}
                          {cls.title}
                        </span>
                      </button>
                      );
                    })}
                    {items.length > 3 && (
                      <span className="px-1 text-[10px] text-app-muted">+{items.length - 3} more</span>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      <ClassStatusLegend className="border-t border-app-border pt-3" />
    </Card>
  );
}

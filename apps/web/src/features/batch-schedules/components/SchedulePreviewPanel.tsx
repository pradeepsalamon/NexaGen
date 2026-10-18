"use client";

import { AlertTriangle, CalendarCheck, Clock } from "lucide-react";
import type { PreviewBatchScheduleResponse } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DAY_SHORT, formatInZone, formatWallTime } from "../lib/scheduleFormat";

export function SchedulePreviewPanel({
  preview,
  timezone
}: {
  preview: PreviewBatchScheduleResponse;
  timezone: string;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Classes to create" value={String(preview.futureCount)} />
        <Stat
          label="First class"
          value={preview.firstClassAt ? formatInZone(preview.firstClassAt, timezone, { year: undefined }) : "—"}
        />
        <Stat
          label="Last class"
          value={preview.lastClassAt ? formatInZone(preview.lastClassAt, timezone, { year: undefined }) : "—"}
        />
        <Stat
          label="Skipped (in past)"
          value={String(preview.pastCount)}
        />
      </div>

      <Card className="grid gap-2 p-4">
        <p className="flex items-center gap-2 text-sm font-extrabold text-app-text">
          <Clock className="size-4 text-primary-ink" aria-hidden="true" />
          Weekly pattern ({timezone})
        </p>
        <div className="flex flex-wrap gap-2">
          {preview.weeklySummary.map((slot, i) => (
            <div
              key={i}
              className="rounded-control border border-app-border bg-app-background px-3 py-2 text-xs"
            >
              <span className="font-extrabold text-app-text">{DAY_SHORT[slot.dayOfWeek]}</span>{" "}
              <span className="text-app-muted">
                {formatWallTime(slot.startTime)} – {formatWallTime(slot.endTime)}
              </span>
              <div className="text-app-muted">{slot.coachName}</div>
            </div>
          ))}
        </div>
      </Card>

      {preview.conflicts.length > 0 && (
        <Card className="grid gap-2 border-app-danger/40 p-4">
          <p className="flex items-center gap-2 text-sm font-extrabold text-app-danger">
            <AlertTriangle className="size-4" aria-hidden="true" />
            {preview.conflicts.length} scheduling conflict
            {preview.conflicts.length === 1 ? "" : "s"}
          </p>
          <ul className="grid gap-1 text-xs text-app-muted">
            {preview.conflicts.slice(0, 8).map((c, i) => (
              <li key={i}>
                <span className="font-bold text-app-text">
                  {c.type === "COACH" ? c.coachName : "Batch"}
                </span>{" "}
                is already booked on {formatInZone(c.startsAt, timezone)} —{" "}
                &ldquo;{c.conflictingClassTitle}&rdquo;
              </li>
            ))}
            {preview.conflicts.length > 8 && <li>…and {preview.conflicts.length - 8} more</li>}
          </ul>
        </Card>
      )}

      <Card className="grid gap-1 p-4">
        <p className="flex items-center gap-2 text-sm font-extrabold text-app-text">
          <CalendarCheck className="size-4 text-primary-ink" aria-hidden="true" />
          Class plan preview
        </p>
        <div className="max-h-72 overflow-y-auto">
          <ol className="grid gap-1 text-xs">
            {preview.occurrences.map((o, i) => (
              <li
                key={`${o.date}-${o.ruleId}`}
                className={`flex items-center justify-between rounded-control px-2 py-1.5 ${
                  o.isPast ? "opacity-40" : ""
                } ${o.hasConflict ? "bg-app-danger/10" : "odd:bg-app-background"}`}
              >
                <span className="font-mono text-app-muted">#{i + 1}</span>
                <span className="flex-1 px-2 font-medium text-app-text">
                  {formatInZone(o.startsAt, timezone, { weekday: "short" })} –{" "}
                  {formatInZone(o.endsAt, timezone, {
                    month: undefined,
                    day: undefined,
                    weekday: undefined
                  })}
                </span>
                <span className="text-app-muted">{o.coachName}</span>
                {o.hasConflict && (
                  <Badge variant="destructive" className="ml-2">
                    conflict
                  </Badge>
                )}
              </li>
            ))}
          </ol>
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="grid gap-1 p-3">
      <p className="text-xs font-bold text-app-muted">{label}</p>
      <p className="text-lg font-extrabold text-app-text">{value}</p>
    </Card>
  );
}

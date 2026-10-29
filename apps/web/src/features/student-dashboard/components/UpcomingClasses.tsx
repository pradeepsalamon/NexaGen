"use client";

import { ArrowRight, Calendar, Play } from "lucide-react";
import Link from "next/link";
import {
  canJoinClass,
  type StudentDashboardUpcomingClass
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { ClassStatusBadge } from "@/components/ui/ClassStatusBadge";
import { BatchTypeBadge } from "@/features/batches/components/BatchTypeBadge";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import {
  formatDayOfMonth,
  formatMonthShort,
  formatRelativeDay,
  formatTime
} from "@/lib/datetime";

interface UpcomingClassesProps {
  classes?: StudentDashboardUpcomingClass[];
}

function UpcomingClassRow({ cls }: { cls: StudentDashboardUpcomingClass }) {
  const timeZone = useUserTimeZone();
  const joinable = canJoinClass(cls);
  const hintId = `upcoming-${cls.id}-hint`;

  return (
    <li className="flex flex-wrap items-start gap-3.5 py-3.5">
      <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-xl bg-app-soft text-center">
        <span className="text-[0.65rem] font-bold leading-none text-app-muted">
          {formatMonthShort(cls.startsAt, timeZone)}
        </span>
        <span className="mt-0.5 text-base font-extrabold leading-none text-app-text">
          {formatDayOfMonth(cls.startsAt, timeZone)}
        </span>
      </span>

      <div className="min-w-0 flex-1 basis-40">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-bold text-app-text">
            {cls.title}
          </span>
          <ClassStatusBadge status={cls.status} />
        </div>
        {cls.topic ? (
          <p className="truncate text-sm text-app-text">Topic: {cls.topic}</p>
        ) : null}
        <p className="truncate text-xs text-app-muted">
          {formatRelativeDay(cls.startsAt, timeZone)} ·{" "}
          {formatTime(cls.startsAt, timeZone)} –{" "}
          {formatTime(cls.endsAt, timeZone)} · Coach {cls.coachName}
        </p>
        <div className="mt-1.5">
          <BatchTypeBadge type={cls.batchType} />
        </div>
      </div>

      <div className="flex w-full flex-col items-stretch gap-1 sm:w-auto sm:items-end">
        {joinable ? (
          <Button asChild size="sm" variant="destructive">
            <Link href={`/live-class/${cls.id}`}>
              <Play
                aria-hidden="true"
                className="size-3.5 fill-current"
                strokeWidth={2.5}
              />
              Join Class
            </Link>
          </Button>
        ) : (
          <>
            <Button
              aria-describedby={hintId}
              disabled
              size="sm"
              variant="outline"
            >
              <Play aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
              Join Class
            </Button>
            <span
              className="text-center text-xs text-app-muted sm:text-right"
              id={hintId}
            >
              Opens when your coach starts
            </span>
          </>
        )}
        <Link
          className="inline-flex items-center justify-center gap-1 rounded-control text-xs font-semibold text-primary-ink hover:underline sm:justify-end"
          href={`/classes/${cls.id}`}
        >
          View class
          <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
        </Link>
      </div>
    </li>
  );
}

export function UpcomingClasses({ classes = [] }: UpcomingClassesProps) {
  return (
    <div
      className="h-full rounded-2xl border p-4 sm:p-6 flex flex-col transition-colors duration-200 bg-nx-card border-nx-line text-nx-ink shadow-nx-card"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <span
            className="flex size-8 sm:size-9 shrink-0 items-center justify-center rounded-xl border bg-nx-gold-soft border-nx-gold-line text-nx-gold-ink"
          >
            <Calendar aria-hidden="true" className="size-4" strokeWidth={2.1} />
          </span>
          <h2 className="text-sm sm:text-base font-bold">Upcoming classes</h2>
        </div>

        <Link
          href="/student/schedule"
          className="inline-flex items-center gap-1 text-xs font-bold hover:underline text-nx-muted-strong hover:text-nx-ink"
        >
          <span>View all</span>
          <ArrowRight className="size-3.5" strokeWidth={2.3} aria-hidden="true" />
        </Link>
      </div>

      {/* Body */}
      {classes.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
          <div
            className="size-10 rounded-xl border flex items-center justify-center mb-2.5 bg-nx-tile border-nx-line text-nx-faint"
          >
            <Calendar className="size-5" strokeWidth={1.8} />
          </div>
          <p
            className="text-xs text-nx-muted"
          >
            Nothing scheduled yet.
          </p>
        </div>
      ) : (
        <ul className="-my-2 divide-y divide-app-border">
          {classes.map((cls) => (
            <UpcomingClassRow cls={cls} key={cls.id} />
          ))}
        </ul>
      )}
    </div>
  );
}
"use client";

import { ArrowRight, Play } from "lucide-react";
import Link from "next/link";
import { canJoinClass, type StudentDashboardUpcomingClass } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { ClassStatusBadge } from "@/components/ui/ClassStatusBadge";
import { SectionCard } from "@/components/ui/SectionCard";
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
  // Same rule as the schedule and class pages (`canJoinClass`): a student can
  // join once the coach has started the class; before that the room is not open.
  const joinable = canJoinClass(cls);
  const hintId = `upcoming-${cls.id}-hint`;

  return (
    <li className="flex flex-wrap items-start gap-3.5 py-3.5">
      <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-control bg-app-soft text-center">
        <span className="text-[0.65rem] font-bold leading-none text-app-muted">
          {formatMonthShort(cls.startsAt, timeZone)}
        </span>
        <span className="mt-0.5 text-base font-extrabold leading-none text-app-text">
          {formatDayOfMonth(cls.startsAt, timeZone)}
        </span>
      </span>

      <div className="min-w-0 flex-1 basis-40">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-bold text-app-text">{cls.title}</span>
          <ClassStatusBadge status={cls.status} />
        </div>
        {cls.topic ? (
          <p className="truncate text-sm text-app-text">Topic: {cls.topic}</p>
        ) : null}
        <p className="truncate text-xs text-app-muted">
          {formatRelativeDay(cls.startsAt, timeZone)} · {formatTime(cls.startsAt, timeZone)} –{" "}
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
              <Play aria-hidden="true" className="size-3.5 fill-current" strokeWidth={2.5} />
              Join Class
            </Link>
          </Button>
        ) : (
          <>
            <Button aria-describedby={hintId} disabled size="sm" variant="outline">
              <Play aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
              Join Class
            </Button>
            <span className="text-center text-xs text-app-muted sm:text-right" id={hintId}>
              Opens when your coach starts
            </span>
          </>
        )}
        <Link
          className="inline-flex items-center justify-center gap-1 rounded-control text-xs font-semibold text-primary-ink hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus sm:justify-end"
          href={`/classes/${cls.id}`}
        >
          View class
          <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
        </Link>
      </div>
    </li>
  );
}

/** Student dashboard: the next three classes, soonest first. */
export function UpcomingClasses({ classes = [] }: UpcomingClassesProps) {
  return (
    <SectionCard
      actions={
        <Button asChild size="sm" variant="ghost">
          <Link className="text-primary-ink" href="/student/schedule">
            View all
            <ArrowRight className="ml-1 size-4" strokeWidth={2.5} aria-hidden="true" />
          </Link>
        </Button>
      }
      className="h-full"
      title="Upcoming classes"
    >
      {classes.length === 0 ? (
        <p className="py-6 text-center text-sm text-app-muted">Nothing scheduled yet.</p>
      ) : (
        <ul className="-my-3.5 divide-y divide-app-border">
          {classes.map((cls) => (
            <UpcomingClassRow cls={cls} key={cls.id} />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

"use client";

import { ArrowRight, Calendar, Play } from "lucide-react";
import Link from "next/link";
import {
  canJoinClass,
  type StudentDashboardUpcomingClass
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { ClassStatusBadge } from "@/components/ui/ClassStatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
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
  const joinable = canJoinClass(cls);

  return (
    <li className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0">
      <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-control bg-app-soft text-center">
        <span className="text-xs font-semibold leading-none text-app-muted">
          {formatMonthShort(cls.startsAt, timeZone)}
        </span>
        <span className="mt-0.5 text-base font-bold leading-none tabular-nums text-app-text">
          {formatDayOfMonth(cls.startsAt, timeZone)}
        </span>
      </span>

      <div className="min-w-0 flex-1 basis-40">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="min-w-0 truncate text-sm font-semibold text-app-text">
            {cls.title}
          </span>
          {cls.status !== "SCHEDULED" ? <ClassStatusBadge status={cls.status} /> : null}
          <BatchTypeBadge type={cls.batchType} />
        </div>
        {cls.topic ? (
          <p className="truncate text-sm text-app-text">Topic: {cls.topic}</p>
        ) : null}
        <p className="text-xs text-app-muted">
          {formatRelativeDay(cls.startsAt, timeZone)} ·{" "}
          {formatTime(cls.startsAt, timeZone)} –{" "}
          {formatTime(cls.endsAt, timeZone)} · Coach {cls.coachName}
        </p>
      </div>

      <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
        {joinable ? (
          <>
            <Button asChild size="sm" variant="ghost">
              <Link href={`/classes/${cls.id}`}>View class</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/live-class/${cls.id}`}>
                <Play
                  aria-hidden="true"
                  className="size-3.5 fill-current"
                  strokeWidth={2.5}
                />
                Join class
              </Link>
            </Button>
          </>
        ) : (
          <Button asChild size="sm" variant="outline">
            <Link href={`/classes/${cls.id}`}>View class</Link>
          </Button>
        )}
      </div>
    </li>
  );
}

export function UpcomingClasses({ classes = [] }: UpcomingClassesProps) {
  return (
    <SectionCard
      actions={
        <Button asChild className="-mr-3" size="sm" variant="ghost">
          <Link href="/student/schedule">
            View all
            <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
          </Link>
        </Button>
      }
      description="You can join once your coach starts the class."
      title="Upcoming classes"
    >
      {classes.length === 0 ? (
        <EmptyState icon={Calendar} title="Nothing scheduled yet" variant="inline" />
      ) : (
        <ul className="divide-y divide-app-border">
          {classes.map((cls) => (
            <UpcomingClassRow cls={cls} key={cls.id} />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

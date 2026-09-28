"use client";

import Link from "next/link";
import { SectionCard } from "@/components/ui/SectionCard";
import { ClassStatus } from "@/features/live-class/types/live-class";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import {
  formatDayOfMonth,
  formatMonthShort,
  formatRelativeDay,
  formatTime
} from "@/lib/datetime";

interface ScheduledClass {
  id: string;
  startsAt: string;
  coach: string;
  topic: string;
  status: ClassStatus;
}

interface UpcomingClassesProps {
  classes?: ScheduledClass[];
}

export function UpcomingClasses({ classes = [] }: UpcomingClassesProps) {
  const timeZone = useUserTimeZone();

  return (
    <SectionCard className="h-full" title="Upcoming classes">
      {classes.length === 0 ? (
        <p className="py-6 text-center text-sm text-app-muted">Nothing else scheduled yet.</p>
      ) : (
        <ul className="-my-2 divide-y divide-app-border">
          {classes.map((cls) => (
            <li key={cls.id}>
              <Link
                className="-mx-2 flex items-center gap-3.5 rounded-control px-2 py-3 transition-colors hover:bg-app-soft"
                href={`/live-class/${cls.id}`}
              >
                <span className="flex size-11 shrink-0 flex-col items-center justify-center rounded-control bg-app-soft text-center">
                  <span className="text-[0.65rem] font-bold uppercase leading-none text-app-muted">
                    {formatMonthShort(cls.startsAt, timeZone)}
                  </span>
                  <span className="mt-0.5 text-base font-extrabold leading-none text-app-text">
                    {formatDayOfMonth(cls.startsAt, timeZone)}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-app-text">
                    {cls.topic}
                  </span>
                  <span className="block truncate text-xs text-app-muted">
                    {cls.coach} · {formatTime(cls.startsAt, timeZone)}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-app-muted">
                  {formatRelativeDay(cls.startsAt, timeZone)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

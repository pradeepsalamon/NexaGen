"use client";

import { ArrowRight, CalendarDays } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Panel, PanelBody, PanelEmpty, PanelHeader } from "@/components/ui/Panel";
import { ClassStatus } from "@/features/live-class/types/live-class";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import {
  formatDayOfMonth,
  formatMonthShort,
  formatRelativeDay,
  formatTime
} from "@/lib/datetime";
import { TONE } from "@/lib/tone";
import { cn } from "@/lib/utils";

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
    <Panel>
      <PanelHeader
        actions={
          <Button asChild size="sm" variant="ghost">
            <Link href="/student/schedule">
              View Full Schedule
              <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
            </Link>
          </Button>
        }
        description={`${classes.length} scheduled this week`}
        icon={CalendarDays}
        title="Upcoming Classes & Masterclasses"
        tone="primary"
      />
      {classes.length === 0 ? (
        <PanelEmpty
          icon={CalendarDays}
          message="Check back later, or open your full schedule."
          title="No upcoming classes"
          tone="primary"
        />
      ) : (
        <PanelBody className="space-y-3">
          {classes.map((cls, index) => {
            // The soonest class carries the attention hue; the rest stay primary.
            const tone = TONE[index === 0 ? "secondary" : "primary"];

            return (
              <div
                className="flex flex-col justify-between gap-4 rounded-app border border-app-border bg-app-soft p-4 transition-colors hover:border-primary sm:flex-row sm:items-center"
                key={cls.id}
              >
                <div className="flex items-center gap-3.5">
                  <div
                    className={cn(
                      "flex size-10 shrink-0 flex-col items-center justify-center rounded-control border text-center",
                      tone.border,
                      tone.chip
                    )}
                  >
                    <span className="text-[10px] font-bold uppercase leading-none">
                      {formatMonthShort(cls.startsAt, timeZone)}
                    </span>
                    <span className="mt-0.5 font-mono text-sm font-black leading-none text-app-text">
                      {formatDayOfMonth(cls.startsAt, timeZone)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-app-text">{cls.topic}</h3>
                    <p className="text-xs text-app-muted">
                      Coach {cls.coach} &bull; {formatTime(cls.startsAt, timeZone)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 self-end sm:self-center">
                  <span className="rounded-control border border-app-border bg-app-surface px-2.5 py-1 text-xs font-bold text-app-muted">
                    {formatRelativeDay(cls.startsAt, timeZone)}
                  </span>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/live-class/${cls.id}`}>Details</Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </PanelBody>
      )}
    </Panel>
  );
}

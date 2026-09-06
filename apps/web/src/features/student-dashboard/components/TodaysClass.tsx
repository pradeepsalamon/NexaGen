"use client";

import { ArrowRight, Calendar, CalendarOff, Clock, Play, User } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ClassStatusBadge } from "@/components/ui/ClassStatusBadge";
import { Panel, PanelBody, PanelEmpty, PanelHeader } from "@/components/ui/Panel";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";

interface TodaysClassProps {
  id?: string;
  topic?: string;
  coachName?: string;
  startsAt?: string;
  durationMinutes?: number;
  status?: string;
}

export function TodaysClass({
  id,
  topic,
  coachName,
  startsAt,
  durationMinutes,
  status
}: TodaysClassProps) {
  const timeZone = useUserTimeZone();

  if (!topic) {
    return (
      <Panel className="flex h-full flex-col">
        <PanelHeader icon={Calendar} title="Today's Class" tone="primary" />
        <div className="flex flex-1 items-center justify-center">
          <PanelEmpty
            icon={CalendarOff}
            message="Enjoy your free time, or get ahead with some practice."
            title="Nothing scheduled today"
            tone="primary"
          />
        </div>
      </Panel>
    );
  }

  const isLive = status === "IN_PROGRESS" || status === "LIVE";

  return (
    <Panel
      className={cn("flex h-full flex-col", isLive && "ring-2 ring-app-danger/30")}
    >
      <PanelHeader
        actions={<ClassStatusBadge status={status ?? ""} />}
        icon={Calendar}
        title="Today's Class"
        tone="primary"
      />
      <PanelBody className="flex flex-1 flex-col justify-between gap-5">
        <div>
          <h3 className="text-xl font-extrabold leading-tight tracking-tight text-app-text">
            {topic}
          </h3>
          <dl className="mt-4 space-y-2.5">
            <div className="flex items-center gap-2.5 text-sm">
              <span className="flex size-7 items-center justify-center rounded-full bg-primary/[0.12] text-primary-ink">
                <User aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
              </span>
              <dt className="sr-only">Coach</dt>
              <dd className="font-bold text-app-text">{coachName}</dd>
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <span className="flex size-7 items-center justify-center rounded-full bg-primary/[0.12] text-primary-ink">
                <Clock aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
              </span>
              <dt className="sr-only">Time</dt>
              <dd className="font-bold text-app-text">
                {formatTime(startsAt, timeZone)}
                <span className="ml-1.5 font-medium text-app-muted">
                  · {durationMinutes} min
                </span>
              </dd>
            </div>
          </dl>
        </div>

        <div>
          {isLive && id ? (
            <Button asChild fullWidth variant="destructive">
              <Link href={`/live-class/${id}`}>
                <Play aria-hidden="true" className="size-4" strokeWidth={2.5} />
                Join Live Class
              </Link>
            </Button>
          ) : null}
          {id ? (
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-app-border pt-4">
              <Link
                className="inline-flex items-center gap-1 text-xs font-bold text-primary transition-opacity hover:opacity-80"
                href={`/live-class/${id}`}
              >
                Class details
                <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
              </Link>
              <span className="font-mono text-[11px] text-app-muted">
                ID: {id.slice(0, 8)}
              </span>
            </div>
          ) : null}
        </div>
      </PanelBody>
    </Panel>
  );
}

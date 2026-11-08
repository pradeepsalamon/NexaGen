"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CalendarX2, Play } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { StudentDashboardLiveClass } from "@nexa-chess/types";
import { ClassStatusBadge } from "@/components/ui/ClassStatusBadge";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import {
  formatDayOfMonth,
  formatMonthShort,
  formatRelativeDay,
  formatTime
} from "@/lib/datetime";
import { Illustration } from "@/components/illustrations/Illustration";
import { EmptyStateIcon } from "@/components/ui/EmptyState";

type FeaturedClass = {
  coachName?: string;
  durationMinutes?: number;
  id?: string;
  startsAt?: string;
  status?: string;
  topic?: string;
};

type NextClassCardProps = {
  liveClass?: StudentDashboardLiveClass | null;
  nextClass?: FeaturedClass | null;
};

const PANEL =
  "flex flex-col gap-4 rounded-panel border border-app-border bg-app-surface p-4 text-app-text shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-6";

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function useElapsed(since: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [since]);
  return since ? formatElapsed(now - new Date(since).getTime()) : null;
}

export function NextClassCard({ liveClass, nextClass }: NextClassCardProps) {
  const timeZone = useUserTimeZone();
  const uptime = useElapsed(liveClass?.startedAt ?? liveClass?.startsAt);

  if (liveClass) {
    return (
      <section className={PANEL}>
        <div className="min-w-0">
          <Badge variant="live">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full rounded-full bg-app-danger opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex size-2 rounded-full bg-app-danger" />
            </span>
            Live now
          </Badge>
          <h2 className="mt-2 text-xl font-bold leading-tight tracking-tight">
            {liveClass.topic}
          </h2>
          <p className="mt-1 text-sm text-app-muted">
            {liveClass.coachName}
            {uptime ? ` · live for ${uptime}` : ""}
            {` · ends ${formatTime(liveClass.endsAt, timeZone)}`}
          </p>
          {liveClass.coachPresent === false ? (
            <p className="mt-1 text-sm text-warning-ink">
              Waiting for your coach to join.
            </p>
          ) : null}
        </div>

        <Button asChild size="lg">
          <Link href={`/live-class/${liveClass.id}`}>
            <Play aria-hidden="true" className="size-4 fill-current" />
            Join class
          </Link>
        </Button>
      </section>
    );
  }

  if (!nextClass?.topic || !nextClass.id) {
    return (
      <section className={PANEL}>
        <div className="flex items-start gap-4 sm:items-center">
          <Illustration className="hidden w-28 xs:block" name="schedule" />
          <EmptyStateIcon className="xs:hidden" icon={CalendarX2} />

          <div className="min-w-0">
            <h2 className="text-xl font-bold leading-tight tracking-tight">
              No classes scheduled
            </h2>
            <p className="mt-1 text-sm text-app-muted">
              Your next class will show up here. Meanwhile, catch up on your
              assignments.
            </p>
          </div>
        </div>

        <Button asChild variant="neutral">
          <Link href="/student/practice">View assignments</Link>
        </Button>
      </section>
    );
  }

  const day = formatRelativeDay(nextClass.startsAt, timeZone);
  const finished = nextClass.status === "COMPLETED";

  return (
    <section className={PANEL}>
      <div className="flex min-w-0 items-start gap-4 sm:items-center">
        <span className="flex size-14 shrink-0 flex-col items-center justify-center rounded-app bg-primary-soft text-primary-ink">
          <span className="text-xs font-semibold leading-none">
            {formatMonthShort(nextClass.startsAt, timeZone)}
          </span>
          <span className="mt-1 font-display text-xl font-bold leading-none tabular-nums">
            {formatDayOfMonth(nextClass.startsAt, timeZone)}
          </span>
        </span>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold text-primary-ink">
              {day === "Today" ? "Today's class" : "Next class"}
            </p>
            {finished ? <ClassStatusBadge status="COMPLETED" /> : null}
          </div>
          <h2 className="mt-1 text-xl font-bold leading-tight tracking-tight">
            {nextClass.topic}
          </h2>
          <p className="mt-1 text-sm text-app-muted">
            {nextClass.coachName ? `${nextClass.coachName} · ` : ""}
            {day !== "Today" ? `${day}, ` : ""}
            {formatTime(nextClass.startsAt, timeZone)}
            {nextClass.durationMinutes ? ` · ${nextClass.durationMinutes} min` : ""}
          </p>
        </div>
      </div>

      <Button asChild size="lg" variant={finished ? "neutral" : "primary"}>
        <Link href={`/classes/${nextClass.id}`}>
          View class
          <ArrowRight aria-hidden="true" className="size-4" strokeWidth={2.5} />
        </Link>
      </Button>
    </section>
  );
}

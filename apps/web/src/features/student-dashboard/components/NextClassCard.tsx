"use client";

import { type ReactNode, useEffect, useState } from "react";
import { ArrowRight, CalendarOff, Play } from "lucide-react";
import Link from "next/link";
import type { StudentDashboardLiveClass } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ClassStatusBadge } from "@/components/ui/ClassStatusBadge";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatRelativeDay, formatTime } from "@/lib/datetime";

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

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-bold uppercase tracking-wide text-app-muted">{children}</p>
  );
}

function LiveClass({ liveClass }: { liveClass: StudentDashboardLiveClass }) {
  const timeZone = useUserTimeZone();
  const uptime = useElapsed(liveClass.startedAt ?? liveClass.startsAt);

  return (
    <Card className="flex flex-col gap-5 border-app-danger/30 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="min-w-0">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-app-danger-ink">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full rounded-full bg-app-danger opacity-75 motion-safe:animate-ping" />
            <span className="relative inline-flex size-2 rounded-full bg-app-danger" />
          </span>
          Live now
        </span>
        <h2 className="mt-2 text-xl font-extrabold leading-tight tracking-tight text-app-text">
          {liveClass.topic}
        </h2>
        <p className="mt-1 text-sm text-app-muted">
          {liveClass.coachName}
          {uptime ? ` · live for ${uptime}` : ""}
          {` · ends ${formatTime(liveClass.endsAt, timeZone)}`}
        </p>
        {liveClass.coachPresent === false ? (
          <p className="mt-1 text-sm text-app-muted">Waiting for your coach to join.</p>
        ) : null}
      </div>
      <Button asChild className="shrink-0" variant="destructive">
        <Link href={`/live-class/${liveClass.id}`}>
          <Play aria-hidden="true" className="size-4" strokeWidth={2.5} />
          Join class
        </Link>
      </Button>
    </Card>
  );
}

export function NextClassCard({ liveClass, nextClass }: NextClassCardProps) {
  const timeZone = useUserTimeZone();

  if (liveClass) return <LiveClass liveClass={liveClass} />;

  if (!nextClass?.topic || !nextClass.id) {
    return (
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-app-soft">
            <CalendarOff aria-hidden="true" className="size-5 text-app-muted" strokeWidth={2.25} />
          </span>
          <div>
            <h2 className="font-extrabold text-app-text">No classes scheduled</h2>
            <p className="mt-0.5 text-sm text-app-muted">
              Your next class will show up here. Meanwhile, catch up on your assignments.
            </p>
          </div>
        </div>
        <Button asChild className="shrink-0" variant="outline">
          <Link href="/student/practice">View assignments</Link>
        </Button>
      </Card>
    );
  }

  const day = formatRelativeDay(nextClass.startsAt, timeZone);
  const finished = nextClass.status === "COMPLETED";

  return (
    <Card className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Eyebrow>{day === "Today" ? "Today's class" : "Next class"}</Eyebrow>
          {finished ? <ClassStatusBadge status="COMPLETED" /> : null}
        </div>
        <h2 className="mt-2 text-xl font-extrabold leading-tight tracking-tight text-app-text">
          {nextClass.topic}
        </h2>
        <p className="mt-1 text-sm text-app-muted">
          {nextClass.coachName ? `${nextClass.coachName} · ` : ""}
          {day !== "Today" ? `${day}, ` : ""}
          {formatTime(nextClass.startsAt, timeZone)}
          {nextClass.durationMinutes ? ` · ${nextClass.durationMinutes} min` : ""}
        </p>
      </div>
      <Button asChild className="shrink-0" variant={finished ? "outline" : "primary"}>
        <Link href={`/live-class/${nextClass.id}`}>
          View class
          <ArrowRight aria-hidden="true" className="size-4" strokeWidth={2.5} />
        </Link>
      </Button>
    </Card>
  );
}

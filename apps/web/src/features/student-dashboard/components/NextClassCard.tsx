"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CalendarX2, Play } from "lucide-react";
import Link from "next/link";
import type { StudentDashboardLiveClass } from "@nexa-chess/types";
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

export function NextClassCard({ liveClass, nextClass }: NextClassCardProps) {
  const timeZone = useUserTimeZone();
  const uptime = useElapsed(liveClass?.startedAt ?? liveClass?.startsAt);

  const surfaceClass = "bg-nx-card border-nx-line text-nx-ink shadow-nx-card";

  if (liveClass) {
    return (
      <div
        className={`flex flex-col gap-4 rounded-2xl border p-4 sm:p-5 sm:flex-row sm:items-center sm:justify-between ${surfaceClass}`}
      >
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-nx-live">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full rounded-full bg-nx-live opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex size-2 rounded-full bg-nx-live" />
            </span>
            Live now
          </span>
          <h2 className="mt-1.5 text-base sm:text-lg font-bold leading-tight">
            {liveClass.topic}
          </h2>
          <p
            className="mt-0.5 text-xs sm:text-sm text-nx-muted"
          >
            {liveClass.coachName}
            {uptime ? ` · live for ${uptime}` : ""}
            {` · ends ${formatTime(liveClass.endsAt, timeZone)}`}
          </p>
          {liveClass.coachPresent === false ? (
            <p className="mt-1 text-xs text-nx-amber">
              Waiting for your coach to join.
            </p>
          ) : null}
        </div>

        <Link
          href={`/live-class/${liveClass.id}`}
          className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full bg-nx-live-strong hover:bg-nx-live-deep text-white text-xs sm:text-sm font-bold shrink-0 transition-colors"
        >
          <Play aria-hidden="true" className="size-3.5 fill-current" />
          <span>Join class</span>
        </Link>
      </div>
    );
  }

  if (!nextClass?.topic || !nextClass.id) {
    return (
      <div
        className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border p-4 sm:px-6 sm:py-4 ${surfaceClass}`}
      >
        <div className="flex items-start sm:items-center gap-3.5">
          <span
            className="flex size-10 sm:size-11 shrink-0 items-center justify-center rounded-xl border bg-nx-gold-soft border-nx-gold-line text-nx-gold-ink"
          >
            <CalendarX2 aria-hidden="true" className="size-5" strokeWidth={2} />
          </span>

          <div>
            <h2 className="text-sm sm:text-base font-bold leading-snug">
              No classes scheduled
            </h2>
            <p
              className="mt-0.5 text-xs sm:text-[13px] leading-relaxed text-nx-muted"
            >
              Your next class will show up here. Meanwhile, catch up on your
              assignments.
            </p>
          </div>
        </div>

        <Link
          href="/student/practice"
          className="inline-flex items-center justify-center h-9 sm:h-10 px-5 rounded-full text-xs font-bold border shrink-0 transition-colors bg-nx-tile border-nx-line-strong text-nx-ink hover:border-nx-emphasis"
        >
          View Assignments
        </Link>
      </div>
    );
  }

  const day = formatRelativeDay(nextClass.startsAt, timeZone);
  const finished = nextClass.status === "COMPLETED";

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border p-4 sm:px-6 sm:py-5 ${surfaceClass}`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p
            className="text-xs font-bold uppercase tracking-wider text-nx-gold-ink"
          >
            {day === "Today" ? "Today's class" : "Next class"}
          </p>
          {finished ? <ClassStatusBadge status="COMPLETED" /> : null}
        </div>
        <h2 className="mt-1 text-base sm:text-lg font-bold leading-tight">
          {nextClass.topic}
        </h2>
        <p
          className="mt-0.5 text-xs sm:text-sm text-nx-muted"
        >
          {nextClass.coachName ? `${nextClass.coachName} · ` : ""}
          {day !== "Today" ? `${day}, ` : ""}
          {formatTime(nextClass.startsAt, timeZone)}
          {nextClass.durationMinutes ? ` · ${nextClass.durationMinutes} min` : ""}
        </p>
      </div>

      <Link
        href={`/classes/${nextClass.id}`}
        className={`inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full text-xs sm:text-sm font-bold shrink-0 transition-colors ${finished
            ? "border border-nx-line-strong text-nx-ink"
            : "bg-nx-emphasis text-nx-ink-inverse"
          }`}
      >
        <span>View class</span>
        <ArrowRight aria-hidden="true" className="size-4" strokeWidth={2.4} />
      </Link>
    </div>
  );
}
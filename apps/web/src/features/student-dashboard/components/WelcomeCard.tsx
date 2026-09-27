"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Clock,
  Hourglass,
  Play,
  User,
  Users
} from "lucide-react";
import Link from "next/link";
import type { StudentDashboardLiveClass } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatTime } from "@/lib/datetime";

interface WelcomeCardProps {
  studentName: string;
  batchName?: string;
  courseName?: string;
  memberSince?: string;
  liveClass?: StudentDashboardLiveClass | null;
}

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

function LiveStat({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-control border border-app-danger/20 bg-app-surface/70 px-3 py-2">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-app-danger/[0.12] text-app-danger-ink">
        <Icon aria-hidden="true" className="size-4" strokeWidth={2.5} />
      </span>
      <div className="min-w-0">
        <div className="text-[0.7rem] font-semibold uppercase tracking-wide text-app-muted">
          {label}
        </div>
        <div className="truncate text-sm font-extrabold tabular-nums text-app-text">{value}</div>
      </div>
    </div>
  );
}

function LiveClassHero({ liveClass }: { liveClass: StudentDashboardLiveClass }) {
  const timeZone = useUserTimeZone();
  const uptime = useElapsed(liveClass.startedAt ?? liveClass.startsAt);
  const participants =
    liveClass.participantCount === null ? "—" : String(liveClass.participantCount);

  return (
    <div className="rounded-app border border-app-danger/25 bg-app-danger/[0.06] p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-app-danger px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wide text-white">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-75 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2 rounded-full bg-white" />
          </span>
          Live now
        </span>
        {liveClass.coachPresent === false ? (
          <span className="text-xs font-semibold text-app-muted">
            Waiting for your coach to join
          </span>
        ) : null}
      </div>

      <h2 className="mt-2 text-lg font-extrabold leading-tight text-app-text sm:text-xl">
        {liveClass.topic}
      </h2>
      <p className="mt-0.5 flex items-center gap-1.5 text-sm text-app-muted">
        <User aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
        with <span className="font-bold text-app-text">{liveClass.coachName}</span>
      </p>

      <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <LiveStat icon={Users} label="In class" value={participants} />
        <LiveStat icon={Clock} label="Live for" value={uptime ?? "—"} />
        <LiveStat
          icon={Hourglass}
          label="Ends at"
          value={formatTime(liveClass.endsAt, timeZone)}
        />
      </div>
    </div>
  );
}

export function WelcomeCard({
  studentName,
  batchName = "Unassigned Batch",
  courseName = "No active course",
  memberSince = "Recently",
  liveClass
}: WelcomeCardProps) {
  return (
    <section className="relative h-full overflow-hidden rounded-panel border border-app-border bg-app-surface p-6 shadow-card sm:p-8">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-10 -right-10 size-64 rounded-full bg-primary/5 blur-3xl"
      />

      <div className="relative flex h-full flex-col justify-between gap-6">
        <div>
          <span className="inline-flex items-center rounded-full border border-secondary/40 bg-secondary/25 px-2.5 py-0.5 text-xs font-extrabold text-secondary-ink">
            {batchName}
          </span>
          <h1 className="mt-2 flex items-center gap-3 text-2xl font-extrabold tracking-tight text-app-text sm:text-3xl">
            <span>Welcome back, {studentName}!</span>
            <span aria-hidden="true" className="inline-block motion-safe:animate-bounce">
              👋
            </span>
          </h1>
          {liveClass ? (
            <div className="mt-4">
              <LiveClassHero liveClass={liveClass} />
            </div>
          ) : (
            <p className="mt-1 max-w-xl text-sm text-app-muted">
              Track your progress, join interactive batches, analyze tactic puzzles, and
              continue mastering your chess openings.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          {/* Informational, not links — /student/courses and /student/batches
              are in studentNavItems but have no page yet. */}
          <span className="inline-flex items-center gap-2 rounded-control border border-app-border bg-app-soft px-3.5 py-2 text-xs font-bold text-app-text">
            <BookOpen aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
            {courseName}
          </span>
          <span className="inline-flex items-center gap-2 rounded-control border border-app-border bg-app-soft px-3.5 py-2 text-xs font-bold text-app-text">
            <Users aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
            Your Batch
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-control border border-app-border bg-app-surface px-3.5 py-2 text-xs font-medium text-app-muted">
            <CalendarDays aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
            Member since
            <span className="font-bold text-app-text">{memberSince}</span>
          </span>

          {liveClass ? (
            <Button asChild className="ml-auto" variant="destructive">
              <Link href={`/live-class/${liveClass.id}`}>
                Join Live Class
                <Play aria-hidden="true" className="size-4" strokeWidth={2.5} />
              </Link>
            </Button>
          ) : (
            <Button asChild className="ml-auto" variant="primary">
              <Link href="/student/schedule">
                View Full Schedule
                <ArrowRight aria-hidden="true" className="size-4" strokeWidth={2.5} />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CalendarX2, Play } from "lucide-react";
import Link from "next/link";
import type { StudentDashboardLiveClass } from "@nexa-chess/types";
import { ClassStatusBadge } from "@/components/ui/ClassStatusBadge";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { useTheme } from "@/providers/ThemeProvider";
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
  const { mode, isHydrated } = useTheme();
  const isDark = isHydrated && mode === "dark";
  const uptime = useElapsed(liveClass?.startedAt ?? liveClass?.startsAt);

  const surfaceClass = isDark
    ? "bg-[#07142B] border-white/10 text-white shadow-[0_8px_30px_rgba(0,0,0,0.45)]"
    : "bg-white border-[#E8EDF5] text-[#071B41] shadow-[0_4px_20px_rgba(7,27,65,0.04)]";

  if (liveClass) {
    return (
      <div
        className={`flex flex-col gap-4 rounded-2xl border p-4 sm:p-5 sm:flex-row sm:items-center sm:justify-between ${surfaceClass}`}
      >
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-500">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full rounded-full bg-red-500 opacity-75 motion-safe:animate-ping" />
              <span className="relative inline-flex size-2 rounded-full bg-red-500" />
            </span>
            Live now
          </span>
          <h2 className="mt-1.5 text-base sm:text-lg font-bold leading-tight">
            {liveClass.topic}
          </h2>
          <p
            className={`mt-0.5 text-xs sm:text-sm ${isDark ? "text-[#94A3B8]" : "text-[#64748B]"
              }`}
          >
            {liveClass.coachName}
            {uptime ? ` · live for ${uptime}` : ""}
            {` · ends ${formatTime(liveClass.endsAt, timeZone)}`}
          </p>
          {liveClass.coachPresent === false ? (
            <p className="mt-1 text-xs text-amber-500">
              Waiting for your coach to join.
            </p>
          ) : null}
        </div>

        <Link
          href={`/live-class/${liveClass.id}`}
          className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-bold shrink-0 transition-colors"
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
            className={`flex size-10 sm:size-11 shrink-0 items-center justify-center rounded-xl border ${isDark
                ? "bg-[#112244] border-[#E2B355]/25 text-[#E2B355]"
                : "bg-[#FDF4E1] border-[#F3DFB6] text-[#C58927]"
              }`}
          >
            <CalendarX2 aria-hidden="true" className="size-5" strokeWidth={2} />
          </span>

          <div>
            <h2 className="text-sm sm:text-base font-bold leading-snug">
              No classes scheduled
            </h2>
            <p
              className={`mt-0.5 text-xs sm:text-[13px] leading-relaxed ${isDark ? "text-[#94A3B8]" : "text-[#64748B]"
                }`}
            >
              Your next class will show up here. Meanwhile, catch up on your
              assignments.
            </p>
          </div>
        </div>

        <Link
          href="/student/practice"
          className={`inline-flex items-center justify-center h-9 sm:h-10 px-5 rounded-full text-xs font-bold border shrink-0 transition-colors ${isDark
              ? "bg-[#0B1B38] border-white/15 text-white hover:border-[#E2B355]"
              : "bg-white border-[#CBD5E1] text-[#071B41] hover:border-[#071B41]"
            }`}
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
            className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-[#E2B355]" : "text-[#C58927]"
              }`}
          >
            {day === "Today" ? "Today's class" : "Next class"}
          </p>
          {finished ? <ClassStatusBadge status="COMPLETED" /> : null}
        </div>
        <h2 className="mt-1 text-base sm:text-lg font-bold leading-tight">
          {nextClass.topic}
        </h2>
        <p
          className={`mt-0.5 text-xs sm:text-sm ${isDark ? "text-[#94A3B8]" : "text-[#64748B]"
            }`}
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
            ? isDark
              ? "border border-white/15 text-white"
              : "border border-[#CBD5E1] text-[#071B41]"
            : "bg-[#071B41] text-white dark:bg-[#E2B355] dark:text-[#071B41]"
          }`}
      >
        <span>View class</span>
        <ArrowRight aria-hidden="true" className="size-4" strokeWidth={2.4} />
      </Link>
    </div>
  );
}
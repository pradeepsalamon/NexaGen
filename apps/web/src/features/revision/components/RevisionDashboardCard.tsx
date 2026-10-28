"use client";

import {
  Brain,
  Clock,
  Flame,
  CalendarClock,
  AlertCircle,
  Sparkles,
  CheckCircle2
} from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { useTheme } from "@/providers/ThemeProvider";
import { formatNextDue } from "../lib/revisionFormat";
import { useRevisionSummary } from "../hooks/useRevisionApi";

export function RevisionDashboardCard() {
  const tz = useUserTimeZone();
  const { mode, isHydrated } = useTheme();
  const isDark = isHydrated && mode === "dark";
  const { data, error, isLoading, refetch } = useRevisionSummary();

  if (isLoading) return <Skeleton className="h-48 w-full rounded-2xl" />;
  if (error || !data) {
    return (
      <WidgetError
        message="Couldn't load your revision."
        onRetry={() => void refetch()}
      />
    );
  }

  const s = data.summary;
  const counts = [
    {
      label: "Due today",
      value: s.dueToday,
      TopIcon: CalendarClock,
      BadgeIcon: CalendarClock,
      badgeClass: isDark
        ? "bg-amber-500/15 text-amber-400"
        : "bg-[#FEF3C7] text-[#D97706]"
    },
    {
      label: "Overdue",
      value: s.overdue,
      TopIcon: AlertCircle,
      BadgeIcon: AlertCircle,
      badgeClass: isDark
        ? "bg-rose-500/15 text-rose-400"
        : "bg-[#FEE2E2] text-[#DC2626]"
    },
    {
      label: "New",
      value: s.newAvailable,
      TopIcon: Sparkles,
      BadgeIcon: Sparkles,
      badgeClass: isDark
        ? "bg-[#E2B355]/15 text-[#E2B355]"
        : "bg-[#FDF3DC] text-[#C58927]"
    },
    {
      label: "Done today",
      value: s.completedToday,
      TopIcon: CheckCircle2,
      BadgeIcon: CheckCircle2,
      badgeClass: isDark
        ? "bg-emerald-500/15 text-emerald-400"
        : "bg-[#D1FAE5] text-[#059669]"
    }
  ];

  return (
    <div
      className={`rounded-2xl border p-4 sm:p-6 transition-colors duration-200 ${isDark
          ? "bg-[#07142B] border-white/10 text-white shadow-[0_8px_30px_rgba(0,0,0,0.45)]"
          : "bg-white border-[#E8EDF5] text-[#071B41] shadow-[0_4px_20px_rgba(7,27,65,0.04)]"
        }`}
    >
      {/* Card Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <span
            className={`flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-xl border mt-0.5 ${isDark
                ? "bg-[#112244] border-[#E2B355]/25 text-[#E2B355]"
                : "bg-[#FDF4E1] border-[#F3DFB6] text-[#C58927]"
              }`}
          >
            <Brain aria-hidden="true" className="size-5" strokeWidth={2} />
          </span>

          <div>
            <h2 className="text-sm sm:text-base font-bold leading-snug">
              Smart Revision
            </h2>
            <p
              className={`mt-0.5 text-xs leading-relaxed ${isDark ? "text-[#94A3B8]" : "text-[#64748B]"
                }`}
            >
              Puzzles you missed and topics your coach picked, brought back just
              before you&apos;d forget them.
            </p>
          </div>
        </div>

        {s.activeItems > 0 ? (
          <Link
            href="/student/revision"
            className={`text-xs font-bold shrink-0 mt-1 hover:underline ${isDark ? "text-white" : "text-[#071B41]"
              }`}
          >
            Open
          </Link>
        ) : null}
      </div>

      {s.activeItems === 0 ? (
        <p
          className={`py-4 text-center text-xs sm:text-sm ${isDark ? "text-[#94A3B8]" : "text-[#64748B]"
            }`}
        >
          Nothing to revise yet. Puzzles you get wrong, and ones your coach
          recommends, will appear here.
        </p>
      ) : (
        <div className="space-y-4">
          {/* 4 Metric Tiles (4 columns on both mobile & desktop to match mockup) */}
          <dl className="grid grid-cols-4 gap-2 sm:gap-3.5">
            {counts.map(({ label, value, TopIcon, BadgeIcon, badgeClass }) => (
              <div
                key={label}
                className={`rounded-xl border px-2.5 py-2.5 sm:px-4 sm:py-3 ${isDark
                    ? "bg-[#0B1B38]/80 border-white/8"
                    : "bg-[#FAFBFD] border-[#EDF2F7]"
                  }`}
              >
                <dt
                  className={`flex items-center gap-1 text-[10px] sm:text-xs font-medium truncate ${isDark ? "text-[#94A3B8]" : "text-[#64748B]"
                    }`}
                >
                  <TopIcon className="size-3 shrink-0 opacity-75" />
                  <span className="truncate">{label}</span>
                </dt>
                <dd className="mt-1.5 flex items-center gap-1.5 sm:gap-2">
                  <span
                    className={`size-5 sm:size-6 rounded-md flex items-center justify-center shrink-0 ${badgeClass}`}
                  >
                    <BadgeIcon className="size-3 sm:size-3.5" strokeWidth={2.3} />
                  </span>
                  <span className="text-base sm:text-xl font-extrabold tabular-nums leading-none">
                    {value}
                  </span>
                </dd>
              </div>
            ))}
          </dl>

          {/* Bottom Action Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <p
              className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${isDark ? "text-[#94A3B8]" : "text-[#64748B]"
                }`}
            >
              {s.sessionSize > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <Clock
                    aria-hidden="true"
                    className="size-3.5 text-[#D49B35]"
                    strokeWidth={2.2}
                  />
                  <span>
                    {s.sessionSize} {s.sessionSize === 1 ? "item" : "items"} ·
                    about {Math.max(1, s.estimatedMinutes)} min
                  </span>
                </span>
              ) : (
                <span>
                  All caught up
                  {s.nextDueAt
                    ? ` — next one ${formatNextDue(s.nextDueAt, tz)}`
                    : ""}
                  .
                </span>
              )}
              {s.streakDays > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <Flame
                    aria-hidden="true"
                    className="size-3.5 text-amber-500"
                    strokeWidth={2.2}
                  />
                  <span>{s.streakDays}-day revision streak</span>
                </span>
              ) : null}
            </p>

            {s.sessionSize > 0 ? (
              <Link
                href="/student/revision?start=1"
                className={`inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-full text-xs font-bold transition-all duration-200 hover:-translate-y-0.5 ${isDark
                    ? "bg-gradient-to-r from-[#E6B960] via-[#DCA642] to-[#CC922C] text-[#071B41] shadow-[0_4px_14px_rgba(212,155,53,0.3)]"
                    : "bg-[#071B41] hover:bg-[#0C285C] text-white shadow-xs"
                  }`}
              >
                <Brain aria-hidden="true" className="size-3.5" strokeWidth={2.2} />
                <span>Start Revision</span>
              </Link>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
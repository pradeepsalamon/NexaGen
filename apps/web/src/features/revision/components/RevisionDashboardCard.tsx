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
import { formatNextDue } from "../lib/revisionFormat";
import { useRevisionSummary } from "../hooks/useRevisionApi";

export function RevisionDashboardCard() {
  const tz = useUserTimeZone();
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
      badgeClass: "bg-nx-warning-soft text-nx-warning-ink"
    },
    {
      label: "Overdue",
      value: s.overdue,
      TopIcon: AlertCircle,
      BadgeIcon: AlertCircle,
      badgeClass: "bg-nx-rose-soft text-nx-rose-ink"
    },
    {
      label: "New",
      value: s.newAvailable,
      TopIcon: Sparkles,
      BadgeIcon: Sparkles,
      badgeClass: "bg-nx-gold-tint text-nx-gold-ink"
    },
    {
      label: "Done today",
      value: s.completedToday,
      TopIcon: CheckCircle2,
      BadgeIcon: CheckCircle2,
      badgeClass: "bg-nx-success-soft text-nx-success-ink"
    }
  ];

  return (
    <div
      className="rounded-2xl border p-4 sm:p-6 transition-colors duration-200 bg-nx-card border-nx-line text-nx-ink shadow-nx-card"
    >
      {/* Card Header */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <span
            className="flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-xl border mt-0.5 bg-nx-gold-soft border-nx-gold-line text-nx-gold-ink"
          >
            <Brain aria-hidden="true" className="size-5" strokeWidth={2} />
          </span>

          <div>
            <h2 className="text-sm sm:text-base font-bold leading-snug">
              Smart Revision
            </h2>
            <p
              className="mt-0.5 text-xs leading-relaxed text-nx-muted"
            >
              Puzzles you missed and topics your coach picked, brought back just
              before you&apos;d forget them.
            </p>
          </div>
        </div>

        {s.activeItems > 0 ? (
          <Link
            href="/student/revision"
            className="text-xs font-bold shrink-0 mt-1 hover:underline text-nx-ink"
          >
            Open
          </Link>
        ) : null}
      </div>

      {s.activeItems === 0 ? (
        <p
          className="py-4 text-center text-xs sm:text-sm text-nx-muted"
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
                className="rounded-xl border px-2.5 py-2.5 sm:px-4 sm:py-3 bg-nx-tile-glass border-nx-line"
              >
                <dt
                  className="flex items-center gap-1 text-[10px] sm:text-xs font-medium truncate text-nx-muted"
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
              className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-nx-muted"
            >
              {s.sessionSize > 0 ? (
                <span className="inline-flex items-center gap-1.5">
                  <Clock
                    aria-hidden="true"
                    className="size-3.5 text-nx-gold-500"
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
                    className="size-3.5 text-nx-amber"
                    strokeWidth={2.2}
                  />
                  <span>{s.streakDays}-day revision streak</span>
                </span>
              ) : null}
            </p>

            {s.sessionSize > 0 ? (
              <Link
                href="/student/revision?start=1"
                className={`inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-full text-xs font-bold transition-all duration-200 hover:-translate-y-0.5 nx-cta shadow-nx-cta-glow`}
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
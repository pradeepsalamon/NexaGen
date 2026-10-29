"use client";

import Link from "next/link";
import { AlarmClock, AlertTriangle, ArrowRight } from "lucide-react";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { cn } from "@/lib/utils";
import { useMyAssignmentReminders } from "../../hooks/useAssignmentsApi";
import { describeReminderCounts } from "./reminderText";
import { ReminderItemRow } from "./ReminderItemRow";

const SHOWN = 3;

/** Student dashboard: overdue / due-today / due-soon work, nearest first. Hidden when there is none. */
export function AssignmentReminderBanner() {
  const timeZone = useUserTimeZone();
  const { data } = useMyAssignmentReminders();

  if (!data || data.items.length === 0) return null;

  const urgent = data.counts.overdue > 0;
  const Icon = urgent ? AlertTriangle : AlarmClock;

  return (
    <section
      aria-label="Assignment reminders"
      className={cn(
        "rounded-2xl border border-l-4 p-4 sm:p-5 transition-colors duration-200",
        "bg-nx-card border-nx-line text-nx-ink shadow-nx-card",
        urgent ? "border-l-nx-live" : "border-l-nx-gold-500"
      )}
    >
      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start sm:items-center gap-3.5">
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl border",
              urgent
                ? "bg-nx-danger-soft border-nx-danger-line text-nx-danger-ink"
                : "bg-nx-gold-soft border-nx-gold-line text-nx-gold-ink"
            )}
          >
            <Icon aria-hidden className="size-5" strokeWidth={2} />
          </span>

          <div>
            <h2 className="text-sm sm:text-base font-bold leading-snug">
              {urgent
                ? "Assignments need your attention"
                : "Assignments due soon"}
            </h2>
            <p
              className={cn(
                "mt-0.5 text-xs sm:text-[13px]",
                "text-nx-muted"
              )}
            >
              You have {describeReminderCounts(data.counts)}.
            </p>
          </div>
        </div>

        <Link
          href="/student/practice"
          className={cn(
            "inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-full text-xs font-bold border shrink-0 self-start sm:self-center transition-colors",
            "bg-nx-tile border-nx-line-strong text-nx-ink hover:border-nx-emphasis"
          )}
        >
          <span>See all assignments</span>
          <ArrowRight className="size-3.5" strokeWidth={2.2} />
        </Link>
      </div>

      <ul className="mt-3.5 space-y-1">
        {data.items.slice(0, SHOWN).map((item) => (
          <ReminderItemRow item={item} key={item.id} timeZone={timeZone} />
        ))}
      </ul>

      {data.items.length > SHOWN && (
        <p
          className={cn(
            "mt-2 px-2 text-xs font-medium",
            "text-nx-muted"
          )}
        >
          +{data.items.length - SHOWN} more on the assignments page
        </p>
      )}
    </section>
  );
}
"use client";

import Link from "next/link";
import { AlarmClock, AlertTriangle, ArrowRight } from "lucide-react";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { useTheme } from "@/providers/ThemeProvider";
import { cn } from "@/lib/utils";
import { useMyAssignmentReminders } from "../../hooks/useAssignmentsApi";
import { describeReminderCounts } from "./reminderText";
import { ReminderItemRow } from "./ReminderItemRow";

const SHOWN = 3;

/** Student dashboard: overdue / due-today / due-soon work, nearest first. Hidden when there is none. */
export function AssignmentReminderBanner() {
  const timeZone = useUserTimeZone();
  const { mode, isHydrated } = useTheme();
  const isDark = isHydrated && mode === "dark";
  const { data } = useMyAssignmentReminders();

  if (!data || data.items.length === 0) return null;

  const urgent = data.counts.overdue > 0;
  const Icon = urgent ? AlertTriangle : AlarmClock;

  return (
    <section
      aria-label="Assignment reminders"
      className={cn(
        "rounded-2xl border border-l-4 p-4 sm:p-5 transition-colors duration-200",
        isDark
          ? "bg-[#07142B] border-white/10 text-white shadow-[0_8px_30px_rgba(0,0,0,0.45)]"
          : "bg-white border-[#E8EDF5] text-[#071B41] shadow-[0_4px_20px_rgba(7,27,65,0.04)]",
        urgent ? "border-l-red-500" : "border-l-[#D49B35]"
      )}
    >
      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start sm:items-center gap-3.5">
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-xl border",
              urgent
                ? isDark
                  ? "bg-red-500/15 border-red-500/30 text-red-400"
                  : "bg-red-50 border-red-200 text-red-600"
                : isDark
                  ? "bg-[#112244] border-[#E2B355]/25 text-[#E2B355]"
                  : "bg-[#FDF4E1] border-[#F3DFB6] text-[#C58927]"
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
                isDark ? "text-[#94A3B8]" : "text-[#64748B]"
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
            isDark
              ? "bg-[#0B1B38] border-white/15 text-white hover:border-[#E2B355]"
              : "bg-white border-[#CBD5E1] text-[#071B41] hover:border-[#071B41]"
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
            isDark ? "text-[#94A3B8]" : "text-[#64748B]"
          )}
        >
          +{data.items.length - SHOWN} more on the assignments page
        </p>
      )}
    </section>
  );
}
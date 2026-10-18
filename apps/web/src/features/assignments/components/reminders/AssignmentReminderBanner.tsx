"use client";

import Link from "next/link";
import { AlarmClock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/Button";
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
        "rounded-panel border border-l-4 bg-app-surface p-4 shadow-card",
        urgent ? "border-app-danger/40 border-l-app-danger" : "border-warning/40 border-l-warning"
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full",
              urgent ? "bg-app-danger/10 text-app-danger-ink" : "bg-warning/10 text-warning-ink"
            )}
          >
            <Icon aria-hidden className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-bold text-app-text">
              {urgent ? "Assignments need your attention" : "Assignments due soon"}
            </h2>
            <p className="text-sm text-app-muted">You have {describeReminderCounts(data.counts)}.</p>
          </div>
        </div>
        <Button asChild className="self-start" size="sm" variant="outline">
          <Link href="/student/practice">See all assignments</Link>
        </Button>
      </div>
      <ul className="mt-3 space-y-0.5">
        {data.items.slice(0, SHOWN).map((item) => (
          <ReminderItemRow item={item} key={item.id} timeZone={timeZone} />
        ))}
      </ul>
      {data.items.length > SHOWN && (
        <p className="mt-1 px-2 text-xs text-app-muted">+{data.items.length - SHOWN} more on the assignments page</p>
      )}
    </section>
  );
}

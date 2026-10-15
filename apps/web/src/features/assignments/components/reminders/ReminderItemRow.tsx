"use client";

import Link from "next/link";
import { ASSIGNMENT_DUE_STATUS_LABELS, type AssignmentReminderItem } from "@nexa-chess/types";
import { ArrowRight } from "lucide-react";
import { formatDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";

const TONE: Record<AssignmentReminderItem["dueStatus"], string> = {
  DUE_SOON: "border-secondary/40 bg-secondary/10 text-secondary-ink",
  DUE_TODAY: "border-warning/40 bg-warning/10 text-warning-ink",
  OVERDUE: "border-app-danger/30 bg-app-danger/10 text-app-danger-ink"
};

export function ReminderItemRow({
  item,
  onNavigate,
  timeZone
}: {
  item: AssignmentReminderItem;
  onNavigate?: () => void;
  timeZone: string;
}) {
  return (
    <li>
      <Link
        className="flex items-center gap-3 rounded-control px-2 py-2 transition-colors hover:bg-app-soft"
        href={`/student/practice/${item.id}`}
        onClick={onNavigate}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-app-text">{item.title}</span>
          <span className="block truncate text-xs text-app-muted">
            {item.batchName} · due {formatDateTime(item.dueDate, timeZone)}
            {item.status === "IN_PROGRESS" ? " · started" : ""}
          </span>
        </span>
        <span className={cn("shrink-0 rounded border px-2 py-0.5 text-[11px] font-semibold", TONE[item.dueStatus])}>
          {ASSIGNMENT_DUE_STATUS_LABELS[item.dueStatus]}
        </span>
        <ArrowRight aria-hidden className="size-4 shrink-0 text-app-muted" />
      </Link>
    </li>
  );
}

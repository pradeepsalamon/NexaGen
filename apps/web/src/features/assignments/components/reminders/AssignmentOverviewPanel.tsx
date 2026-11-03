"use client";

import { useState } from "react";
import {
  ASSIGNMENT_DUE_STATUS_LABELS,
  ASSIGNMENT_OVERVIEW_AHEAD_DAYS,
  ASSIGNMENT_OVERVIEW_PAST_DAYS,
  type AssignmentOverviewQuery,
  type AssignmentOverviewRow
} from "@nexa-chess/types";
import { AlarmClock, AlertTriangle, CalendarClock, ChevronDown, ClipboardCheck, UserX } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatTile } from "@/components/ui/StatTile";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { useAssignmentOverview } from "../../hooks/useAssignmentsApi";
import { DUE_VARIANT } from "../assignmentBadges";

const count = (value: number | undefined) => (value === undefined ? "—" : String(value));

const STATUS_FILTERS: { label: string; value: "" | NonNullable<AssignmentOverviewQuery["dueStatus"]> }[] = [
  { label: "Every status", value: "" },
  { label: "Overdue", value: "OVERDUE" },
  { label: "Due today", value: "DUE_TODAY" },
  { label: "Due soon", value: "DUE_SOON" },
  { label: "Upcoming", value: "UPCOMING" }
];

/**
 * Coach (own batches) / admin (every batch): deployments due from
 * ASSIGNMENT_OVERVIEW_PAST_DAYS back to ASSIGNMENT_OVERVIEW_AHEAD_DAYS ahead,
 * overdue first, each expandable to the students who haven't finished.
 */
export function AssignmentOverviewPanel() {
  const timeZone = useUserTimeZone();
  const [batchId, setBatchId] = useState("");
  const [dueStatus, setDueStatus] = useState<"" | NonNullable<AssignmentOverviewQuery["dueStatus"]>>("");
  const query: AssignmentOverviewQuery = {
    batchId: batchId || undefined,
    dueStatus: dueStatus || undefined
  };
  const { data, isError, isLoading, refetch } = useAssignmentOverview(query);

  return (
    <div className="space-y-4">
      {/* Amber for attention: red stays for destructive actions and LIVE. */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile icon={AlertTriangle} label="Overdue assignments" tone="secondary" value={count(data?.totals.overdueDeployments)} />
        <StatTile icon={UserX} label="Students behind" tone="secondary" value={count(data?.totals.overdueStudents)} />
        <StatTile icon={AlarmClock} label="Unfinished, due today" tone="primary" value={count(data?.totals.dueToday)} />
        <StatTile icon={CalendarClock} label="Unfinished, due soon" tone="primary" value={count(data?.totals.dueSoon)} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-app-muted">
          Due dates from {ASSIGNMENT_OVERVIEW_PAST_DAYS} days ago to {ASSIGNMENT_OVERVIEW_AHEAD_DAYS} days ahead.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Select
            aria-label="Filter by batch"
            onChange={(e) => setBatchId(e.target.value)}
            options={[{ label: "All batches", value: "" }, ...(data?.batches ?? []).map((b) => ({ label: b.name, value: b.id }))]}
            value={batchId}
          />
          <Select
            aria-label="Filter by due status"
            onChange={(e) => setDueStatus(e.target.value as typeof dueStatus)}
            options={STATUS_FILTERS}
            value={dueStatus}
          />
        </div>
      </div>

      {isError ? (
        <WidgetError message="The due-date overview could not be loaded." onRetry={() => void refetch()} />
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton className="h-16 rounded-app" key={i} />
          ))}
        </div>
      ) : !data || data.rows.length === 0 ? (
        <EmptyState
          description={batchId || dueStatus ? "Nothing matches these filters." : "No assignment is due around now."}
          icon={ClipboardCheck}
          title="All clear"
        />
      ) : (
        <ul className="divide-y divide-app-border overflow-hidden rounded-app border border-app-border bg-app-surface shadow-card">
          {data.rows.map((row) => (
            <OverviewRow key={row.deploymentId} row={row} timeZone={timeZone} />
          ))}
        </ul>
      )}
    </div>
  );
}

function OverviewRow({ row, timeZone }: { row: AssignmentOverviewRow; timeZone: string }) {
  const [open, setOpen] = useState(row.dueStatus === "OVERDUE" && row.outstanding.length <= 5);
  const pct = row.total ? Math.round((row.completed / row.total) * 100) : 0;
  const expandable = row.outstanding.length > 0;

  return (
    <li>
        <button
          aria-expanded={expandable ? open : undefined}
          className={cn(
            "flex w-full flex-col gap-2 p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-app-focus sm:flex-row sm:items-center sm:gap-4",
            expandable ? "hover:bg-app-soft" : "cursor-default"
          )}
          disabled={!expandable}
          onClick={() => setOpen((v) => !v)}
          type="button"
        >
          <span className="min-w-0 flex-1 space-y-1">
            <span className="block break-words text-sm font-semibold text-app-text">{row.title}</span>
            <span className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium text-app-muted">{row.batchName}</span>
              <Badge variant={DUE_VARIANT[row.dueStatus]}>{ASSIGNMENT_DUE_STATUS_LABELS[row.dueStatus]}</Badge>
              <span className="text-app-muted">due {formatDateTime(row.dueDate, timeZone)}</span>
            </span>
          </span>
          <span className="flex items-center gap-3 sm:w-64">
            <span className="flex-1">
              <span className="flex justify-between text-xs text-app-muted">
                <span>
                  {row.completed}/{row.total} done
                </span>
                {row.inProgress > 0 && <span>{row.inProgress} started</span>}
              </span>
              <span
                aria-label="Completion"
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={pct}
                className="mt-1 block h-1.5 overflow-hidden rounded-full bg-app-soft"
                role="progressbar"
              >
                <span className="block h-full bg-primary" style={{ width: `${pct}%` }} />
              </span>
            </span>
            {expandable && (
              <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-app-muted transition-transform", open && "rotate-180")} />
            )}
          </span>
        </button>
        {expandable && open && (
          <div className="border-t border-app-border px-4 py-3">
            <p className="mb-2 text-xs font-semibold text-app-muted">Not finished yet</p>
            <ul className="flex flex-wrap gap-2">
              {row.outstanding.map((s) => (
                <li key={s.id}>
                  <Badge variant={s.status === "IN_PROGRESS" ? "warning" : "secondary"}>
                    {s.name}
                    {s.status === "IN_PROGRESS" ? " · started" : ""}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        )}
    </li>
  );
}

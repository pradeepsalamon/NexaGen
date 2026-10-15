"use client";

import { useState } from "react";
import {
  ASSIGNMENT_DUE_STATUS_LABELS,
  ASSIGNMENT_OVERVIEW_AHEAD_DAYS,
  ASSIGNMENT_OVERVIEW_PAST_DAYS,
  type AssignmentDueStatus,
  type AssignmentOverviewQuery,
  type AssignmentOverviewRow
} from "@nexa-chess/types";
import { AlarmClock, AlertTriangle, CalendarClock, ChevronDown, ClipboardCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { useAssignmentOverview } from "../../hooks/useAssignmentsApi";

const STATUS_TONE: Record<AssignmentDueStatus, string> = {
  COMPLETED: "border-success/40 bg-success/10 text-success-ink",
  DUE_SOON: "border-secondary/40 bg-secondary/10 text-secondary-ink",
  DUE_TODAY: "border-warning/40 bg-warning/10 text-warning-ink",
  OVERDUE: "border-app-danger/30 bg-app-danger/10 text-app-danger-ink",
  UPCOMING: "border-app-border bg-app-background text-app-muted"
};

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
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          icon={AlertTriangle}
          label="Overdue assignments"
          tone="danger"
          value={data?.totals.overdueDeployments}
        />
        <Stat icon={AlertTriangle} label="Students behind" tone="danger" value={data?.totals.overdueStudents} />
        <Stat icon={AlarmClock} label="Unfinished, due today" tone="warning" value={data?.totals.dueToday} />
        <Stat icon={CalendarClock} label="Unfinished, due soon" tone="secondary" value={data?.totals.dueSoon} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-app-muted">
          Due dates from {ASSIGNMENT_OVERVIEW_PAST_DAYS} days ago to {ASSIGNMENT_OVERVIEW_AHEAD_DAYS} days ahead.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
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
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton className="h-20 w-full" key={i} />
          ))}
        </div>
      ) : !data || data.rows.length === 0 ? (
        <Card className="p-6 sm:p-10">
          <EmptyState
            description={batchId || dueStatus ? "Nothing matches these filters." : "No assignment is due around now."}
            icon={ClipboardCheck}
            title="All clear"
          />
        </Card>
      ) : (
        <ul className="grid gap-3">
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
      <Card className="p-0">
        <button
          aria-expanded={expandable ? open : undefined}
          className={cn("flex w-full flex-col gap-2 p-4 text-left sm:flex-row sm:items-center sm:gap-4", !expandable && "cursor-default")}
          disabled={!expandable}
          onClick={() => setOpen((v) => !v)}
          type="button"
        >
          <span className="min-w-0 flex-1 space-y-1">
            <span className="block truncate font-semibold text-app-text">{row.title}</span>
            <span className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-medium text-app-muted">{row.batchName}</span>
              <span className={cn("rounded border px-2 py-0.5 font-semibold", STATUS_TONE[row.dueStatus])}>
                {ASSIGNMENT_DUE_STATUS_LABELS[row.dueStatus]}
              </span>
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
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-app-muted">Not finished yet</p>
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
      </Card>
    </li>
  );
}

const STAT_TONE = {
  danger: "bg-app-danger/10 text-app-danger-ink",
  secondary: "bg-secondary/10 text-secondary-ink",
  warning: "bg-warning/10 text-warning-ink"
} as const;

function Stat({
  icon: Icon,
  label,
  tone,
  value
}: {
  icon: typeof AlertTriangle;
  label: string;
  tone: keyof typeof STAT_TONE;
  value: number | undefined;
}) {
  return (
    <Card className="flex items-center gap-3 p-3">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", STAT_TONE[tone])}>
        <Icon aria-hidden className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-xl font-extrabold leading-none text-app-text">
          {value === undefined ? <span className="inline-block h-5 w-8 animate-pulse rounded bg-app-soft" /> : value}
        </span>
        <span className="block truncate text-xs text-app-muted">{label}</span>
      </span>
    </Card>
  );
}

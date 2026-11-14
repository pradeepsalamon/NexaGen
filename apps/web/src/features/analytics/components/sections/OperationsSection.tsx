"use client";

import type { AnalyticsAlert, AnalyticsRangeQuery } from "@nexa-chess/types";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  Info,
  Radio
} from "lucide-react";
import { SectionCard } from "@/components/ui/SectionCard";
import { WidgetError } from "@/components/ui/WidgetError";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/datetime";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import {
  useAlertsQuery,
  useOperationsQuery,
  useTodayQuery
} from "../../hooks/useAnalyticsApi";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useTableSort } from "@/hooks/useTableSort";
import { SortButton } from "@/components/ui/DataTableSortButton";

const SEVERITY: Record<
  AnalyticsAlert["severity"],
  { icon: typeof Info; className: string }
> = {
  info: { icon: Info, className: "text-primary-ink" },
  warning: { icon: CircleAlert, className: "text-warm" },
  critical: { icon: AlertTriangle, className: "text-app-danger" }
};

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-control bg-app-soft p-3 text-center">
      <p className={cn("text-xl font-extrabold text-app-text", tone)}>{value}</p>
      <p className="text-xs text-app-muted">{label}</p>
    </div>
  );
}

export function OperationsSection({ query }: { query: AnalyticsRangeQuery }) {
  const ops = useOperationsQuery(query);
  const today = useTodayQuery(query);
  const alerts = useAlertsQuery(query);
  const t = today.data;
  const tz = useUserTimeZone();
  const { rows: schedule, sortProps } = useTableSort({
    rows: t?.schedule,
    accessors: {
      coach: (c) => c.coachName,
      status: (c) => c.status,
      students: (c) => c.studentCount,
      time: (c) => c.time,
      topic: (c) => c.topic
    }
  });

  return (
    <>
      <SectionCard
        description="What's happening right now. Refreshes every minute."
        title="Today's operations"
        updatedAt={ops.data?.meta.generatedAt}
        onRefresh={() => {
          ops.refetch();
          today.refetch();
        }}
      >
        {ops.isError ? (
          <WidgetError message="Couldn't load operations." onRetry={() => ops.refetch()} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Classes today" value={ops.data?.classesToday ?? 0} />
              <Stat label="Live now" value={ops.data?.classesLiveNow ?? 0} tone={ops.data?.classesLiveNow ? "text-app-danger" : undefined} />
              <Stat label="Completed today" value={ops.data?.classesCompletedToday ?? 0} />
              <Stat label="Need attention" value={ops.data?.classesNeedingAttention ?? 0} tone={ops.data?.classesNeedingAttention ? "text-warm" : undefined} />
              <Stat label="Recording failures" value={ops.data?.recordingFailures ?? 0} tone={ops.data?.recordingFailures ? "text-warm" : undefined} />
              <Stat label="Missing recordings" value={ops.data?.missingRecordings ?? 0} />
              <Stat label="Unfinalized attendance" value={ops.data?.unfinalizedAttendance ?? 0} />
              <Stat label="Cancelled today" value={ops.data?.classesCancelledToday ?? 0} />
            </div>

            {t ? (
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-control bg-app-soft p-3 text-sm">
                  <p className="mb-1 font-bold text-app-text">Today&apos;s classes</p>
                  <p className="text-app-muted">
                    {t.classes.upcoming} upcoming · {t.classes.live} live ·{" "}
                    {t.classes.completed} done · {t.classes.cancelled} cancelled ·{" "}
                    {t.classes.noShow} no-show
                  </p>
                </div>
                <div className="rounded-control bg-app-soft p-3 text-sm">
                  <p className="mb-1 font-bold text-app-text">Today&apos;s coaches</p>
                  <p className="text-app-muted">
                    {t.coaches.scheduled} scheduled · {t.coaches.teaching} teaching ·{" "}
                    {t.coaches.completed} completed · {t.coaches.absent} absent
                  </p>
                </div>
                <div className="rounded-control bg-app-soft p-3 text-sm">
                  <p className="mb-1 font-bold text-app-text">Today&apos;s students</p>
                  <p className="text-app-muted">
                    {t.students.expected} expected · {t.students.attended} attended ·{" "}
                    {t.students.missed} missed
                  </p>
                </div>
              </div>
            ) : null}

            {t && t.schedule.length > 0 ? (
              <div className="mt-5 overflow-x-auto">
                <Table className="w-full min-w-[560px] text-left text-sm">
                  <TableHeader className="text-xs text-app-muted">
                    <TableRow>
                      <TableHead className="pb-2"><SortButton label="Time" {...sortProps("time")} /></TableHead>
                      <TableHead className="pb-2"><SortButton label="Class" {...sortProps("topic")} /></TableHead>
                      <TableHead className="pb-2"><SortButton label="Coach" {...sortProps("coach")} /></TableHead>
                      <TableHead className="pb-2 text-right"><SortButton label="Students" {...sortProps("students")} /></TableHead>
                      <TableHead className="pb-2"><SortButton label="Status" {...sortProps("status")} /></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-app-border">
                    {schedule.map((c) => (
                      <TableRow key={c.classId}>
                        <TableCell className="text-left py-2 text-app-muted">
                          {formatTime(c.time, tz)}
                        </TableCell>
                        <TableCell className="text-left py-2">
                          <Link className="text-primary-ink hover:underline" href={`/classes/${c.classId}`}>
                            {c.topic}
                          </Link>{" "}
                          <span className="text-xs text-app-muted">
                            ({c.type}
                            {c.batchName ? ` · ${c.batchName}` : ""})
                          </span>
                        </TableCell>
                        <TableCell className="text-left py-2 text-app-muted">{c.coachName}</TableCell>
                        <TableCell className="py-2 text-right">{c.studentCount}</TableCell>
                        <TableCell className="text-left py-2">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold">
                            {c.status === "LIVE" ? (
                              <Radio className="size-3 text-app-danger" />
                            ) : null}
                            {c.status}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : null}
          </>
        )}
      </SectionCard>

      <SectionCard
        description="Actionable issues only — resolved items disappear."
        title="Alerts & exceptions"
        updatedAt={alerts.data?.meta.generatedAt}
        onRefresh={() => alerts.refetch()}
      >
        {alerts.isError ? (
          <WidgetError message="Couldn't load alerts." onRetry={() => alerts.refetch()} />
        ) : (alerts.data?.alerts.length ?? 0) === 0 ? (
          <div className="flex items-center gap-2 rounded-app bg-app-soft p-4 text-sm text-app-muted">
            <CheckCircle2 className="size-5 text-accent" strokeWidth={2.5} />
            No issues need attention.
          </div>
        ) : (
          <ul className="space-y-2">
            {(alerts.data?.alerts ?? []).map((alert, i) => {
              const { icon: Icon, className } = SEVERITY[alert.severity];
              return (
                <li
                  className="flex items-start gap-3 rounded-app border border-app-border p-3"
                  key={`${alert.kind}-${i}`}
                >
                  <Icon className={cn("mt-0.5 size-5 shrink-0", className)} strokeWidth={2.25} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-app-text">{alert.title}</p>
                    <p className="text-sm text-app-muted">{alert.message}</p>
                  </div>
                  {alert.href ? (
                    <Link
                      className="shrink-0 text-xs font-semibold text-primary-ink hover:underline"
                      href={alert.href}
                    >
                      View →
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </>
  );
}

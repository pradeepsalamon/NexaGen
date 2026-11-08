"use client";

import { Fragment, memo, useState } from "react";
import {
  Users,
  Clock,
  History,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatTile } from "@/components/ui/StatTile";
import type {
  CoachTeachingHistory,
  CoachTeachingResponse,
} from "@nexa-chess/types";
import { AttendancePercentBar } from "./AttendancePercentBar";
import { EventTimeline } from "./class-detail/EventTimeline";
import { formatDate, formatDuration, formatTime } from "@/lib/datetime";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { useTableSort } from "@/hooks/useTableSort";
import { SortButton } from "@/components/ui/DataTableSortButton";

interface CoachAttendanceViewProps {
  data: CoachTeachingResponse;
}

export const CoachAttendanceView = memo(function CoachAttendanceView({
  data,
}: CoachAttendanceViewProps) {
  const { stats, history } = data;
  const tz = useUserTimeZone();
  const [expandedClass, setExpandedClass] = useState<string | null>(null);
  const { rows: sortedHistory, sortProps } = useTableSort({
    rows: history,
    accessors: {
      attendance: (r) => r.attendancePercent,
      board: (r) => r.boardDuration ?? 0,
      coachTime: (r) => r.coachTotalDuration ?? 0,
      date: (r) => r.actualStart ?? r.date,
      teaching: (r) => r.teachingDuration,
      topic: (r) => r.topic,
    },
  });

  const toggleClass = (id: string) =>
    setExpandedClass((current) => (current === id ? null : id));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile
          icon={Clock}
          label="Total teaching hours"
          tone="primary"
          value={`${stats.totalTeachingHours}h`}
        />
        <StatTile
          icon={History}
          label="Classes completed"
          tone="accent"
          value={`${stats.completedClasses}/${stats.totalClasses}`}
        />
        <StatTile
          icon={Users}
          label="Avg session length"
          tone="primary"
          value={`${stats.avgSessionMinutes}m`}
        />
        <StatTile
          icon={AlertTriangle}
          label="Late starts"
          tone="secondary"
          value={String(stats.lateStarts)}
        />
      </div>

      <section className="overflow-hidden rounded-app border border-app-border bg-app-surface shadow-card">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-app-border p-4">
          <h2 className="text-base font-semibold text-app-text">
            Recent classes
          </h2>
          {history.length > 0 ? (
            <span className="text-xs text-app-muted">
              Select a row for its event timeline
            </span>
          ) : null}
        </header>
        {history.length === 0 ? (
          <EmptyState
            illustration="attendance"
            title="No recent classes"
            variant="inline"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col" className="w-10">
                  <span className="sr-only">Expand</span>
                </TableHead>
                <TableHead scope="col">
                  <SortButton label="Date & time" {...sortProps("date")} />
                </TableHead>
                <TableHead scope="col">
                  <SortButton label="Topic / batch" {...sortProps("topic")} />
                </TableHead>
                <TableHead scope="col" className="md:w-52">
                  <SortButton
                    label="Student attendance"
                    {...sortProps("attendance")}
                  />
                </TableHead>
                <TableHead scope="col">
                  <SortButton
                    label="Teaching time"
                    {...sortProps("teaching")}
                  />
                </TableHead>
                <TableHead scope="col">
                  <SortButton
                    label="Coach attendance"
                    {...sortProps("coachTime")}
                  />
                </TableHead>
                <TableHead scope="col">
                  <SortButton label="Board usage" {...sortProps("board")} />
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedHistory.map((record: CoachTeachingHistory) => {
                const logs = record.logs ?? [];
                const isExpanded = expandedClass === record.id;
                return (
                  <Fragment key={record.id}>
                    <TableRow
                      onClick={() => toggleClass(record.id)}
                      className="cursor-pointer"
                    >
                      <TableCell className="w-10">
                        {logs.length > 0 && (
                          <button
                            type="button"
                            aria-label={
                              isExpanded
                                ? `Hide event timeline for ${record.topic}`
                                : `Show event timeline for ${record.topic}`
                            }
                            aria-expanded={isExpanded}
                            className="flex items-center justify-center rounded-control p-1 text-app-muted hover:bg-app-soft hover:text-app-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-focus"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleClass(record.id);
                            }}
                          >
                            {isExpanded ? (
                              <ChevronDown
                                className="h-4 w-4 text-app-muted"
                                aria-hidden="true"
                              />
                            ) : (
                              <ChevronRight
                                className="h-4 w-4 text-app-muted"
                                aria-hidden="true"
                              />
                            )}
                          </button>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap font-medium text-app-text">
                        {formatDate(record.actualStart ?? record.date, tz, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                        <span className="text-app-muted block text-xs mt-0.5">
                          {formatTime(record.actualStart ?? record.date, tz)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-app-text">
                          {record.topic}
                        </div>
                        <div className="text-xs text-app-muted mt-0.5">
                          {record.batchName}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <AttendancePercentBar
                            percent={record.attendancePercent}
                          />
                          <span className="text-xs text-app-muted">
                            {record.studentsPresent} / {record.totalStudents}{" "}
                            students
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium text-app-text">
                        {formatDuration(record.teachingDuration)}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-app-text">
                          {formatDuration(record.coachTotalDuration || 0)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-app-text">
                          {formatDuration(record.boardDuration || 0)}
                        </div>
                      </TableCell>
                    </TableRow>
                    {isExpanded && logs.length > 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="bg-app-soft">
                          <div className="pl-4">
                            <p className="text-xs font-semibold text-app-muted mb-2">
                              Event timeline
                            </p>
                            <EventTimeline
                              logs={logs}
                              className="space-y-1.5"
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
});

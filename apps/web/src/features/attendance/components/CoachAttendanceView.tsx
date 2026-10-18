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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type {
  CoachTeachingHistory,
  CoachTeachingResponse,
} from "@nexa-chess/types";
import { AttendancePercentBar } from "./AttendancePercentBar";
import { EventTimeline } from "./class-detail/EventTimeline";
import { formatDate, formatDuration, formatTime } from "@/lib/datetime";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useTableSort } from "@/hooks/useTableSort";
import { SortButton } from "@/components/ui/DataTableSortButton";

interface CoachAttendanceViewProps {
  data: CoachTeachingResponse;
  /** Hide the outer page-level heading (used inside dialogs). */
  hideHeading?: boolean;
}

export const CoachAttendanceView = memo(function CoachAttendanceView({
  data,
  hideHeading,
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
      topic: (r) => r.topic
    }
  });

  const toggleClass = (id: string) =>
    setExpandedClass((current) => (current === id ? null : id));

  return (
    <div className="space-y-6">
      {!hideHeading && (
        <div>
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">
            Attendance
          </h1>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-app-border bg-app-surface shadow-card">
          <CardContent className="p-5 flex flex-col justify-center h-full">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-control bg-primary/10 border border-primary/20">
                <Clock className="h-5 w-5 text-primary-ink" />
              </span>
            </div>
            <p className="text-3xl font-bold tracking-tight">{stats.totalTeachingHours}h</p>
            <p className="text-sm font-medium text-app-muted mt-1">Total Teaching Hours</p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-card">
          <CardContent className="p-5 flex flex-col justify-center h-full">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-control bg-success/10 border border-success/20">
                <History className="h-5 w-5 text-success-ink" />
              </span>
            </div>
            <div className="flex items-end gap-2">
              <p className="text-3xl font-bold tracking-tight text-success-ink">{stats.completedClasses}</p>
              <p className="text-sm text-app-muted font-medium mb-1">/ {stats.totalClasses}</p>
            </div>
            <p className="text-sm font-medium text-app-muted mt-1">Classes Completed</p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-card">
          <CardContent className="p-5 flex flex-col justify-center h-full">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-control bg-secondary/10 border border-secondary/20">
                <Users className="h-5 w-5 text-secondary-ink" />
              </span>
            </div>
            <p className="text-3xl font-bold tracking-tight text-secondary-ink">{stats.avgSessionMinutes}m</p>
            <p className="text-sm font-medium text-app-muted mt-1">Avg Session Length</p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-card">
          <CardContent className="p-5 flex flex-col justify-center h-full">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-control bg-warning/10 border border-warning/20">
                <AlertTriangle className="h-5 w-5 text-warning-ink" />
              </span>
            </div>
            <p className="text-3xl font-bold tracking-tight text-warning-ink">{stats.lateStarts}</p>
            <p className="text-sm font-medium text-app-muted mt-1">Late Starts</p>
          </CardContent>
        </Card>
      </div>

      {/* History Table */}
      <Card className="border-app-border bg-app-surface shadow-card overflow-hidden">
        <CardHeader className="bg-app-soft/50 border-b border-app-border">
          <CardTitle className="text-lg flex justify-between items-center">
            Recent Classes
            <span className="text-sm font-normal text-app-muted">
              Click a row for event details
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {history.length === 0 ? (
            <div className="p-8 text-center text-app-muted">
              No recent classes available.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="w-full text-sm">
                <TableHeader className="text-xs bg-app-background border-b border-app-border text-app-muted">
                  <TableRow className="text-center">
                    <TableHead scope="col" className="px-3 py-3 md:px-6 md:py-4 font-semibold" />
                    <TableHead scope="col" className="px-3 py-3 md:px-6 md:py-4 font-semibold"><SortButton label="Date & Time" {...sortProps("date")} /></TableHead>
                    <TableHead scope="col" className="px-3 py-3 md:px-6 md:py-4 font-semibold"><SortButton label="Topic / Batch" {...sortProps("topic")} /></TableHead>
                    <TableHead scope="col" className="px-3 py-3 md:px-6 md:py-4 font-semibold md:w-[200px]"><SortButton label="Student Attendance" {...sortProps("attendance")} /></TableHead>
                    <TableHead scope="col" className="px-3 py-3 md:px-6 md:py-4 font-semibold"><SortButton label="Teaching Time" {...sortProps("teaching")} /></TableHead>
                    <TableHead scope="col" className="px-3 py-3 md:px-6 md:py-4 font-semibold"><SortButton label="Coach Attendance" {...sortProps("coachTime")} /></TableHead>
                    <TableHead scope="col" className="px-3 py-3 md:px-6 md:py-4 font-semibold"><SortButton label="Board Usage" {...sortProps("board")} /></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-app-border text-center">
                  {sortedHistory.map((record: CoachTeachingHistory) => {
                    const logs = record.logs ?? [];
                    const isExpanded = expandedClass === record.id;
                    return (
                      <Fragment key={record.id}>
                        <TableRow
                          onClick={() => toggleClass(record.id)}
                          className="hover:bg-app-soft/50 transition-colors cursor-pointer"
                        >
                          <TableCell className="text-left px-3 py-3 md:px-6 md:py-4 w-10">
                            {logs.length > 0 &&
                              (isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-app-muted" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-app-muted" />
                              ))}
                          </TableCell>
                          <TableCell className="text-left px-3 py-3 md:px-6 md:py-4 whitespace-nowrap text-app-text font-medium">
                            {formatDate(record.actualStart ?? record.date, tz, {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })}
                            <span className="text-app-muted block text-xs mt-0.5">
                              {formatTime(record.actualStart ?? record.date, tz)}
                            </span>
                          </TableCell>
                          <TableCell className="text-left px-3 py-3 md:px-6 md:py-4">
                            <div className="font-medium text-app-text">{record.topic}</div>
                            <div className="text-xs text-app-muted mt-0.5">{record.batchName}</div>
                          </TableCell>
                          <TableCell className="text-left px-3 py-3 md:px-6 md:py-4">
                            <div className="flex flex-col gap-1">
                              <AttendancePercentBar percent={record.attendancePercent} />
                              <span className="text-xs text-app-muted text-right">
                                {record.studentsPresent} / {record.totalStudents} students
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-left px-3 py-3 md:px-6 md:py-4 text-app-muted font-medium">
                            {formatDuration(record.teachingDuration)}
                          </TableCell>
                          <TableCell className="text-left px-3 py-3 md:px-6 md:py-4">
                            <div className="font-medium text-app-text">
                              {formatDuration(record.coachTotalDuration || 0)}
                            </div>
                          </TableCell>
                          <TableCell className="text-left px-3 py-3 md:px-6 md:py-4">
                            <div className="font-medium text-primary-ink">
                              {formatDuration(record.boardDuration || 0)}
                            </div>
                          </TableCell>
                        </TableRow>
                        {isExpanded && logs.length > 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="px-3 py-3 md:px-6 md:py-4 bg-app-soft/30 text-left">
                              <div className="pl-4">
                                <p className="text-xs font-semibold text-app-muted mb-2">
                                  Event Timeline
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
});

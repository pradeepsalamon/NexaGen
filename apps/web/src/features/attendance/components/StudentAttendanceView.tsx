"use client";

import { memo, useMemo, useState } from "react";
import {
  Flame,
  Calendar,
  Download,
  Search,
  Info,
  CheckCircle2,
  Clock,
  FilterX,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { StatTile } from "@/components/ui/StatTile";
import type {
  StudentAttendanceHistory,
  StudentAttendanceResponse,
} from "@nexa-chess/types";
import { AttendanceStatusBadge } from "./AttendanceStatusBadge";
import { AttendancePercentBar } from "./AttendancePercentBar";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate, formatTime } from "@/lib/datetime";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useTableSort } from "@/hooks/useTableSort";
import { SortButton } from "@/components/ui/DataTableSortButton";
import { Input } from "@/components/ui/Input";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { EmptyState } from "@/components/ui/EmptyState";

/** Seconds → whole minutes, floored (matches `formatDuration`). */
const toMinutes = (seconds: number | null | undefined) => Math.floor((seconds || 0) / 60);

interface StudentAttendanceViewProps {
  data: StudentAttendanceResponse;
  onRowClick?: (record: StudentAttendanceHistory) => void;
  /** Hide the outer page-level heading (used inside dialogs). */
  hideHeading?: boolean;
}

type StatusFilter = "ALL" | "PRESENT" | "LATE" | "PARTIAL" | "ABSENT";

export const StudentAttendanceView = memo(function StudentAttendanceView({
  data,
  onRowClick,
  hideHeading,
}: StudentAttendanceViewProps) {
  const { stats, history } = data;
  const interactive = typeof onRowClick === "function";
  const timeZone = useUserTimeZone();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredHistory = useMemo(() => {
    return history.filter((record) => {
      // Status filter
      if (statusFilter !== "ALL" && record.status !== statusFilter) {
        return false;
      }
      // Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const topicMatch = record.topic?.toLowerCase().includes(q);
        const coachMatch = record.coachName?.toLowerCase().includes(q);
        const batchMatch = record.batchName?.toLowerCase().includes(q);
        if (!topicMatch && !coachMatch && !batchMatch) {
          return false;
        }
      }
      return true;
    });
  }, [history, statusFilter, searchQuery]);
  const { rows: sortedHistory, sortProps } = useTableSort({
    rows: filteredHistory,
    accessors: {
      class: (r) => r.actualStart ?? r.date,
      duration: (r) => r.actualDuration,
      engagement: (r) => r.attendancePercent,
      instructor: (r) => r.coachName,
      status: (r) => r.status
    }
  });

  const handleExportCSV = () => {
    if (!history.length) return;
    const headers = [
      "Date",
      "Time",
      "Class / Topic",
      "Instructor",
      "Batch",
      "Status",
      "Attended Duration (min)",
      "Class Duration (min)",
      "Attendance %",
    ];
    const rows = history.map((r) => {
      const rawDate = r.actualStart ?? r.date;
      const formattedDate = formatFullDate(rawDate, timeZone);
      const formattedTime = formatTime(rawDate, timeZone);
      return [
        `"${formattedDate}"`,
        `"${formattedTime}"`,
        `"${(r.topic || "").replace(/"/g, '""')}"`,
        `"${(r.coachName || "").replace(/"/g, '""')}"`,
        `"${(r.batchName || "").replace(/"/g, '""')}"`,
        r.status,
        toMinutes(r.actualDuration),
        toMinutes(r.classActualDuration || r.scheduledDuration),
        `${r.attendancePercent ?? 0}%`,
      ];
    });
    const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `attendance_report_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {!hideHeading && (
        <PageHeader
          actions={
            <Button onClick={handleExportCSV} size="sm" variant="outline">
              <Download aria-hidden="true" className="size-4" strokeWidth={2.5} />
              Download CSV
            </Button>
          }
          description="Your class history, time in class and attendance streak."
          title="Attendance"
        />
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {/* The API reports 100% when nothing has been held yet; show a dash instead. */}
        <StatTile
          icon={CheckCircle2}
          label="Overall attendance"
          progress={stats.total > 0 ? stats.percentage : undefined}
          tone="accent"
          value={stats.total > 0 ? `${stats.percentage}%` : "—"}
        />
        <StatTile icon={CheckCircle2} label="Classes attended" tone="accent" value={`${stats.attended}/${stats.total}`} />
        <StatTile icon={Clock} label="Time in class" tone="primary" value={`${stats.totalLearningHours} hrs`} />
        <StatTile
          icon={Flame}
          label="Current streak"
          tone="reward"
          value={`${stats.currentStreak} ${stats.currentStreak === 1 ? "class" : "classes"}`}
        />
        <div className="col-span-2 sm:col-span-1">
          <StatTile icon={Calendar} label="This month" tone="primary" value={stats.total > 0 ? `${stats.monthlyPercent}%` : "—"} />
        </div>
      </div>

      {/* Class History Card */}
      <div className="bg-app-surface border border-app-border rounded-app shadow-card overflow-hidden">
        {/* Card Header with Status Filter Pills and Search */}
        <div className="p-5 border-b border-app-border flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-app-text">Class history</h2>
            {interactive && (
              <span className="text-xs font-normal text-app-muted hidden sm:inline">
                Select a class for its join and leave log
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Status Filter Buttons */}
            <div className="flex bg-app-soft/80 p-1 rounded-control border border-app-border">
              {(["ALL", "PRESENT", "LATE", "PARTIAL", "ABSENT"] as const).map((status) => {
                const isActive = statusFilter === status;
                const label = status === "ALL" ? "All" : status.charAt(0) + status.slice(1).toLowerCase();
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-control transition ${
                      isActive
                        ? "bg-app-surface text-app-text shadow-xs font-bold"
                        : "text-app-muted hover:text-app-text hover:bg-app-surface/50"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Search Input */}
            <div className="relative flex-1 sm:w-64 sm:flex-initial">
              <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-app-muted pointer-events-none" />
              <Input
                aria-label="Search classes"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search classes..."
                className="min-h-10 pl-9"
              />
            </div>
          </div>
        </div>

        {/* Table Content */}
        {filteredHistory.length === 0 ? (
          <EmptyState
            action={
              statusFilter !== "ALL" || searchQuery
                ? {
                    label: "Reset filters",
                    onClick: () => {
                      setStatusFilter("ALL");
                      setSearchQuery("");
                    }
                  }
                : undefined
            }
            description={
              history.length === 0
                ? "No attendance records available yet."
                : "No class records match your selected filter or search terms."
            }
            icon={FilterX}
            title="No records found"
            variant="inline"
          />
        ) : (
          <div className="overflow-x-auto">
            <Table className="w-full text-left border-collapse">
              <TableHeader>
                <TableRow className="border-b border-app-border bg-app-soft/50 text-xs font-semibold text-app-muted">
                  <TableHead scope="col" className="px-5 py-3.5"><SortButton label="Class / Topic" {...sortProps("class")} /></TableHead>
                  <TableHead scope="col" className="px-5 py-3.5"><SortButton label="Instructor" {...sortProps("instructor")} /></TableHead>
                  <TableHead scope="col" className="px-5 py-3.5"><SortButton label="Status" {...sortProps("status")} /></TableHead>
                  <TableHead scope="col" className="px-5 py-3.5"><SortButton label="Duration" {...sortProps("duration")} /></TableHead>
                  <TableHead scope="col" className="px-5 py-3.5 md:w-[180px]"><SortButton label="Engagement" {...sortProps("engagement")} /></TableHead>
                  <TableHead scope="col" className="px-5 py-3.5 text-right">Logs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-app-border">
                {sortedHistory.map((record) => {
                  const rawDate = record.actualStart ?? record.date;
                  const formattedDate = formatFullDate(rawDate, timeZone);
                  const formattedTime = formatTime(rawDate, timeZone);
                  // Whole minutes, floored — the session-log dialog shows the same.
                  const actualMins = toMinutes(record.actualDuration);
                  const totalMins = toMinutes(
                    record.classActualDuration || record.scheduledDuration
                  );

                  return (
                    <TableRow
                      key={record.id}
                      onClick={interactive ? () => onRowClick?.(record) : undefined}
                      className={`group transition-colors ${
                        interactive ? "hover:bg-app-soft/50 cursor-pointer" : ""
                      }`}
                    >
                      <TableCell className="text-left px-5 py-4">
                        <div className="font-semibold text-app-text">{record.topic}</div>
                        <div className="text-xs text-app-muted mt-0.5">
                          {formattedDate} • {formattedTime}
                        </div>
                      </TableCell>
                      <TableCell className="text-left px-5 py-4">
                        <div className="font-medium text-app-text">{record.coachName}</div>
                        <div className="text-xs text-app-muted mt-0.5">{record.batchName}</div>
                      </TableCell>
                      <TableCell className="text-left px-5 py-4">
                        <AttendanceStatusBadge status={record.status} />
                      </TableCell>
                      <TableCell className="text-left px-5 py-4 text-sm text-app-text">
                        <span>{actualMins}m</span>{" "}
                        <span className="text-xs text-app-muted">/ {totalMins}m</span>
                      </TableCell>
                      <TableCell className="text-left px-5 py-4">
                        <AttendancePercentBar percent={record.attendancePercent} />
                      </TableCell>
                      <TableCell className="px-5 py-4 text-right">
                        <SimpleTooltip label="View attendance logs">
                          <Button
                            aria-label={`View attendance logs for ${record.topic}, ${formattedDate}`}
                            variant="neutral"
                            size="icon"
                            className="size-8"
                            disabled={!interactive}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (interactive) onRowClick?.(record);
                            }}
                          >
                            <Info aria-hidden="true" className="size-4" strokeWidth={2.5} />
                          </Button>
                        </SimpleTooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
});

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
import { Button } from "@/components/ui/Button";
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

interface StudentAttendanceViewProps {
  data: StudentAttendanceResponse;
  onRowClick?: (record: StudentAttendanceHistory) => void;
  /** Hide the outer page-level heading (used inside dialogs). */
  hideHeading?: boolean;
}

type StatusFilter = "ALL" | "PRESENT" | "LATE" | "ABSENT";

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
    },
    initialKey: "class"
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
        Math.round((r.actualDuration || 0) / 60),
        Math.round((r.classActualDuration || r.scheduledDuration || 0) / 60),
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
      {/* Page Header */}
      {!hideHeading && (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">
              Attendance &amp; Participation
            </h1>
            <p className="text-app-muted mt-1 text-sm md:text-base">
              Track your session history, engagement metrics, and class streaks.
            </p>
          </div>
          <Button
            variant="primary"
            onClick={handleExportCSV}
            className="rounded-full shadow-card flex items-center gap-2"
          >
            <Download className="size-4" strokeWidth={2.5} />
            <span>Download Attendance Report (CSV)</span>
          </Button>
        </div>
      )}

      {/* KPI Grid (5 Cards matching Stitch layout) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {/* KPI 1: Overall Attendance */}
        <div className="bg-app-surface border border-app-border rounded-app p-5 shadow-card flex flex-col items-center justify-center text-center transition-all hover:shadow-md">
          <div className="relative w-16 h-16 flex items-center justify-center mb-2">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-app-soft stroke-current"
                strokeWidth="3.5"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="text-success transition-all duration-700 ease-out stroke-current"
                strokeDasharray={`${Math.min(100, Math.max(0, stats.percentage))}, 100`}
                strokeWidth="3.5"
                strokeLinecap="round"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <span className="absolute text-lg font-bold text-app-text">{stats.percentage}%</span>
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-app-muted">Overall</span>
        </div>

        {/* KPI 2: Classes Attended */}
        <div className="bg-app-surface border border-app-border rounded-app p-5 shadow-card flex flex-col items-center justify-center text-center transition-all hover:shadow-md">
          <div className="w-12 h-12 bg-emerald-500/10 text-emerald-600 rounded-full flex items-center justify-center mb-3">
            <CheckCircle2 className="size-6" strokeWidth={2.5} />
          </div>
          <span className="text-2xl font-bold text-app-text">{stats.attended}/{stats.total}</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-app-muted mt-1">Attended</span>
        </div>

        {/* KPI 3: Total Learning Time */}
        <div className="bg-app-surface border border-app-border rounded-app p-5 shadow-card flex flex-col items-center justify-center text-center transition-all hover:shadow-md">
          <div className="w-12 h-12 bg-purple-500/10 text-purple-600 rounded-full flex items-center justify-center mb-3">
            <Clock className="size-6" strokeWidth={2.5} />
          </div>
          <span className="text-2xl font-bold text-app-text">{stats.totalLearningHours} hrs</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-app-muted mt-1">Total Time</span>
        </div>

        {/* KPI 4: Current Streak */}
        <div className="bg-app-surface border border-app-border rounded-app p-5 shadow-card flex flex-col items-center justify-center text-center transition-all hover:shadow-md">
          <div className="w-12 h-12 bg-orange-500/10 text-orange-600 rounded-full flex items-center justify-center mb-3">
            <Flame className="size-6" strokeWidth={2.5} />
          </div>
          <span className="text-2xl font-bold text-app-text">{stats.currentStreak} Classes</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-app-muted mt-1">Current Streak</span>
        </div>

        {/* KPI 5: This Month */}
        <div className="bg-app-surface border border-app-border rounded-app p-5 shadow-card flex flex-col items-center justify-center text-center transition-all hover:shadow-md col-span-2 sm:col-span-1">
          <div className="w-12 h-12 bg-primary/10 text-primary-ink rounded-full flex items-center justify-center mb-3">
            <Calendar className="size-6" strokeWidth={2.5} />
          </div>
          <span className="text-2xl font-bold text-app-text">{stats.monthlyPercent}%</span>
          <span className="text-xs font-semibold uppercase tracking-wider text-app-muted mt-1">This Month</span>
        </div>
      </div>

      {/* Class History Card */}
      <div className="bg-app-surface border border-app-border rounded-app shadow-card overflow-hidden">
        {/* Card Header with Status Filter Pills and Search */}
        <div className="p-5 border-b border-app-border flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-app-text">Class History</h2>
            {interactive && (
              <span className="text-xs font-normal text-app-muted hidden sm:inline">
                (Click row or info icon for detailed logs)
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Status Filter Buttons */}
            <div className="flex bg-app-soft/80 p-1 rounded-control border border-app-border">
              {(["ALL", "PRESENT", "LATE", "ABSENT"] as const).map((status) => {
                const isActive = statusFilter === status;
                const label = status === "ALL" ? "All" : status.charAt(0) + status.slice(1).toLowerCase();
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-control transition-all ${
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
          <div className="p-12 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-app-soft flex items-center justify-center mb-3 text-app-muted">
              <FilterX className="size-6" />
            </div>
            <h3 className="text-base font-semibold text-app-text">No records found</h3>
            <p className="text-sm text-app-muted mt-1 max-w-sm">
              {history.length === 0
                ? "No attendance records available yet."
                : "No class records match your selected filter or search terms."}
            </p>
            {(statusFilter !== "ALL" || searchQuery) && (
              <Button
                variant="outline"
                size="sm"
                className="mt-4 rounded-full text-xs"
                onClick={() => {
                  setStatusFilter("ALL");
                  setSearchQuery("");
                }}
              >
                Reset Filters
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="w-full text-left border-collapse">
              <TableHeader>
                <TableRow className="border-b border-app-border bg-app-soft/50 text-xs font-semibold uppercase tracking-wider text-app-muted">
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
                  const actualMins = Math.round((record.actualDuration || 0) / 60);
                  const totalMins = Math.round(
                    (record.classActualDuration || record.scheduledDuration || 0) / 60
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 rounded-full border border-primary bg-primary p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:text-white"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (interactive) onRowClick?.(record);
                          }}
                          title="View Attendance Logs"
                        >
                          <Info className="size-4" strokeWidth={2.5} />
                        </Button>
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

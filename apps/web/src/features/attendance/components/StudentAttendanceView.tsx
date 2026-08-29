"use client";

import { memo } from "react";
import { CheckCircle2, Users, Clock, Percent, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type {
  StudentAttendanceHistory,
  StudentAttendanceResponse,
} from "@nexa-chess/types";
import { AttendanceStatusBadge } from "./AttendanceStatusBadge";
import { AttendancePercentBar } from "./AttendancePercentBar";

function formatDuration(seconds: number) {
  if (!seconds) return "0 min";
  return `${Math.floor(seconds / 60)} min`;
}

interface StudentAttendanceViewProps {
  data: StudentAttendanceResponse;
  onRowClick?: (record: StudentAttendanceHistory) => void;
  /** Hide the outer page-level heading (used inside dialogs). */
  hideHeading?: boolean;
}

export const StudentAttendanceView = memo(function StudentAttendanceView({
  data,
  onRowClick,
  hideHeading,
}: StudentAttendanceViewProps) {
  const { stats, history } = data;
  const interactive = typeof onRowClick === "function";

  return (
    <div className="space-y-6">
      {!hideHeading && (
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-app-text">Attendance</h1>
          <p className="text-app-muted mt-1">
            Track live class participation and learning time
          </p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <Card className="border-app-border bg-app-surface shadow-sm">
          <CardContent className="p-5 flex flex-col justify-center h-full">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                <Percent className="h-5 w-5 text-primary" />
              </span>
            </div>
            <p className="text-3xl font-bold tracking-tight">{stats.percentage}%</p>
            <p className="text-sm font-medium text-app-muted mt-1">Overall Attendance</p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-sm">
          <CardContent className="p-5 flex flex-col justify-center h-full">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </span>
            </div>
            <div className="flex items-end gap-2">
              <p className="text-3xl font-bold tracking-tight text-green-600">{stats.attended}</p>
              <p className="text-sm text-app-muted font-medium mb-1">/ {stats.total}</p>
            </div>
            <p className="text-sm font-medium text-app-muted mt-1">Classes Attended</p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-sm">
          <CardContent className="p-5 flex flex-col justify-center h-full">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <Clock className="h-5 w-5 text-purple-500" />
              </span>
            </div>
            <p className="text-3xl font-bold tracking-tight text-purple-600">{stats.totalLearningHours}h</p>
            <p className="text-sm font-medium text-app-muted mt-1">Learning Time</p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-sm">
          <CardContent className="p-5 flex flex-col justify-center h-full">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
                <Target className="h-5 w-5 text-orange-500" />
              </span>
            </div>
            <p className="text-3xl font-bold tracking-tight text-orange-500">{stats.currentStreak}</p>
            <p className="text-sm font-medium text-app-muted mt-1">Current Streak</p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-sm">
          <CardContent className="p-5 flex flex-col justify-center h-full">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Users className="h-5 w-5 text-blue-500" />
              </span>
            </div>
            <p className="text-3xl font-bold tracking-tight text-blue-600">{stats.monthlyPercent}%</p>
            <p className="text-sm font-medium text-app-muted mt-1">This Month</p>
          </CardContent>
        </Card>
      </div>

      {/* History Table */}
      <Card className="border-app-border bg-app-surface shadow-sm overflow-hidden">
        <CardHeader className="bg-app-soft/50 border-b border-app-border">
          <CardTitle className="text-lg flex justify-between items-center">
            Attendance History
            {interactive && (
              <span className="text-sm font-normal text-app-muted">
                Click a row for detailed logs
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {history.length === 0 ? (
            <div className="p-8 text-center text-app-muted">
              No class history available.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase bg-app-background border-b border-app-border text-app-muted">
                  <tr>
                    <th scope="col" className="px-3 py-3 md:px-6 md:py-4 font-semibold">Date &amp; Time</th>
                    <th scope="col" className="px-3 py-3 md:px-6 md:py-4 font-semibold">Topic / Coach</th>
                    <th scope="col" className="px-3 py-3 md:px-6 md:py-4 font-semibold">Batch</th>
                    <th scope="col" className="px-3 py-3 md:px-6 md:py-4 font-semibold md:w-[200px]">Attendance %</th>
                    <th scope="col" className="px-3 py-3 md:px-6 md:py-4 font-semibold">Duration</th>
                    <th scope="col" className="px-3 py-3 md:px-6 md:py-4 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-app-border">
                  {history.map((record: StudentAttendanceHistory) => (
                    <tr
                      key={record.id}
                      onClick={interactive ? () => onRowClick?.(record) : undefined}
                      className={
                        "transition-colors" +
                        (interactive
                          ? " hover:bg-app-soft/50 cursor-pointer"
                          : "")
                      }
                    >
                      <td className="px-3 py-3 md:px-6 md:py-4 whitespace-nowrap text-app-text font-medium">
                        {new Date(record.date).toLocaleDateString(undefined, {
                          weekday: "short", month: "short", day: "numeric",
                        })}
                        <span className="text-app-muted block text-xs mt-0.5">
                          {new Date(record.date).toLocaleTimeString(undefined, {
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </span>
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        <div className="font-medium text-app-text">{record.topic}</div>
                        <div className="text-xs text-app-muted mt-0.5">{record.coachName}</div>
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4 text-app-muted">{record.batchName}</td>
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        <AttendancePercentBar percent={record.attendancePercent} />
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4 text-app-muted">
                        {formatDuration(record.actualDuration)}{" "}
                        <span className="text-xs">/ {formatDuration(record.scheduledDuration)}</span>
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        <AttendanceStatusBadge status={record.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
});

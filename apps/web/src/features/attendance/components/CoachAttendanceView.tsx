"use client";

import { memo } from "react";
import { Users, Clock, History, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type {
  CoachTeachingHistory,
  CoachTeachingResponse,
} from "@nexa-chess/types";
import { AttendancePercentBar } from "./AttendancePercentBar";

function formatDuration(seconds: number) {
  if (!seconds) return "0 min";
  return `${Math.floor(seconds / 60)} min`;
}

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

  return (
    <div className="space-y-6">
      {!hideHeading && (
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-app-text">
            Teaching Attendance
          </h1>
          <p className="text-app-muted mt-1">
            Track teaching hours and class attendance
          </p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-app-border bg-app-surface shadow-sm">
          <CardContent className="p-5 flex flex-col justify-center h-full">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Clock className="h-5 w-5 text-blue-500" />
              </span>
            </div>
            <p className="text-3xl font-bold tracking-tight">{stats.totalTeachingHours}h</p>
            <p className="text-sm font-medium text-app-muted mt-1">Total Teaching Hours</p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-sm">
          <CardContent className="p-5 flex flex-col justify-center h-full">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                <History className="h-5 w-5 text-green-500" />
              </span>
            </div>
            <div className="flex items-end gap-2">
              <p className="text-3xl font-bold tracking-tight text-green-600">{stats.completedClasses}</p>
              <p className="text-sm text-app-muted font-medium mb-1">/ {stats.totalClasses}</p>
            </div>
            <p className="text-sm font-medium text-app-muted mt-1">Classes Completed</p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-sm">
          <CardContent className="p-5 flex flex-col justify-center h-full">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
                <Users className="h-5 w-5 text-orange-500" />
              </span>
            </div>
            <p className="text-3xl font-bold tracking-tight text-orange-500">{stats.avgSessionMinutes}m</p>
            <p className="text-sm font-medium text-app-muted mt-1">Avg Session Length</p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-sm">
          <CardContent className="p-5 flex flex-col justify-center h-full">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </span>
            </div>
            <p className="text-3xl font-bold tracking-tight text-red-500">{stats.lateStarts}</p>
            <p className="text-sm font-medium text-app-muted mt-1">Late Starts</p>
          </CardContent>
        </Card>
      </div>

      {/* History Table */}
      <Card className="border-app-border bg-app-surface shadow-sm overflow-hidden">
        <CardHeader className="bg-app-soft/50 border-b border-app-border">
          <CardTitle className="text-lg">Recent Classes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {history.length === 0 ? (
            <div className="p-8 text-center text-app-muted">
              No recent classes available.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase bg-app-background border-b border-app-border text-app-muted">
                  <tr>
                    <th scope="col" className="px-3 py-3 md:px-6 md:py-4 font-semibold">Date &amp; Time</th>
                    <th scope="col" className="px-3 py-3 md:px-6 md:py-4 font-semibold">Topic / Batch</th>
                    <th scope="col" className="px-3 py-3 md:px-6 md:py-4 font-semibold md:w-[200px]">Student Attendance</th>
                    <th scope="col" className="px-3 py-3 md:px-6 md:py-4 font-semibold">Teaching Time</th>
                    <th scope="col" className="px-3 py-3 md:px-6 md:py-4 font-semibold">Coach Attendance</th>
                    <th scope="col" className="px-3 py-3 md:px-6 md:py-4 font-semibold">Board Usage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-app-border">
                  {history.map((record: CoachTeachingHistory) => (
                    <tr key={record.id} className="hover:bg-app-soft/50 transition-colors">
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
                        <div className="text-xs text-app-muted mt-0.5">{record.batchName}</div>
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        <div className="flex flex-col gap-1">
                          <AttendancePercentBar percent={record.attendancePercent} />
                          <span className="text-xs text-app-muted text-right">
                            {record.studentsPresent} / {record.totalStudents} students
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4 text-app-muted font-medium">
                        {formatDuration(record.teachingDuration)}
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        <div className="font-medium text-app-text">
                          {formatDuration(record.coachTotalDuration || 0)}
                        </div>
                      </td>
                      <td className="px-3 py-3 md:px-6 md:py-4">
                        <div className="font-medium text-blue-500">
                          {formatDuration(record.boardDuration || 0)}
                        </div>
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

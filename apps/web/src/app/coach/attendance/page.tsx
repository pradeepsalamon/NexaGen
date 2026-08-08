"use client";

import { useEffect, useState } from "react";
import { Loader2, Users, Clock, History, CalendarX, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { apiFetch } from "@/lib/api";
import { API_ROUTES, type CoachTeachingResponse, type CoachTeachingHistory } from "@nexa-chess/types";
import { AttendancePercentBar } from "@/features/attendance/components/AttendancePercentBar";

export default function CoachAttendancePage() {
  const [data, setData] = useState<CoachTeachingResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const result = await apiFetch<CoachTeachingResponse>(API_ROUTES.attendance.coach);
        setData(result);
      } catch (error) {
        console.error("Failed to load teaching stats", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadStats();
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center">
        <div className="p-4 bg-app-soft rounded-full mb-4">
          <CalendarX className="h-10 w-10 text-app-muted" />
        </div>
        <h2 className="text-xl font-semibold mb-2">No Teaching Data</h2>
        <p className="text-app-muted max-w-md">
          There are no teaching records to display yet.
        </p>
      </div>
    );
  }

  const { stats, history } = data;

  const formatDuration = (seconds: number) => {
    if (!seconds) return "0 min";
    const minutes = Math.floor(seconds / 60);
    return `${minutes} min`;
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-app-text">Teaching Attendance</h1>
          <p className="text-app-muted mt-1">Track your teaching hours and class attendance</p>
        </div>
      </div>

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
                    <th scope="col" className="px-6 py-4 font-semibold">Date & Time</th>
                    <th scope="col" className="px-6 py-4 font-semibold">Topic / Batch</th>
                    <th scope="col" className="px-6 py-4 font-semibold w-[200px]">Student Attendance</th>
                    <th scope="col" className="px-6 py-4 font-semibold">Teaching Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-app-border">
                  {history.map((record: CoachTeachingHistory) => (
                    <tr key={record.id} className="hover:bg-app-soft/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-app-text font-medium">
                        {new Date(record.date).toLocaleDateString(undefined, { 
                          weekday: 'short', month: 'short', day: 'numeric' 
                        })}
                        <span className="text-app-muted block text-xs mt-0.5">
                          {new Date(record.date).toLocaleTimeString(undefined, {
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-app-text">{record.topic}</div>
                        <div className="text-xs text-app-muted mt-0.5">{record.batchName}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1">
                          <AttendancePercentBar percent={record.attendancePercent} />
                          <span className="text-xs text-app-muted text-right">
                            {record.studentsPresent} / {record.totalStudents} students
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-app-muted font-medium">
                        {formatDuration(record.teachingDuration)}
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
}

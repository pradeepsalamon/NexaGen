"use client";

import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, XCircle, Users, Percent, CalendarX } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { apiFetch } from "@/lib/api";
import { API_ROUTES, StudentAttendanceResponse, StudentAttendanceHistory } from "@nexa-gen/types";

export default function StudentAttendancePage() {
  const [data, setData] = useState<StudentAttendanceResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadAttendance() {
      try {
        const result = await apiFetch<StudentAttendanceResponse>(API_ROUTES.student.attendance);
        setData(result);
      } catch (error) {
        console.error("Failed to load attendance", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadAttendance();
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
        <h2 className="text-xl font-semibold mb-2">No Attendance Data</h2>
        <p className="text-app-muted max-w-md">
          There are no attendance records to display yet. Join a live class to start tracking your attendance.
        </p>
      </div>
    );
  }

  const { stats, history } = data;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-app-text">Attendance</h1>
          <p className="text-app-muted mt-1">Track your live class participation and history</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-app-border bg-app-surface shadow-sm">
          <CardContent className="p-5 flex flex-col justify-center">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                <Users className="h-5 w-5 text-primary" />
              </span>
            </div>
            <p className="text-3xl font-bold tracking-tight">{stats.total}</p>
            <p className="text-sm font-medium text-app-muted mt-1">Total Classes</p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-sm">
          <CardContent className="p-5 flex flex-col justify-center">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </span>
            </div>
            <p className="text-3xl font-bold tracking-tight text-green-600">{stats.attended}</p>
            <p className="text-sm font-medium text-app-muted mt-1">Classes Attended</p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-sm">
          <CardContent className="p-5 flex flex-col justify-center">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                <XCircle className="h-5 w-5 text-red-500" />
              </span>
            </div>
            <p className="text-3xl font-bold tracking-tight text-red-500">{stats.missed}</p>
            <p className="text-sm font-medium text-app-muted mt-1">Classes Missed</p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-sm">
          <CardContent className="p-5 flex flex-col justify-center">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Percent className="h-5 w-5 text-blue-500" />
              </span>
            </div>
            <p className="text-3xl font-bold tracking-tight text-blue-600">{stats.percentage}%</p>
            <p className="text-sm font-medium text-app-muted mt-1">Overall Attendance</p>
          </CardContent>
        </Card>
      </div>

      {/* History Table */}
      <Card className="border-app-border bg-app-surface shadow-sm overflow-hidden">
        <CardHeader className="bg-app-soft/50 border-b border-app-border">
          <CardTitle className="text-lg">Attendance History</CardTitle>
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
                    <th scope="col" className="px-6 py-4 font-semibold">Date & Time</th>
                    <th scope="col" className="px-6 py-4 font-semibold">Topic</th>
                    <th scope="col" className="px-6 py-4 font-semibold">Batch</th>
                    <th scope="col" className="px-6 py-4 font-semibold">Coach</th>
                    <th scope="col" className="px-6 py-4 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-app-border">
                  {history.map((record: StudentAttendanceHistory) => (
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
                      <td className="px-6 py-4 font-medium">{record.topic}</td>
                      <td className="px-6 py-4 text-app-muted">{record.batchName}</td>
                      <td className="px-6 py-4 text-app-muted">{record.coachName}</td>
                      <td className="px-6 py-4">
                        {record.status === "PRESENT" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-500/15 text-green-600 border border-green-500/20">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Present
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/15 text-red-500 border border-red-500/20">
                            <XCircle className="h-3.5 w-3.5" />
                            Absent
                          </span>
                        )}
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

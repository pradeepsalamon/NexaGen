"use client";

import { useEffect, useState } from "react";
import { Loader2, Users, CalendarX, TrendingUp, Presentation, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { apiFetch } from "@/lib/api";
import { API_ROUTES, type AdminAttendanceDashboard } from "@nexa-chess/types";
import { AttendancePercentBar } from "@/features/attendance/components/AttendancePercentBar";

export default function AdminAttendanceDashboardPage() {
  const [data, setData] = useState<AdminAttendanceDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const result = await apiFetch<AdminAttendanceDashboard>(API_ROUTES.attendance.adminDashboard);
        setData(result);
      } catch (error) {
        console.error("Failed to load attendance dashboard", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadDashboard();
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center min-h-[50vh]">
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
        <h2 className="text-xl font-semibold mb-2">Failed to load data</h2>
        <p className="text-app-muted max-w-md">
          There was an error loading the attendance dashboard.
        </p>
      </div>
    );
  }

  const { today, monthlyTrend } = data;

  return (
    <div className="space-y-6 max-w-6xl p-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-app-text">Platform Attendance</h1>
          <p className="text-app-muted mt-1">Global view of student attendance and live class metrics</p>
        </div>
      </div>

      {/* Today's Stats */}
      <h2 className="text-xl font-semibold mt-8 mb-4 border-b border-app-border pb-2">Today&apos;s Snapshot</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <Card className="border-app-border bg-app-surface shadow-sm">
          <CardContent className="p-5 flex flex-col justify-center h-full">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Presentation className="h-5 w-5 text-blue-500" />
              </span>
            </div>
            <p className="text-3xl font-bold tracking-tight text-blue-600">{today.totalClasses}</p>
            <p className="text-sm font-medium text-app-muted mt-1">Classes Scheduled</p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-sm">
          <CardContent className="p-5 flex flex-col justify-center h-full">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                <span className="relative flex h-3 w-3 mr-1">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
                <span className="text-sm font-bold text-red-500">Live</span>
              </span>
            </div>
            <p className="text-3xl font-bold tracking-tight text-red-500">{today.liveClasses}</p>
            <p className="text-sm font-medium text-app-muted mt-1">Active Classes</p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-sm">
          <CardContent className="p-5 flex flex-col justify-center h-full">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-lg bg-green-500/10 border border-green-500/20">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </span>
            </div>
            <p className="text-3xl font-bold tracking-tight text-green-600">{today.studentsPresent}</p>
            <p className="text-sm font-medium text-app-muted mt-1">Students Attended</p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-sm">
          <CardContent className="p-5 flex flex-col justify-center h-full">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
                <XCircle className="h-5 w-5 text-orange-500" />
              </span>
            </div>
            <p className="text-3xl font-bold tracking-tight text-orange-600">{today.studentsAbsent}</p>
            <p className="text-sm font-medium text-app-muted mt-1">Students Absent</p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-sm hidden lg:block">
          <CardContent className="p-5 flex flex-col justify-center h-full">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                <Users className="h-5 w-5 text-purple-500" />
              </span>
            </div>
            <p className="text-3xl font-bold tracking-tight text-purple-600">{today.totalStudents}</p>
            <p className="text-sm font-medium text-app-muted mt-1">Total Active Students</p>
          </CardContent>
        </Card>
      </div>

      {/* Overall Trend */}
      <h2 className="text-xl font-semibold mt-10 mb-4 border-b border-app-border pb-2">6-Month Trend</h2>
      <Card className="border-app-border bg-app-surface shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-app-background border-b border-app-border text-app-muted">
                <tr>
                  <th scope="col" className="px-6 py-4 font-semibold">Month</th>
                  <th scope="col" className="px-6 py-4 font-semibold">Classes</th>
                  <th scope="col" className="px-6 py-4 font-semibold w-[250px]">Attendance Rate</th>
                  <th scope="col" className="px-6 py-4 font-semibold">Attended / Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border">
                {monthlyTrend.map((trend, i) => (
                  <tr key={i} className="hover:bg-app-soft/50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-app-text font-medium flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-app-muted" />
                      {trend.month}
                    </td>
                    <td className="px-6 py-4">
                      {trend.classes}
                    </td>
                    <td className="px-6 py-4">
                      <AttendancePercentBar percent={trend.percent} />
                    </td>
                    <td className="px-6 py-4 text-app-muted">
                      {trend.attended} / {trend.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      
      {/* Quick Links */}
      <h2 className="text-xl font-semibold mt-10 mb-4 border-b border-app-border pb-2">Quick Actions</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* We would add links to /admin/attendance/reports etc. here */}
        <div className="p-4 border border-app-border rounded-lg bg-app-surface hover:border-primary transition-colors cursor-pointer text-center">
          <p className="font-semibold text-app-text">Generate Reports</p>
          <p className="text-xs text-app-muted mt-1">Export attendance to CSV</p>
        </div>
        <div className="p-4 border border-app-border rounded-lg bg-app-surface hover:border-primary transition-colors cursor-pointer text-center">
          <p className="font-semibold text-app-text">Attendance Policy</p>
          <p className="text-xs text-app-muted mt-1">Configure thresholds</p>
        </div>
        <div className="p-4 border border-app-border rounded-lg bg-app-surface hover:border-primary transition-colors cursor-pointer text-center">
          <p className="font-semibold text-app-text">Class Reports</p>
          <p className="text-xs text-app-muted mt-1">View detailed class logs</p>
        </div>
      </div>
    </div>
  );
}

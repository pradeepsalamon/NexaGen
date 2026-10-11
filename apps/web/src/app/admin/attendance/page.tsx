"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Users, CalendarX, TrendingUp, Presentation, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import { apiFetch } from "@/lib/api";
import { API_ROUTES, type AdminAttendanceDashboard } from "@nexa-chess/types";
import { getWebEnv } from "@nexa-chess/config/web";
import { AttendancePercentBar } from "@/features/attendance/components/AttendancePercentBar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useTableSort } from "@/hooks/useTableSort";
import { SortButton } from "@/components/ui/DataTableSortButton";

const attendanceExportUrl =
  getWebEnv({ NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL })
    .NEXT_PUBLIC_API_URL + API_ROUTES.attendance.adminExport;

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

  const trendRows = useMemo(
    () => data?.monthlyTrend.map((trend, order) => ({ ...trend, order })),
    [data]
  );
  const { rows: monthlyTrend, sortProps } = useTableSort({
    rows: trendRows,
    accessors: {
      attended: (t) => t.attended,
      classes: (t) => t.classes,
      month: (t) => t.order,
      rate: (t) => t.percent
    }
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center min-h-[50dvh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary-ink" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-[50dvh] text-center">
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

  const { today } = data;

  return (
    <div className="space-y-6 max-w-6xl p-4 sm:p-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">Platform Attendance</h1>
          <p className="text-app-muted mt-1">Global view of student attendance and live class metrics</p>
        </div>
      </div>

      {/* Today's Stats */}
      <h2 className="text-xl font-semibold mt-8 mb-4 border-b border-app-border pb-2">Today&apos;s Snapshot</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <Card className="border-app-border bg-app-surface shadow-card">
          <CardContent className="p-5 flex flex-col justify-center h-full">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-control bg-primary/10 border border-primary/20">
                <Presentation className="h-5 w-5 text-primary-ink" />
              </span>
            </div>
            <p className="text-3xl font-bold tracking-tight text-primary-ink">{today.totalClasses}</p>
            <p className="text-sm font-medium text-app-muted mt-1">Classes Scheduled</p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-card">
          <CardContent className="p-5 flex flex-col justify-center h-full">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-control bg-red-500/10 border border-red-500/20">
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

        <Card className="border-app-border bg-app-surface shadow-card">
          <CardContent className="p-5 flex flex-col justify-center h-full">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-control bg-green-500/10 border border-green-500/20">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </span>
            </div>
            <p className="text-3xl font-bold tracking-tight text-green-600">{today.studentsPresent}</p>
            <p className="text-sm font-medium text-app-muted mt-1">Students Attended</p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-card">
          <CardContent className="p-5 flex flex-col justify-center h-full">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-control bg-orange-500/10 border border-orange-500/20">
                <XCircle className="h-5 w-5 text-orange-500" />
              </span>
            </div>
            <p className="text-3xl font-bold tracking-tight text-orange-600">{today.studentsAbsent}</p>
            <p className="text-sm font-medium text-app-muted mt-1">Students Absent</p>
          </CardContent>
        </Card>

        <Card className="border-app-border bg-app-surface shadow-card">
          <CardContent className="p-5 flex flex-col justify-center h-full">
            <div className="flex items-center justify-between mb-3">
              <span className="p-2 rounded-control bg-purple-500/10 border border-purple-500/20">
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
      <Card className="border-app-border bg-app-surface shadow-card overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table className="w-full text-sm text-left">
              <TableHeader className="text-xs uppercase bg-app-background border-b border-app-border text-app-muted">
                <TableRow>
                  <TableHead scope="col" className="px-3 py-3 md:px-6 md:py-4 font-semibold"><SortButton label="Month" {...sortProps("month")} /></TableHead>
                  <TableHead scope="col" className="px-3 py-3 md:px-6 md:py-4 font-semibold"><SortButton label="Classes" {...sortProps("classes")} /></TableHead>
                  <TableHead scope="col" className="px-3 py-3 md:px-6 md:py-4 font-semibold md:w-[250px]"><SortButton label="Attendance Rate" {...sortProps("rate")} /></TableHead>
                  <TableHead scope="col" className="px-3 py-3 md:px-6 md:py-4 font-semibold"><SortButton label="Attended / Total" {...sortProps("attended")} /></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-app-border">
                {monthlyTrend.map((trend, i) => (
                  <TableRow key={i} className="hover:bg-app-soft/50 transition-colors">
                    <TableCell className="text-left px-3 py-3 md:px-6 md:py-4 whitespace-nowrap text-app-text font-medium flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-app-muted" />
                      {trend.month}
                    </TableCell>
                    <TableCell className="text-left px-3 py-3 md:px-6 md:py-4">
                      {trend.classes}
                    </TableCell>
                    <TableCell className="text-left px-3 py-3 md:px-6 md:py-4">
                      <AttendancePercentBar percent={trend.percent} />
                    </TableCell>
                    <TableCell className="text-left px-3 py-3 md:px-6 md:py-4 text-app-muted">
                      {trend.attended} / {trend.total}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      {/* Quick Links */}
      <h2 className="text-xl font-semibold mt-10 mb-4 border-b border-app-border pb-2">Quick Actions</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link href="/admin/attendance/completed-classes" className="p-4 border border-app-border rounded-control bg-app-surface hover:border-primary transition-colors cursor-pointer text-center">
          <p className="font-semibold text-app-text">Completed Classes</p>
          <p className="text-xs text-app-muted mt-1">View all completed classes with attendance</p>
        </Link>
        <Link href="/admin/attendance/coaches" className="p-4 border border-app-border rounded-control bg-app-surface hover:border-primary transition-colors cursor-pointer text-center">
          <p className="font-semibold text-app-text">Coach Teaching Report</p>
          <p className="text-xs text-app-muted mt-1">Track actual teaching hours per coach</p>
        </Link>
        <a href={attendanceExportUrl} rel="noopener" target="_blank" className="p-4 border border-app-border rounded-control bg-app-surface hover:border-primary transition-colors cursor-pointer text-center">
          <p className="font-semibold text-app-text">Export CSV</p>
          <p className="text-xs text-app-muted mt-1">Download attendance report</p>
        </a>
      </div>
    </div>
  );
}
